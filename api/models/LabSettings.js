const mongoose = require('mongoose');

// Singleton — exactly one document, fetched/created on demand by
// routes/labSettings.js (findOne, create-with-defaults if missing).
const labSettingsSchema = new mongoose.Schema({
  labName: { type: String, default: '' },
  tagline: { type: String, default: '' },
  registrationNumber: { type: String, default: '' },
  address: { type: String, default: '' },

  workflowPolicy: {
    // Stored + actually enforced (see api/routes/reports.js POST /:id/unsign):
    limitUnsignHours: { type: Number, default: 24 }, // null/0 = no limit
    commentRequiredOnChangesRequested: { type: Boolean, default: true }, // already unconditionally true server-side; this reflects that, not a separate switch

    // Stored for display only — each is its own subsystem (second-approval
    // workflow, a scheduled job, real OTP/2FA) and not implemented here.
    secondDoctorReviewForCritical: { type: Boolean, default: false },
    autoSuspendAfterDaysInactive: { type: Number, default: 60 }, // null/0 = disabled
    twoFactorForDoctorsAndAdmins: { type: Boolean, default: false },
  },

  // Presentation-only email settings, Admin-editable. SMTP credentials
  // deliberately live in env (SMTP_HOST/PORT/USER/PASS) and never here —
  // same posture as JWT_SECRET/SIGNING_SECRET and hashed temp passwords.
  // GET /lab-settings additionally returns a derived `emailConfigured`
  // boolean computed from env at request time; it is not stored.
  email: {
    enabled: { type: Boolean, default: false },
    senderName: { type: String, default: '' },
    // With Gmail SMTP this must match the authenticated account (or a
    // verified alias) or Gmail rewrites/rejects the From header.
    senderAddress: { type: String, default: '' },
    replyTo: { type: String, default: '' },
    footerNote: { type: String, default: '' },
  },

  lastVerification: {
    at: { type: Date, default: null },
    checked: { type: Number, default: 0 },
    mismatches: { type: Number, default: 0 },
  },

  updatedAt: { type: Date, default: Date.now },
});

labSettingsSchema.pre('save', function (next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('LabSettings', labSettingsSchema);
