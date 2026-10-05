const IORedis = require('ioredis');

function redisUrl() {
  return process.env.REDIS_URL || 'redis://127.0.0.1:6379';
}

// BullMQ's blocking commands (BLPOP etc.) require this — without it ioredis
// gives up retrying a blocking call after its default retry budget and
// BullMQ throws on construction. This is the #1 first-run gotcha with
// BullMQ + ioredis.
function bullConnectionOptions() {
  return { maxRetriesPerRequest: null };
}

// One client per BullMQ Queue/Worker instance — they each manage their own
// connection lifecycle internally, so this just hands back fresh options,
// not a shared client.
function createBullConnection() {
  return new IORedis(redisUrl(), bullConnectionOptions());
}

// A plain command client for everything that ISN'T a BullMQ queue/worker —
// the PDF result blob store (pdfStore.js), the job-event publisher, and
// pingRedis() below.
//
// retryStrategy stays UNBOUNDED (never returns null) so the underlying
// connection keeps trying to reconnect in the background and self-heals
// once Redis comes back — a retryStrategy that gives up after N attempts
// kills the connection permanently, and it does NOT come back on its own
// once Redis does (confirmed directly: the fast-fail 503 path kept firing
// even minutes after Redis was back up, because the connection itself had
// already entered ioredis's terminal 'end' state).
//
// maxRetriesPerRequest: 1 is the actual fast-fail mechanism: it bounds how
// long any ONE command (ping, in pingRedis()'s case) waits through
// reconnect attempts before its promise rejects, independent of whether the
// connection keeps trying in the background. This is what lets the enqueue
// routes' 503 guard fail in milliseconds instead of hanging on ioredis's
// otherwise-unbounded reconnect loop — without unbounding the connection's
// own long-term resilience.
let commandClient = null;
function getCommandClient() {
  if (!commandClient) {
    commandClient = new IORedis(redisUrl(), {
      connectTimeout: 1000,
      maxRetriesPerRequest: 1,
    });
    // Reconnect attempts emit 'error' repeatedly while Redis is down —
    // without a listener, an unhandled 'error' event crashes the process.
    commandClient.on('error', () => {});
  }
  return commandClient;
}

// A subscriber-mode client cannot run normal commands, so pub/sub needs its
// own dedicated connection, separate from the command client above.
function createSubscriberClient() {
  return new IORedis(redisUrl());
}

async function pingRedis() {
  const client = getCommandClient();
  await client.ping();
}

module.exports = {
  redisUrl,
  bullConnectionOptions,
  createBullConnection,
  getCommandClient,
  createSubscriberClient,
  pingRedis,
};
