const { Queue } = require('bullmq');
const { createBullConnection, pingRedis } = require('./connection');

// One queue for both report-email and report-pdf: they share the same
// scarce resource (concurrent Chromium pages via renderReportsPdfs) and the
// same render→merge prefix, so one concurrency budget covers both. They
// diverge after the merge — see api/queue/worker.js for the per-job-name
// retry policy that split requires.
const reportDeliveryQueue = new Queue('report-delivery', {
  connection: createBullConnection(),
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 200 },
    removeOnFail: { age: 86400 },
  },
});

// Isolated so a long CPU-bound sweep can never occupy a render slot, and so
// its single-attempt retry policy (see signatureReverify job) is independent
// of the render queue's multi-attempt policy.
const signatureReverifyQueue = new Queue('signature-reverify', {
  connection: createBullConnection(),
  defaultJobOptions: {
    removeOnComplete: { age: 3600, count: 50 },
    removeOnFail: { age: 86400 },
  },
});

const JOB_OPTIONS = {
  reportPdf: { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
  reportEmail: { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
  reverifyAll: { attempts: 1 },
};

module.exports = {
  reportDeliveryQueue,
  signatureReverifyQueue,
  JOB_OPTIONS,
  pingRedis,
};
