const mongoose = require('mongoose');

// One row per user *action* — not per automatic retry. A send that BullMQ
// retries three times is one row with attempts: 3 (see queue/worker.js).
//
// Status here is deliberately BullMQ's own vocabulary, so mapping from a job's
// state is identity. The richer labels the UI shows (Ready / Downloaded /
// Expired / All clear) are DERIVED at read time by utils/jobActivity.js —
// never stored. "Ready -> Expired" happens by the passage of time with no
// event to hook, so storing it would need a sweeper job to maintain a value
// that is a pure function of resultExpiresAt and now. Store events, derive
// labels.
const jobActivitySchema = new mongoose.Schema({
  kind: { type: String, enum: ['email', 'pdf', 'sweep'], required: true },

  // 'direct' is the legacy synchronous GET /:id/pdf route, which has no job at
  // all — instrumented so PDF rows aren't structurally empty before the
  // frontend migrates onto the queued POST /:id/pdf-jobs route.
  source: { type: String, enum: ['queue', 'direct'], default: 'queue' },

  // BullMQ job id. Indexed but NOT unique: enqueueWithDedup re-adds the same
  // deterministic id for a deliberate resend, so this does not identify a row.
  // _id (minted in the route before enqueue, carried in job.data.activityId)
  // is the real join key.
  jobId: { type: String, default: null },

  status: {
    type: String,
    enum: ['queued', 'active', 'completed', 'failed'],
    default: 'queued',
  },
  attempts: { type: Number, default: 0 },
  maxAttempts: { type: Number, default: 1 },
  error: { type: String, default: null },
  // e.g. 'UnrecoverableError' for a permanently rejected mailbox. Without it
  // the UI would offer Retry on a send that can only ever fail again.
  errorCode: { type: String, default: null },

  // Denormalised for the same reason AuditLog.actor and Report.deliveries[].sentBy
  // are: the row is a historical fact and must survive the user being renamed,
  // demoted or deleted. Also the role-scoping key.
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String },
    role: { type: String },
  },

  // The replay payload. Every retry/resend button re-POSTs to the existing
  // enqueue routes, so the row carries exactly what those routes need — which
  // is why this feature adds no new action endpoints.
  request: {
    primaryReportId: { type: mongoose.Schema.Types.ObjectId, ref: 'Report', default: null },
    includeReportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
    recipient: { type: String, default: null },
  },

  // Denormalised, not joined: search has to cover patient name (Report has no
  // index on patientInfo.name), reports are deletable and this history must
  // outlive them, and Report.patientInfo is already an immutable snapshot by
  // the same logic.
  subject: {
    // Every report in the job. Written identically on success AND failure,
    // which structurally fixes the primary-only failure asymmetry that
    // Report.deliveries[] has. Multikey-indexed — drives the By-report view.
    reportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
    reportCount: { type: Number, default: 0 },
    patientName: { type: String, default: null },
    patientCode: { type: String, default: null },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },
    reportTypeCodes: [{ type: String }],
    // Sweeps only ('Whole lab') — keeps a sweep row renderable by the same
    // cell component without a null-patient special case.
    label: { type: String, default: null },
  },

  // Mapped straight from each job's existing return value.
  result: {
    recipient: { type: String, default: null },
    messageId: { type: String, default: null },
    filename: { type: String, default: null },
    bytes: { type: Number, default: null },
    checked: { type: Number, default: null },
    reportsScanned: { type: Number, default: null },
    mismatchCount: { type: Number, default: null },
  },

  // Pre-lowercased concat of patient name/code, recipient, filename, type
  // codes and actor name — the single field free-text search regexes.
  searchText: { type: String, default: '' },

  // `retried` is redundant with retriedByActivityId on purpose: it makes the
  // hottest query in the feature ("failed and not retried yet" — the nav badge,
  // hit on every page load) a plain equality on an ordinary compound index.
  retried: { type: Boolean, default: false },
  retriedByActivityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  retryOfActivityId: { type: mongoose.Schema.Types.ObjectId, default: null },

  // createdAt IS queuedAt — no separate field. Explicit default rather than
  // timestamps:true, matching Report / AuditLog / Patient / LabSettings.
  createdAt: { type: Date, default: Date.now },
  startedAt: { type: Date, default: null },
  finishedAt: { type: Date, default: null },
  downloadedAt: { type: Date, default: null },
  // Separate from actor: an Admin can read another user's job state, so
  // "started by X, downloaded by Y" is a reachable and honest record.
  downloadedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, default: null },
    role: { type: String, default: null },
  },
  // finishedAt + PDF_RESULT_TTL_SECONDS. Drives Ready vs Expired and the
  // live countdown.
  resultExpiresAt: { type: Date, default: null },
});

// Feed, admin scope=everyone, unfiltered.
jobActivitySchema.index({ createdAt: -1 });
// Every Doctor/Technician request (always actor-scoped) and scope=mine.
jobActivitySchema.index({ 'actor.userId': 1, createdAt: -1 });
// Status tabs lab-wide; "In progress" card; "Emails sent today".
jobActivitySchema.index({ status: 1, createdAt: -1 });
// Type filter + status tab combined (also serves kind-only as a prefix).
jobActivitySchema.index({ kind: 1, status: 1, createdAt: -1 });
// "Failed (not retried yet)" card, alert banner, nav badge — hottest query.
jobActivitySchema.index({ status: 1, retried: 1, createdAt: -1 });
// Multikey — the By-report aggregation and a future per-report panel.
jobActivitySchema.index({ 'subject.reportIds': 1, createdAt: -1 });
// Resolving a dedup'd request to its row; the auto-retry-link updateMany.
jobActivitySchema.index({ jobId: 1 });
// "Ready to download" card — bounded range scan on the tail. Sparse because
// only kind:'pdf' rows carry it.
jobActivitySchema.index({ resultExpiresAt: 1 }, { sparse: true });

// Deliberately no partialFilterExpression variants (MongoDB raises
// IndexOptionsConflict for two indexes sharing a key pattern but differing in
// options) and no index on searchText (an unanchored regex cannot use one, so
// it would be pure write cost).
//
// Retention is unbounded by design. If a busy lab ever outgrows it, the entire
// change is one line here and nothing else in the feature depends on it:
//   jobActivitySchema.index({ createdAt: 1 }, { expireAfterSeconds: 60*60*24*180 });

module.exports = mongoose.model('JobActivity', jobActivitySchema);
