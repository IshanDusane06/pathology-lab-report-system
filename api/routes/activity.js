const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const JobActivity = require('../models/JobActivity');
const LabSettings = require('../models/LabSettings');
const { isAuthenticated } = require('../middleware/auth');
const { parsePagination } = require('../utils/pagination');
const { resolveScope } = require('../utils/activityScope');
const { escapeRegex } = require('../utils/patientNormalize');
const { toDisplayStatus, availableActionsFor } = require('../utils/jobActivity');

// Tab vocabulary -> stored status. Kept here so the mapping lives in exactly
// one place rather than being re-derived by every caller.
const STATUS_TABS = {
  all: null,
  inProgress: { status: { $in: ['queued', 'active'] } },
  failed: { status: 'failed' },
  done: { status: 'completed' },
};

function buildFilters(req, scope) {
  const filters = { ...scope.filter };

  const kind = req.query.kind;
  if (kind && kind !== 'all' && ['email', 'pdf', 'sweep'].includes(kind)) {
    filters.kind = kind;
  }

  const tab = STATUS_TABS[req.query.status];
  if (tab) Object.assign(filters, tab);

  const search = (req.query.search || '').trim();
  if (search) {
    // searchText is stored pre-lowercased, so this can stay case-SENSITIVE,
    // which is meaningfully cheaper than $options:'i'. Unanchored because
    // "example.com" has to match inside "patient@example.com" — which does
    // mean it is a scan, not an index seek (see the model's comments).
    filters.searchText = new RegExp(escapeRegex(search.toLowerCase()));
  }

  if (req.query.reportId && mongoose.Types.ObjectId.isValid(req.query.reportId)) {
    filters['subject.reportIds'] = new mongoose.Types.ObjectId(req.query.reportId);
  }

  return filters;
}

// The server sends facts (recipient, reportCount, filename, bytes) and
// policy (displayStatus, availableActions). It does NOT send prose — the
// client composes "Email to ..." / "2 reports merged into 1 PDF", so copy
// and i18n stay client-side.
function serializeRow(row, { userId, now }) {
  const displayStatus = toDisplayStatus(row, now);
  const isOwner = String(row.actor?.userId) === String(userId);

  const base = {
    id: String(row._id),
    kind: row.kind,
    source: row.source,
    status: row.status,
    displayStatus,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    error: row.error,
    errorCode: row.errorCode,
    report: {
      primaryReportId: row.request?.primaryReportId ? String(row.request.primaryReportId) : null,
      reportIds: (row.subject?.reportIds || []).map(String),
      reportCount: row.subject?.reportCount || 0,
      patientName: row.subject?.patientName || null,
      patientCode: row.subject?.patientCode || null,
      patientId: row.subject?.patientId ? String(row.subject.patientId) : null,
      reportTypeCodes: row.subject?.reportTypeCodes || [],
      label: row.subject?.label || null,
    },
    actor: {
      userId: String(row.actor?.userId),
      name: row.actor?.name || null,
      role: row.actor?.role || null,
    },
    startedByMe: isOwner,
    when: {
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      downloadedAt: row.downloadedAt,
      lastActivityAt: row.finishedAt || row.startedAt || row.createdAt,
    },
    email: null,
    pdf: null,
    sweep: null,
    retried: row.retried,
    retriedByActivityId: row.retriedByActivityId ? String(row.retriedByActivityId) : null,
    retryOfActivityId: row.retryOfActivityId ? String(row.retryOfActivityId) : null,
    availableActions: availableActionsFor(row, displayStatus, { isOwner }),
  };

  if (row.kind === 'email') {
    base.email = {
      recipient: row.result?.recipient || row.request?.recipient || null,
      messageId: row.result?.messageId || null,
    };
  } else if (row.kind === 'pdf') {
    base.pdf = {
      jobId: row.jobId,
      filename: row.result?.filename || null,
      bytes: row.result?.bytes ?? null,
      resultExpiresAt: row.resultExpiresAt,
      // Computed server-side so the countdown isn't skewed by client clock drift.
      expiresInSeconds: row.resultExpiresAt
        ? Math.max(0, Math.round((new Date(row.resultExpiresAt) - now) / 1000))
        : null,
    };
  } else {
    base.sweep = {
      checked: row.result?.checked ?? null,
      reportsScanned: row.result?.reportsScanned ?? null,
      mismatchCount: row.result?.mismatchCount ?? null,
    };
  }

  return base;
}

// One row per report, aggregating that report's email attempts.
//
// Built from JobActivity, NOT Report.deliveries[]: deliveries is an embedded
// array with no indexes anywhere on it and {_id:false} subdocs, so there is
// no stable handle to retry or link, and aggregating it would mean
// $unwind-ing every report's array across the whole collection unindexed.
// subject.reportIds is an ordinary multikey-indexed field.
async function byReportView(filters, { skip, limit, userId, now }) {
  const pipeline = [
    { $match: { ...filters, kind: 'email' } },
    // BEFORE $unwind: the only position where the index can serve the sort,
    // and $group's $first below depends on this ordering to pick the newest.
    { $sort: { createdAt: -1 } },
    { $unwind: '$subject.reportIds' },
    {
      $group: {
        _id: '$subject.reportIds',
        attempts: { $sum: 1 },
        failedAttempts: { $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] } },
        inProgress: { $sum: { $cond: [{ $in: ['$status', ['queued', 'active']] }, 1, 0] } },
        autoRetries: { $sum: '$attempts' },
        lastActivityAt: { $max: '$createdAt' },
        last: { $first: '$$ROOT' },
      },
    },
    { $sort: { lastActivityAt: -1 } },
    {
      $facet: {
        rows: [{ $skip: skip }, { $limit: limit }],
        total: [{ $count: 'n' }],
      },
    },
  ];

  const [out] = await JobActivity.aggregate(pipeline);
  const total = out?.total?.[0]?.n || 0;

  const data = (out?.rows || []).map((g) => {
    const last = g.last;
    const displayStatus = toDisplayStatus(last, now);
    const isOwner = String(last.actor?.userId) === String(userId);
    return {
      reportId: String(g._id),
      report: {
        patientName: last.subject?.patientName || null,
        patientCode: last.subject?.patientCode || null,
        reportTypeCodes: last.subject?.reportTypeCodes || [],
        primaryReportId: last.request?.primaryReportId ? String(last.request.primaryReportId) : null,
      },
      deliveryStatus: displayStatus,
      // One activity row = one attempt, i.e. one user action. autoRetries is
      // the finer machine-level count, exposed separately so the headline
      // number never contradicts the one-row-per-action model.
      attempts: g.attempts,
      failedAttempts: g.failedAttempts,
      inProgress: g.inProgress,
      autoRetries: g.autoRetries,
      lastActivityAt: g.lastActivityAt,
      last: {
        activityId: String(last._id),
        recipient: last.result?.recipient || last.request?.recipient || null,
        error: last.error,
        status: last.status,
        actor: { name: last.actor?.name || null, role: last.actor?.role || null },
      },
      availableActions: availableActionsFor(last, displayStatus, { isOwner }),
    };
  });

  return { data, total };
}

// The feed. isAuthenticated only — every role gets this page, scoped.
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const scope = resolveScope(req);
    const { page, limit, skip } = parsePagination(req);
    const filters = buildFilters(req, scope);
    const now = new Date();
    const meta = { scope: scope.scope, scopeForced: scope.scopeForced, isAdminView: scope.isAdmin && scope.scope === 'everyone' };

    if (req.query.view === 'report') {
      const { data, total } = await byReportView(filters, { skip, limit, userId: req.user._id, now });
      return res.json({
        success: true,
        data,
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        meta: { ...meta, view: 'report' },
      });
    }

    const [rows, total] = await Promise.all([
      JobActivity.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      JobActivity.countDocuments(filters),
    ]);

    res.json({
      success: true,
      data: rows.map((row) => serializeRow(row, { userId: req.user._id, now })),
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
      meta: { ...meta, view: 'job' },
    });
  } catch (error) {
    console.error('Error fetching activity:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity' });
  }
});

// Stat cards, status-tab counts, the attention banner and the sweep card.
//
// A dedicated endpoint rather than counts welded into the list response: the
// nav badge lives on every page where the list is not loaded, and embedding
// counts would force the Navbar to fetch rows just to read a number. The
// cards are also filter-independent while the tab counts respect the current
// filters, which one shared response could not express.
router.get('/summary', isAuthenticated, async (req, res) => {
  try {
    const scope = resolveScope(req);
    const now = new Date();
    const base = { ...scope.filter };

    // Tab counts honour the current kind/search filter (but never the status
    // filter — a tab cannot count itself).
    const tabFilters = buildFilters({ query: { ...req.query, status: 'all' } }, scope);

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [tabAgg, inProgress, failedNeedsRetry, readyToDownload, emailsSentToday, attentionRows, sweepRow] =
      await Promise.all([
        JobActivity.aggregate([{ $match: tabFilters }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        JobActivity.countDocuments({ ...base, status: { $in: ['queued', 'active'] } }),
        JobActivity.countDocuments({ ...base, status: 'failed', retried: false }),
        JobActivity.countDocuments({
          ...base,
          kind: 'pdf',
          status: 'completed',
          downloadedAt: null,
          resultExpiresAt: { $gt: now },
        }),
        JobActivity.countDocuments({
          ...base,
          kind: 'email',
          status: 'completed',
          finishedAt: { $gte: startOfToday },
        }),
        JobActivity.find({ ...base, status: 'failed', retried: false })
          .sort({ createdAt: -1 })
          .limit(3)
          .lean(),
        JobActivity.findOne({ ...base, kind: 'sweep' }).sort({ createdAt: -1 }).lean(),
      ]);

    const byStatus = Object.fromEntries(tabAgg.map((g) => [g._id, g.n]));
    const tabs = {
      all: Object.values(byStatus).reduce((a, b) => a + b, 0),
      inProgress: (byStatus.queued || 0) + (byStatus.active || 0),
      failed: byStatus.failed || 0,
      done: byStatus.completed || 0,
    };

    // Sweep card falls back to LabSettings for the one sweep that predates
    // this feature. The `source` discriminator lets the UI render honestly
    // ("37 signatures · 0 mismatches") instead of fabricating a
    // reportsScanned it never had.
    let signatureSweep = null;
    if (sweepRow) {
      signatureSweep = {
        source: 'jobActivity',
        status: sweepRow.status,
        displayStatus: toDisplayStatus(sweepRow, now),
        at: sweepRow.finishedAt || sweepRow.createdAt,
        checked: sweepRow.result?.checked ?? null,
        reportsScanned: sweepRow.result?.reportsScanned ?? null,
        mismatchCount: sweepRow.result?.mismatchCount ?? null,
        actor: { name: sweepRow.actor?.name || null, role: sweepRow.actor?.role || null },
        activityId: String(sweepRow._id),
      };
    } else {
      const settings = await LabSettings.findOne().select('lastVerification').lean();
      if (settings?.lastVerification?.at) {
        signatureSweep = {
          source: 'labSettings',
          status: 'completed',
          displayStatus: (settings.lastVerification.mismatches || 0) > 0 ? 'mismatch' : 'allClear',
          at: settings.lastVerification.at,
          checked: settings.lastVerification.checked ?? null,
          reportsScanned: null,
          mismatchCount: settings.lastVerification.mismatches ?? null,
          actor: null,
          activityId: null,
        };
      }
    }

    res.json({
      success: true,
      data: {
        scope: scope.scope,
        scopeForced: scope.scopeForced,
        isAdminView: scope.isAdmin && scope.scope === 'everyone',
        cards: { inProgress, failedNeedsRetry, readyToDownload, emailsSentToday },
        tabs,
        attention: {
          count: failedNeedsRetry,
          items: attentionRows.map((r) => ({
            activityId: String(r._id),
            kind: r.kind,
            patientName: r.subject?.patientName || null,
            recipient: r.result?.recipient || r.request?.recipient || null,
            filename: r.result?.filename || null,
            error: r.error,
          })),
        },
        signatureSweep,
      },
    });
  } catch (error) {
    console.error('Error fetching activity summary:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch activity summary' });
  }
});

module.exports = router;
