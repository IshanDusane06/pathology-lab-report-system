// Shared pagination parsing. Previously duplicated verbatim in routes/reports.js
// and routes/audit.js; extracted here rather than adding a third copy.
function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

module.exports = { parsePagination };
