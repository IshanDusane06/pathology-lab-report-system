const crypto = require('crypto');

// Deterministic jobId so a double-click (or a retried client request) joins
// the already-enqueued job instead of creating a duplicate — BullMQ's
// queue.add() with an existing jobId returns the existing job rather than
// erroring or creating a second one.
function hashParts(parts) {
  return crypto.createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 24);
}

// No ':' in the id — BullMQ uses ':' as its own Redis-key delimiter and
// rejects a custom jobId containing one ("Custom Id cannot contain :").
function emailJobId(primaryReportId, includeReportIds, recipient) {
  const sortedIncludes = [...(includeReportIds || [])].map(String).sort();
  return `email-${hashParts([String(primaryReportId), sortedIncludes.join(','), recipient.trim().toLowerCase()])}`;
}

function pdfJobId(primaryReportId, includeReportIds) {
  const sortedIncludes = [...(includeReportIds || [])].map(String).sort();
  return `pdf-${hashParts([String(primaryReportId), sortedIncludes.join(',')])}`;
}

// Fixed, lab-wide singleton — there is only ever one "re-verify everything"
// job in flight at a time.
const REVERIFY_ALL_JOB_ID = 'reverify-all';

module.exports = { emailJobId, pdfJobId, REVERIFY_ALL_JOB_ID };
