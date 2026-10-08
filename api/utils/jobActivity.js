const JobActivity = require('../models/JobActivity');

// Same posture as utils/auditLog.js: recording history must never break the
// thing it is describing. Every write here logs and swallows its own errors.

// A queued/active row older than this reads as 'stalled'. It is NOT
// reconciliation — the row never learns what actually happened — but it stops
// a row orphaned by a process death from sitting as "In progress" forever.
const STALE_MINUTES = Number(process.env.ACTIVITY_STALE_MINUTES) || 15;

function buildSearchText({ patientName, patientCode, recipient, filename, reportTypeCodes, actorName }) {
  return [patientName, patientCode, recipient, filename, ...(reportTypeCodes || []), actorName]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

// Denormalises the report/patient facts a feed row needs, so rendering never
// joins back to reports (which are deletable) — see the model's comments.
function buildSubject({ allReports = [], patient = null, label = null }) {
  const primary = allReports[0] || null;
  const patientName = patient?.name || primary?.patientInfo?.name || null;
  return {
    reportIds: allReports.map((r) => r._id),
    reportCount: allReports.length,
    patientName,
    patientCode: patient?.patientId || null,
    patientId: primary?.patientId || patient?._id || null,
    reportTypeCodes: allReports.map((r) => r.reportTypeCode).filter(Boolean),
    label,
  };
}

async function startActivity({
  activityId, kind, source = 'queue', jobId = null, actor,
  request = {}, subject = {}, maxAttempts = 1, status = 'queued',
  result = {}, finishedAt = null, downloadedAt = null, downloadedBy = null,
}) {
  try {
    const searchText = buildSearchText({
      patientName: subject.patientName,
      patientCode: subject.patientCode,
      recipient: request.recipient || result.recipient,
      filename: result.filename,
      reportTypeCodes: subject.reportTypeCodes,
      actorName: actor?.name,
    });

    // $setOnInsert + upsert so a repeat call can never clobber an existing
    // row (e.g. a route retrying its own write). The finish writes are
    // deliberately NOT upserts — see completeActivity.
    await JobActivity.updateOne(
      { _id: activityId },
      {
        $setOnInsert: {
          kind, source, jobId, status, attempts: 0, maxAttempts,
          actor: {
            userId: actor._id || actor.userId,
            name: actor.name,
            role: actor.role,
          },
          request: {
            primaryReportId: request.primaryReportId || null,
            includeReportIds: request.includeReportIds || [],
            recipient: request.recipient || null,
          },
          subject: {
            reportIds: subject.reportIds || [],
            reportCount: subject.reportCount || 0,
            patientName: subject.patientName || null,
            patientCode: subject.patientCode || null,
            patientId: subject.patientId || null,
            reportTypeCodes: subject.reportTypeCodes || [],
            label: subject.label || null,
          },
          result: {
            recipient: result.recipient || null,
            messageId: result.messageId || null,
            filename: result.filename || null,
            bytes: result.bytes ?? null,
            checked: result.checked ?? null,
            reportsScanned: result.reportsScanned ?? null,
            mismatchCount: result.mismatchCount ?? null,
          },
          searchText,
          retryOfActivityId: request.retryOfActivityId || null,
          createdAt: new Date(),
          finishedAt,
          downloadedAt,
          downloadedBy: downloadedBy || { userId: null, name: null, role: null },
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('Error starting job activity:', error);
  }
}

async function markActive(activityId) {
  if (!activityId) return;
  try {
    await JobActivity.updateOne(
      { _id: activityId, status: 'queued' },
      { $set: { status: 'active', startedAt: new Date() } }
    );
  } catch (error) {
    console.error('Error marking job activity active:', error);
  }
}

// An intermediate (non-terminal) BullMQ attempt. Bumps the count and refreshes
// the error, but leaves the row in flight — this is what keeps a 3-attempt
// retry as ONE row rather than three.
async function recordAttempt(activityId, { attempts, error, errorCode = null }) {
  if (!activityId) return;
  try {
    await JobActivity.updateOne(
      { _id: activityId },
      { $set: { attempts, error: error || null, errorCode, status: 'active' } }
    );
  } catch (err) {
    console.error('Error recording job activity attempt:', err);
  }
}

async function completeActivity(activityId, { attempts, result = {}, resultExpiresAt = null }) {
  if (!activityId) return;
  try {
    const set = {
      status: 'completed',
      attempts,
      finishedAt: new Date(),
      error: null,
      errorCode: null,
    };
    for (const [key, value] of Object.entries(result)) {
      if (value !== undefined) set[`result.${key}`] = value;
    }
    if (resultExpiresAt) set.resultExpiresAt = resultExpiresAt;

    // Deliberately NOT an upsert: only the enqueueing route knows this job's
    // kind, actor and subject, so a completion arriving for a row that does
    // not exist must write nothing rather than conjure a partial row with no
    // kind or actor — which renders as a broken entry for every user and is
    // strictly worse than losing the result.
    const row = await JobActivity.findOneAndUpdate(
      { _id: activityId },
      { $set: set },
      { new: true }
    );

    // The filename/recipient only become known at completion for some kinds,
    // so the search index has to be rebuilt once the result lands.
    if (row) {
      await JobActivity.updateOne(
        { _id: activityId },
        {
          $set: {
            searchText: buildSearchText({
              patientName: row.subject?.patientName,
              patientCode: row.subject?.patientCode,
              recipient: row.result?.recipient || row.request?.recipient,
              filename: row.result?.filename,
              reportTypeCodes: row.subject?.reportTypeCodes,
              actorName: row.actor?.name,
            }),
          },
        }
      );
    }
  } catch (error) {
    console.error('Error completing job activity:', error);
  }
}

// Terminal failure only — see queue/worker.js for the attemptsMade check that
// decides between this and recordAttempt.
async function failActivity(activityId, { attempts, error, errorCode = null }) {
  if (!activityId) return;
  try {
    await JobActivity.updateOne(
      { _id: activityId },
      {
        $set: {
          status: 'failed',
          attempts,
          error: error || null,
          errorCode,
          finishedAt: new Date(),
        },
      }
    );
  } catch (err) {
    console.error('Error failing job activity:', err);
  }
}

async function markDownloaded(activityId, user) {
  if (!activityId) return;
  try {
    await JobActivity.updateOne(
      { _id: activityId },
      {
        $set: {
          downloadedAt: new Date(),
          downloadedBy: { userId: user?._id, name: user?.name, role: user?.role },
        },
      }
    );
  } catch (error) {
    console.error('Error marking job activity downloaded:', error);
  }
}

// Flips a row whose countdown had not quite hit zero to expired, so it stops
// offering a Download that would only 410 again.
async function markExpired(activityId) {
  if (!activityId) return;
  try {
    await JobActivity.updateOne(
      { _id: activityId, downloadedAt: null },
      { $set: { resultExpiresAt: new Date() } }
    );
  } catch (error) {
    console.error('Error marking job activity expired:', error);
  }
}

async function linkRetry({ oldActivityId, newActivityId }) {
  if (!oldActivityId || !newActivityId) return;
  try {
    await JobActivity.updateOne(
      { _id: oldActivityId },
      { $set: { retried: true, retriedByActivityId: newActivityId } }
    );
  } catch (error) {
    console.error('Error linking job activity retry:', error);
  }
}

// Catches retries started from anywhere else (e.g. the report page), which
// carry no explicit retryOfActivityId — without this the "needs retry" count
// would go permanently stale. Complementary to linkRetry, not redundant: a
// resend to a DIFFERENT recipient hashes to a different jobId and is only
// caught by the explicit link.
async function autoLinkPriorFailures({ jobId, kind, newActivityId }) {
  if (!jobId) return;
  try {
    await JobActivity.updateMany(
      { jobId, kind, status: 'failed', retried: false, _id: { $ne: newActivityId } },
      { $set: { retried: true, retriedByActivityId: newActivityId } }
    );
  } catch (error) {
    console.error('Error auto-linking prior job failures:', error);
  }
}

// The design's labels, derived — never stored. See the model's header comment.
function toDisplayStatus(row, now = new Date()) {
  const { kind, status } = row;

  if (status === 'queued' || status === 'active') {
    const ageMinutes = (now - new Date(row.createdAt)) / 60000;
    if (ageMinutes > STALE_MINUTES) return 'stalled';
    if (kind === 'email') return 'sending';
    if (kind === 'pdf') return 'preparing';
    return 'scanning';
  }

  if (status === 'failed') return 'failed';

  // completed
  if (kind === 'email') return 'sent';
  if (kind === 'sweep') return (row.result?.mismatchCount || 0) > 0 ? 'mismatch' : 'allClear';

  // pdf
  if (row.downloadedAt) return 'downloaded';
  if (row.resultExpiresAt && new Date(row.resultExpiresAt) > now) return 'ready';
  return 'expired';
}

// Policy lives server-side; the frontend maps these tokens to its own copy
// ("Download again" vs "Generate again" are the same action, different label).
function availableActionsFor(row, displayStatus, { isOwner }) {
  switch (displayStatus) {
    case 'sent':
      return ['resend'];
    case 'failed':
      if (row.kind === 'email') {
        // A permanently rejected mailbox can only fail again — offer only the
        // edit path, which is the one that can actually succeed.
        return row.errorCode === 'UnrecoverableError'
          ? ['editAndResend']
          : ['retry', 'editAndResend'];
      }
      return row.kind === 'pdf' ? ['retry'] : ['reverify'];
    case 'ready':
      // Download is owner-only even for an Admin: the blob is single-use, so
      // an Admin taking it would consume the owner's download. Admins
      // regenerate their own copy instead.
      return isOwner ? ['download', 'regenerate'] : ['regenerate'];
    case 'downloaded':
    case 'expired':
      return ['regenerate'];
    case 'stalled':
      return row.kind === 'sweep' ? ['reverify'] : ['retry'];
    case 'allClear':
    case 'mismatch':
      return ['reverify'];
    default:
      return [];
  }
}

module.exports = {
  buildSubject,
  buildSearchText,
  startActivity,
  markActive,
  recordAttempt,
  completeActivity,
  failActivity,
  markDownloaded,
  markExpired,
  linkRetry,
  autoLinkPriorFailures,
  toDisplayStatus,
  availableActionsFor,
  STALE_MINUTES,
};
