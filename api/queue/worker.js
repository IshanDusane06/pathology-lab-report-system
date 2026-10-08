const { Worker } = require('bullmq');
const { createBullConnection } = require('./connection');
const { reportEmailJob } = require('../jobs/reportEmail');
const { reportPdfJob } = require('../jobs/reportPdf');
const { signatureReverifyJob } = require('../jobs/signatureReverify');
const { publishJobEvent } = require('../events/publisher');
const { closeBrowser } = require('../utils/reportPdf');
const pdfStore = require('../jobs/pdfStore');
const {
  markActive,
  recordAttempt,
  completeActivity,
  failActivity,
} = require('../utils/jobActivity');

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

// Maps each job's documented return value onto the JobActivity result fields.
function mapReturnValue(jobName, result) {
  if (!result) return {};
  if (jobName === 'report-email') {
    return { recipient: result.recipient, messageId: result.messageId || null };
  }
  if (jobName === 'report-pdf') {
    return { filename: result.filename, bytes: result.bytes };
  }
  return {
    checked: result.checked,
    reportsScanned: result.reportsScanned,
    mismatchCount: result.mismatchCount,
  };
}

// The single write point for every job outcome: it publishes the live SSE
// event AND persists the durable JobActivity row. Reads job.name per-event
// rather than a fixed label, since one worker on the report-delivery queue
// processes two different job names.
function wireJobOutcomeHandling(worker) {
  worker.on('active', (job) => {
    if (!job?.data?.activityId) return;
    markActive(job.data.activityId);
  });

  worker.on('completed', (job, result) => {
    const activityId = job.data?.activityId;
    if (activityId) {
      completeActivity(activityId, {
        attempts: job.attemptsMade || 1,
        result: mapReturnValue(job.name, result),
        resultExpiresAt:
          job.name === 'report-pdf'
            ? new Date(Date.now() + pdfStore.ttlSeconds() * 1000)
            : null,
      });
    }

    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, {
      jobId: job.id,
      activityId: activityId || null,
      name: job.name,
      status: 'completed',
      final: true,
      data: result,
    }).catch((err) =>
      console.error(`Failed to publish completion for ${job.name} job ${job.id}:`, err.message)
    );
  });

  worker.on('failed', (job, error) => {
    if (!job) return;

    // BullMQ emits 'failed' on EVERY attempt, not just the last one — its
    // moveToFailed runs each time and branches internally to retry. So a
    // 3-attempt email fires this three times. Only the terminal one ends the
    // row; the earlier ones just bump the attempt count, which is what keeps
    // one user action as one feed row.
    const terminal = (job.attemptsMade || 0) >= (job.opts?.attempts || 1);
    const activityId = job.data?.activityId;
    const errorCode = error?.name === 'UnrecoverableError' ? 'UnrecoverableError' : error?.code || null;

    if (activityId) {
      if (terminal) {
        failActivity(activityId, {
          attempts: job.attemptsMade || 1,
          error: error?.message,
          errorCode,
        });
      } else {
        recordAttempt(activityId, {
          attempts: job.attemptsMade || 1,
          error: error?.message,
          errorCode,
        });
      }
    }

    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, {
      jobId: job.id,
      activityId: activityId || null,
      name: job.name,
      status: 'failed',
      // Without this the client cannot tell an intermediate retry from a
      // real failure, and would show "failed" while attempt 2 of 3 is still
      // pending.
      final: terminal,
      data: { failedReason: error?.message || 'Job failed', willRetry: !terminal },
    }).catch((err) =>
      console.error(`Failed to publish failure for ${job.name} job ${job.id}:`, err.message)
    );
  });

  worker.on('progress', (job, progress) => {
    const userId = job.data?.actor?.userId;
    if (!userId) return;
    publishJobEvent(userId, {
      jobId: job.id,
      activityId: job.data?.activityId || null,
      name: job.name,
      status: 'progress',
      final: false,
      data: progress,
    }).catch((err) =>
      console.error(`Failed to publish progress for ${job.name} job ${job.id}:`, err.message)
    );
  });
}

function startWorkers() {
  if (reportDeliveryWorker || signatureReverifyWorker) return;

  reportDeliveryWorker = new Worker('report-delivery', processReportDeliveryJob, {
    connection: createBullConnection(),
    concurrency: reportWorkerConcurrency(),
  });
  wireJobOutcomeHandling(reportDeliveryWorker);

  signatureReverifyWorker = new Worker('signature-reverify', signatureReverifyJob, {
    connection: createBullConnection(),
    concurrency: 1,
  });
  wireJobOutcomeHandling(signatureReverifyWorker);

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
