// Standalone worker process — for a split-process deployment
// (RUN_WORKER_INLINE=false). Not wired into index.js's app.listen at all:
// its own dotenv, its own Mongo connection, no Express. Run with
// `npm run worker`.
const dotenv = require('dotenv');
dotenv.config();

const mongoose = require('mongoose');
const { pingRedis } = require('./queue/connection');
const { startWorkers, stopWorkers } = require('./queue/worker');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Worker connected to MongoDB');

  await pingRedis();
  console.log('Worker connected to Redis');

  // In a split-process deployment the API process holds the SSE
  // connections and subscribes to the job-events Redis channel; this
  // process only needs to publish onto it (via publishJobEvent, wired in
  // queue/worker.js's completed/failed/progress listeners), not subscribe.
  startWorkers();
  console.log('Worker process ready');
}

main().catch((err) => {
  console.error('Worker process failed to start:', err);
  process.exit(1);
});

async function shutdown() {
  console.log('Worker process shutting down...');
  await stopWorkers();
  await mongoose.connection.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
