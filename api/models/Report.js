
const mongoose = require('mongoose');

const signatureSchema = new mongoose.Schema({
  signedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String
  },
  signedAt: { type: Date, default: Date.now },
  contentHash: { type: String, default: null },
  hmac: { type: String, default: null },
  algorithm: { type: String, default: 'sha256-hmac-sha256' },
  invalidatedAt: { type: Date, default: null },
  invalidatedReason: { type: String, default: null }
}, { _id: false });

// Append-only delivery log — one entry per send attempt (successes and
// failures both, since a failed send is exactly when someone needs the
// history). Same array-of-subdocuments convention as signatures[].
const deliverySchema = new mongoose.Schema({
  channel: { type: String, enum: ['email'], default: 'email' },
  recipient: { type: String, required: true },
  status: { type: String, enum: ['sent', 'failed'], required: true },
  error: { type: String, default: null },
  messageId: { type: String, default: null },
  // Every report attached to the same email, so any one report can answer
  // "what went out together with this?" on its own.
  includedReportIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
  sentBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String
  },
  sentAt: { type: Date, default: Date.now }
}, { _id: false });

const reportSchema = new mongoose.Schema({
  reportTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ReportType',
    required: true
  },
  reportTypeCode: {
    type: String,
    required: true,
    index: true
  },
  patientInfo: {
    name: { type: String, required: true },
    date: { type: Date, required: true },
    referredBy: { type: String, required: true },
    sex: { type: String, required: true, enum: ['male', 'female', 'other'] },
    age: {
      type: Number,
      required: true,
      min: 0,
      max: 150
    },
    contact: { type: String },
    address: { type: String }
  },
  // Deliberately OUTSIDE patientInfo, for three reasons:
  //  1. canonicalizeReportContent() hashes every patientInfo field into the
  //     signature envelope — keeping the email out means correcting a typo'd
  //     address can never invalidate a doctor's signature.
  //  2. ReportDetail.tsx replaces the whole patientInfo sub-document on save
  //     (it never loads contact/address), so an email stored in there would
  //     be silently wiped on the next edit.
  //  3. It must never appear on the report/PDF/WhatsApp — ReportReadOnlyView
  //     renders named patientInfo fields, so a field that isn't in that
  //     object structurally cannot leak into the document.
  // Communication only.
  patientEmail: { type: String, default: null },
  // Link to the Patient record, deliberately top-level for the same reason
  // patientEmail is: canonicalizeReportContent() hashes every patientInfo
  // field, so a pointer that can legitimately change after signing (a merge
  // re-points it, a retro-link sets it on an old report) must sit OUTSIDE the
  // signed envelope. patientInfo above stays the immutable snapshot of who
  // this report was issued for; this is the mutable pointer to who they are
  // now. Null on every report created before the patient module existed.
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    default: null,
    index: true
  },
  deliveries: [deliverySchema],
  parameters: [{
    name: { type: String, required: true },
    value: mongoose.Schema.Types.Mixed,
    unit: String,
    section: String,
    notes: String,
    // Per-report formatting, chosen by whoever fills in this specific value
    // (technician or doctor) — not a template-level rule.
    bold: { type: Boolean, default: false },
    italic: { type: Boolean, default: false },
    underline: { type: Boolean, default: false }
  }],
  // Workflow status. `value` drives the state machine (draft -> pendingApproval ->
  // signed, with changesRequested/rejected as the doctor's decline paths).
  // `updatedBy`/`updatedAt`/`remarks` describe the most recent transition only —
  // full history lives in `signatures[]` for sign/unsign events.
  status: {
    value: {
      type: String,
      enum: ['draft', 'pendingApproval', 'signed', 'changesRequested', 'rejected'],
      default: 'draft'
    },
    updatedBy: {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      name: String,
      role: String
    },
    updatedAt: { type: Date, default: Date.now },
    remarks: { type: String, default: null }
  },
  // Append-only audit trail of sign/unsign events. Un-sign invalidates the
  // active entry rather than removing it, so signing history is never lost.
  signatures: [signatureSchema],
  technician: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String
    },
    qualification: {
      type: String
    },
    registrationNumber: {
      type: String
    }
  },
  doctor: {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    name: {
      type: String
    },
    qualification: {
      type: String
    },
    registrationNumber: {
      type: String
    }
  },
  remarks: String,
  // Per-section remarks — only used when the report's type has
  // sectionWiseRemarks enabled; coexists with (but is mutually exclusive in
  // the UI/rendering with) the global `remarks` field above.
  sectionRemarks: [{
    sectionKey: String,
    remarks: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update updatedAt timestamp on save
reportSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Report', reportSchema);
