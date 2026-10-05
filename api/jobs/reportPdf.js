const User = require('../models/User');
const { renderReports } = require('./renderReports');
const pdfStore = require('./pdfStore');

// Fails loudly rather than letting a pathological merge silently fill Redis.
const MAX_RESULT_BYTES = 25 * 1024 * 1024;

async function reportPdfJob(job) {
  const { primaryReportId, includeReportIds, actor } = job.data;

  const actorUser = await User.findById(actor.userId);
  if (!actorUser) {
    const err = new Error('The user who requested this render no longer exists');
    err.code = 'USER_GONE';
    throw err;
  }

  const { mergedPdf, filename } = await renderReports({
    primaryReportId,
    includeReportIds,
    user: actorUser,
  });

  if (mergedPdf.length > MAX_RESULT_BYTES) {
    const err = new Error(`Merged PDF is ${mergedPdf.length} bytes, over the ${MAX_RESULT_BYTES} byte limit`);
    err.code = 'RESULT_TOO_LARGE';
    throw err;
  }

  await pdfStore.put(job.id, mergedPdf);

  // Only a small summary goes into the job's returnvalue / SSE payload —
  // never the PDF bytes themselves, which stay in pdfStore.
  return { resultKey: job.id, filename, bytes: mergedPdf.length };
}

module.exports = { reportPdfJob };
