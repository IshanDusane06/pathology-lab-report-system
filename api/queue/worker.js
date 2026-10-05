const { Worker } = require('bullmq');
const { createBullConnection } = require('./connection');
const { reportEmailJob } = require('../jobs/reportEmail');
const { reportPdfJob } = require('../jobs/reportPdf');
const { signatureReverifyJob } = require('../jobs/signatureReverify');
const { publishJobEvent } = require('../events/publisher');
const { closeBrowser } = require('../utils/reportPdf');

let reportDeliveryWorker = null;
let signatureReverifyWorker = null;

function reportWorkerConcurrency() {
  return Number(process.env.REPORT_WORKER_CONCURRENCY) || 2;
}

// Dispatches on job.name — report-email and report-pdf share one queue (and
// so one concurrency budget over the scarce Chromium-page resource) but
// diverge completely after rendering, with different retry semantics
// (see queue/queues.js JOB_OPTIONS).
async function processReportDeliveryJob(job) {
  if (job.name === 'report-email') return reportEmailJob(job);
  if (job.name === 'report-pdf') return reportPdfJob(job);
  throw new Error(`Unknown job name on report-delivery queue: ${job.name}`);
}

// Reads job.name per-event rather than a fixed label, since a single worker
// on the report-delivery queue processes two different job names.
function wireEventPublishing(worker) {
  worker.on('completed', (job, result) => {
    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, { jobId: job.id, name: job.name, status: 'completed', data: result }).catch(
      (err) => console.error(`Failed to publish completion for ${job.name} job ${job.id}:`, err.message)
    );
  });

  worker.on('failed', (job, error) => {
    if (!job) return;
    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, {
      jobId: job.id,
      name: job.name,
      status: 'failed',
      data: { failedReason: error?.message || 'Job failed' },
    }).catch((err) => console.error(`Failed to publish failure for ${job.name} job ${job.id}:`, err.message));
  });

  worker.on('progress', (job, progress) => {
    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, { jobId: job.id, name: job.name, status: 'progress', data: progress }).catch(
      (err) => console.error(`Failed to publish progress for ${job.name} job ${job.id}:`, err.message)
    );
  });
}

function startWorkers() {
  if (reportDeliveryWorker || signatureReverifyWorker) return;

  reportDeliveryWorker = new Worker('report-delivery', processReportDeliveryJob, {
    connection: createBullConnection(),
    concurrency: reportWorkerConcurrency(),
  });
  wireEventPublishing(reportDeliveryWorker);

  signatureReverifyWorker = new Worker('signature-reverify', signatureReverifyJob, {
    connection: createBullConnection(),
    concurrency: 1,
  });
  wireEventPublishing(signatureReverifyWorker);

  console.log('BullMQ workers started (report-delivery, signature-reverify)');
}

async function stopWorkers() {
  await Promise.all(
    [reportDeliveryWorker, signatureReverifyWorker].filter(Boolean).map((w) => w.close())
  );
  reportDeliveryWorker = null;
  signatureReverifyWorker = null;
  await closeBrowser();
}

module.exports = { startWorkers, stopWorkers };
