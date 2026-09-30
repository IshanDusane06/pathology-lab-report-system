const express = require('express');
const router = express.Router();
const LabSettings = require('../models/LabSettings');
const Report = require('../models/Report');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { computeHmac } = require('../utils/reportSignature');
const { isMailConfigured, sendMail, smtpConfig } = require('../utils/mailer');
const { buildTestEmail } = require('../utils/emailTemplate');
const { logEvent } = require('../utils/auditLog');

async function getOrCreateSettings() {
  let settings = await LabSettings.findOne();
  if (!settings) {
    settings = await LabSettings.create({});
  }
  return settings;
}

// Derived, never stored: whether the server actually has SMTP credentials in
// env. Lets the Admin UI show configuration status (and warn when the
// Admin-set From address disagrees with the authenticated SMTP account, which
// Gmail rejects) without ever exposing the credentials themselves.
function withEmailStatus(settings) {
  return {
    ...settings.toObject(),
    emailConfigured: isMailConfigured(),
    smtpAccount: smtpConfig().user || null,
  };
}

// Get lab settings (any authenticated role — needed for the report letterhead
// on /report/:id, which Technicians and Doctors both view/print) — creates
// the singleton with defaults on first read.
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: withEmailStatus(settings) });
  } catch (error) {
    console.error('Error fetching lab settings:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch lab settings' });
  }
});

// Update lab settings (Admin only)
router.put('/', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    const updates = { ...req.body };
    delete updates._id;
    delete updates.lastVerification;

    // Derived read-only fields must never be written back as real data.
    delete updates.emailConfigured;
    delete updates.smtpAccount;

    const { workflowPolicy, email, ...topLevel } = updates;
    Object.assign(settings, topLevel);
    if (workflowPolicy) {
      Object.assign(settings.workflowPolicy, workflowPolicy);
    }
    if (email) {
      Object.assign(settings.email, email);
    }
    await settings.save();

    res.json({ success: true, message: 'Lab settings updated', data: withEmailStatus(settings) });
  } catch (error) {
    console.error('Error updating lab settings:', error);
    res.status(500).json({ success: false, message: 'Failed to update lab settings' });
  }
});

// Re-verify every recorded signature's HMAC against its stored content hash —
// i.e. detect whether any signature record was tampered with directly in the
// database rather than produced by POST /:id/sign. Does NOT re-derive the
// content hash from the report's current field values: a legitimately
// unsigned-then-re-edited report would spuriously "fail" that check, since
// its content has correctly changed since an earlier, now-invalidated
// signature. HMAC-over-stored-hash is the actual integrity guarantee.
router.post('/reverify-signatures', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const reports = await Report.find({ 'signatures.0': { $exists: true } });

    let checked = 0;
    const mismatches = [];

    for (const report of reports) {
      report.signatures.forEach((sig, index) => {
        if (!sig.contentHash || !sig.hmac || sig.algorithm === 'legacy-backfill') return;
        checked += 1;
        const expectedHmac = computeHmac(sig.contentHash);
        if (expectedHmac !== sig.hmac) {
          mismatches.push({ reportId: report._id, signatureIndex: index });
        }
      });
    }

    const settings = await getOrCreateSettings();
    settings.lastVerification = { at: new Date(), checked, mismatches: mismatches.length };
    await settings.save();

    res.json({
      success: true,
      data: { checked, mismatches, verifiedAt: settings.lastVerification.at },
    });
  } catch (error) {
    console.error('Error re-verifying signatures:', error);
    res.status(500).json({ success: false, message: 'Failed to re-verify signatures' });
  }
});

// Send a test email to the requesting Admin's own address — validates the
// SMTP configuration end to end without involving any patient data.
router.post('/test-email', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    if (!isMailConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Email is not configured on the server — set SMTP_HOST, SMTP_USER and SMTP_PASS in the API environment.',
      });
    }

    const settings = await getOrCreateSettings();
    const to = req.user.email;
    const { subject, html, text } = buildTestEmail({ labSettings: settings });

    const { messageId } = await sendMail({ to, subject, html, text, labSettings: settings });

    await logEvent({
      actor: req.user,
      action: 'labSettings.testEmail',
      category: 'Delivery',
      description: `Sent a configuration test email to ${to}`,
    });

    res.json({ success: true, message: `Test email sent to ${to}`, data: { to, messageId } });
  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send the test email',
    });
  }
});

module.exports = router;
