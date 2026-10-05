const Report = require('../models/Report');
const LabSettings = require('../models/LabSettings');
const User = require('../models/User');
const { computeHmac } = require('../utils/reportSignature');
const { logEvent } = require('../utils/auditLog');

const BATCH_SIZE = 200;
const MAX_MISMATCH_DETAIL = 100;

async function getOrCreateSettings() {
  let settings = await LabSettings.findOne();
  if (!settings) {
    settings = await LabSettings.create({});
  }
  return settings;
}

// Re-verify every recorded signature's HMAC against its stored content hash
// — same integrity check as the old synchronous route (see its comment:
// this is HMAC-over-stored-hash, NOT a re-derivation of the content hash
// from the report's current fields, which would spuriously flag a
// legitimately-edited-since-signing report). The only change from the old
// handler is HOW it iterates: a lean cursor in batches instead of loading
// every signed report's full document into memory at once, with a yield
// between batches so this doesn't block the event loop for the sweep's
// entire duration (this worker runs in-process with Express by default).
async function signatureReverifyJob(job) {
  const { actor } = job.data;
  const actorUser = actor?.userId ? await User.findById(actor.userId) : null;

  let checked = 0;
  let reportsScanned = 0;
  const mismatches = [];

  const cursor = Report.find({ 'signatures.0': { $exists: true } })
    .select('_id signatures')
    .lean()
    .cursor();

  let batch = [];
  async function flushBatch() {
    for (const report of batch) {
      (report.signatures || []).forEach((sig, index) => {
        if (!sig.contentHash || !sig.hmac || sig.algorithm === 'legacy-backfill') return;
        checked += 1;
        const expectedHmac = computeHmac(sig.contentHash);
        if (expectedHmac !== sig.hmac) {
          mismatches.push({ reportId: report._id, signatureIndex: index });
        }
      });
      reportsScanned += 1;
    }
    await job.updateProgress({ reportsScanned, checked, mismatches: mismatches.length });
    // Mandatory in the in-process topology: computeHmac is synchronous Node
    // crypto, so without yielding here this sweep blocks every other
    // request for its entire duration instead of just one.
    await new Promise((resolve) => setImmediate(resolve));
    batch = [];
  }

  for await (const report of cursor) {
    batch.push(report);
    if (batch.length >= BATCH_SIZE) {
      await flushBatch();
    }
  }
  if (batch.length) {
    await flushBatch();
  }

  const settings = await getOrCreateSettings();
  settings.lastVerification = { at: new Date(), checked, mismatches: mismatches.length };
  await settings.save();

  // This sweep previously wrote no audit entry at all — a real gap for a
  // security-integrity operation. 'Signature' is an existing category.
  await logEvent({
    actor: actorUser || { userId: actor?.userId, name: 'System', role: 'Admin' },
    action: 'labSettings.reverify',
    category: 'Signature',
    description: `Re-verified ${checked} signature(s) across ${reportsScanned} report(s) — ${mismatches.length} mismatch(es)`,
  }).catch(() => {});

  return {
    checked,
    reportsScanned,
    mismatchCount: mismatches.length,
    // Full count is persisted above; only a capped sample goes into the
    // job's returnvalue / SSE payload so a compromised DB can't produce a
    // multi-megabyte push.
    mismatches: mismatches.slice(0, MAX_MISMATCH_DETAIL),
    verifiedAt: settings.lastVerification.at,
  };
}

module.exports = { signatureReverifyJob };
