const Report = require('../models/Report');
const { renderReportsPdfs, mergePdfBuffers } = require('../utils/reportPdf');
const { resolveAttachableReports, mergedPdfFileName } = require('../utils/reportAttachments');

// Shared prefix for both the report-email and report-pdf jobs: load the
// primary report, re-resolve the attachable extras (re-checked at run time,
// not just trusted from enqueue time — a report could change status between
// enqueue and processing), render every report concurrently, merge into one
// PDF. Mirrors exactly what the old synchronous route handlers did inline.
async function renderReports({ primaryReportId, includeReportIds, user }) {
  const primary = await Report.findById(primaryReportId);
  if (!primary) {
    const err = new Error('Report not found');
    err.code = 'REPORT_NOT_FOUND';
    throw err;
  }
  if (primary.status?.value !== 'signed') {
    const err = new Error('Only a signed report can be rendered');
    err.code = 'REPORT_NOT_SIGNED';
    throw err;
  }

  const resolved = await resolveAttachableReports(primary, includeReportIds || []);
  if (!resolved.ok) {
    const err = new Error(resolved.message);
    err.code = 'ATTACHMENT_INVALID';
    throw err;
  }

  const allReports = [primary, ...resolved.extras];
  const buffers = await renderReportsPdfs(allReports.map((r) => r._id), user);
  const mergedPdf = await mergePdfBuffers(buffers);
  const filename = mergedPdfFileName(primary, allReports.length);

  return { primary, allReports, mergedPdf, filename };
}

module.exports = { renderReports };
