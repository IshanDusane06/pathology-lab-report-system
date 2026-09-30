const mongoose = require('mongoose');
const Counter = require('./Counter');
const { normalizeName, normalizePhone } = require('../utils/patientNormalize');
const { phoneticKey } = require('../utils/phonetic');

const PATIENT_SEQUENCE = 'patient';

// A person the lab issues reports to.
//
// Relationship to Report: a report holds `patientId` (a mutable pointer to
// this record) AND its own `patientInfo` snapshot (immutable, and inside the
// signed content hash). This record is the current truth; the snapshot is
// what a given report was signed against. Correcting a name here never
// changes what an already-signed report renders — that is the whole point of
// keeping both.
const patientSchema = new mongoose.Schema({
  // Human-readable and quotable over the phone, e.g. "P-000042". Allocated
  // from an atomic counter, never derived from the ObjectId.
  patientId: { type: String, required: true, unique: true },

  name: { type: String, required: true, trim: true },
  // Derived. Lowercased + whitespace-collapsed; this is the field search
  // actually queries, so an anchored prefix regex can stay case-sensitive
  // and therefore index-backed.
  nameNormalized: { type: String, required: true, index: true },
  // Derived. Duplicate detection only — never displayed, never searched on
  // directly by a user. Indexed via the compound { namePhonetic, sex } below
  // rather than on its own: that index also serves a namePhonetic-only query
  // as a prefix, so a standalone one would just be a second index to keep
  // current on every write.
  namePhonetic: { type: String },

  // Optional on purpose: a walk-in patient without a mobile is a supported
  // case, not an error. They are found by name + sex + age, or by quoting
  // the patient ID printed on their last report.
  phone: { type: String, default: null, trim: true },
  // Derived, indexed, and deliberately NOT unique — a family sharing one
  // number is normal. Searching a shared number returns every member.
  phoneNormalized: { type: String, default: null, index: true },

  email: { type: String, default: null, trim: true, lowercase: true },

  sex: { type: String, enum: ['male', 'female', 'other'], required: true },

  // DOB is authoritative when known — it never drifts. ageYears/ageRecordedAt
  // are the fallback for patients who don't know their date of birth, kept as
  // a pair so a stale age can be shown as stale.
  dob: { type: Date, default: null },
  ageYears: { type: Number, min: 0, max: 150, default: null },
  ageRecordedAt: { type: Date, default: null },

  address: { type: String, default: null },
  notes: { type: String, default: null },

  // Tombstone. A merged record is never deleted, so links and bookmarks
  // pointing at it keep resolving — they redirect to the survivor.
  mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', default: null },

  // Soft-deactivate only. A patient with reports is never hard-deletable,
  // mirroring the existing guards on users and report templates.
  isActive: { type: Boolean, default: true },

  createdBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String,
  },
  updatedBy: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: String,
    role: String,
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Every derived field is recomputed here rather than at the call sites, so
// they cannot drift out of sync with the raw values. Routes use .save()
// throughout (not findByIdAndUpdate) specifically so this always fires.
patientSchema.pre('validate', async function deriveFields(next) {
  try {
    if (this.isNew && !this.patientId) {
      const seq = await Counter.next(PATIENT_SEQUENCE);
      this.patientId = `P-${String(seq).padStart(6, '0')}`;
    }
    if (this.isModified('name') || this.isNew) {
      this.nameNormalized = normalizeName(this.name);
      this.namePhonetic = phoneticKey(this.name);
    }
    if (this.isModified('phone') || this.isNew) {
      this.phoneNormalized = normalizePhone(this.phone);
    }
    if (!this.isNew) this.updatedAt = new Date();
    next();
  } catch (error) {
    next(error);
  }
});

patientSchema.index({ createdAt: -1 });
patientSchema.index({ namePhonetic: 1, sex: 1 });

module.exports = mongoose.model('Patient', patientSchema);
module.exports.PATIENT_SEQUENCE = PATIENT_SEQUENCE;
