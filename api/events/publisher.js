const { getCommandClient, createSubscriberClient } = require('../queue/connection');
const hub = require('./hub');

const CHANNEL = 'patho:job-events';

// The worker's completed/failed/progress listeners call this rather than
// hub.publishLocal directly. In the default in-process topology that's a
// Redis round trip you could technically skip — but routing through Redis
// pub/sub from day one is what makes "move the worker to its own
// process/container" (RUN_WORKER_INLINE=false) a config change later,
// instead of a rewrite of the notification path.
async function publishJobEvent(userId, event) {
  const client = getCommandClient();
  await client.publish(CHANNEL, JSON.stringify({ userId, event }));
}

// Called once at API-process boot. Subscriber-mode ioredis clients can't run
// other commands, hence the dedicated connection.
let subscriberClient = null;
function subscribeJobEvents() {
  if (subscriberClient) return subscriberClient;
  subscriberClient = createSubscriberClient();
  // Unlike the command client in queue/connection.js, this one SHOULD keep
  // retrying forever in the background (it's not on any request's critical
  // path) — just needs a listener so repeated reconnect errors don't crash
  // the process via an unhandled 'error' event.
  subscriberClient.on('error', () => {});
  subscriberClient.subscribe(CHANNEL).catch((err) => {
    console.error('Failed to subscribe to job-events channel:', err.message);
  });
  subscriberClient.on('message', (channel, message) => {
    if (channel !== CHANNEL) return;
    try {
      const { userId, event } = JSON.parse(message);
      hub.publishLocal(userId, event);
    } catch (err) {
      console.error('Malformed job-event message:', err.message);
    }
  });
  return subscriberClient;
}

module.exports = { publishJobEvent, subscribeJobEvents };
