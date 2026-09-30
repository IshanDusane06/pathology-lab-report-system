const mongoose = require('mongoose');

const normalValueSchema = new mongoose.Schema({
  min: { type: Number },
  max: { type: Number },
  unit: { type: String },
  gender: {
    type: String,
    enum: ['male', 'female', 'all'],
    default: 'all'
  },
  ageRange: {
    min: { type: Number },
    max: { type: Number }
  }
});

const subFieldSchema = new mongoose.Schema({
  label: { type: String, required: true },
  unit: { type: String }
}, { _id: false });

const parameterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: { type: String },
  unit: { type: String },
  type: {
    type: String,
    enum: ['number', 'text', 'select', 'range', 'boolean', 'paragraph', 'datedReadings', 'breakdown'],
    required: true
  },
  options: [{ type: String }], // For select type parameters
  // For breakdown type parameters — a fixed, admin-defined list of named
  // sub-values (e.g. Motility: Actively Motile / Sluggishly Motile / Non
  // Motile), each filled in with its own number at report time. Order here
  // is the order they render in.
  subFields: [subFieldSchema],
  // For boolean type parameters — custom labels instead of true/false,
  // e.g. { trueLabel: 'Positive', falseLabel: 'Negative' }.
  booleanLabels: {
    trueLabel: { type: String },
    falseLabel: { type: String }
  },
  // Optional free-text reference range/value for text/select/boolean
  // parameters (e.g. "Negative", "4.5 - 11.0") — independent of the numeric
  // normalValues below, which stays number/range-only.
  referenceRangeText: { type: String },
  normalValues: [normalValueSchema],
  isRequired: { type: Boolean, default: false },
  displayOrder: { type: Number, default: 0 },
  section: { type: String, default: 'main' } // Matches sectionSchema.key below
});

// First-class section metadata (title/description/order), sitting above the
// per-parameter `section` string tag. Purely additive: a ReportType with no
// sections[] still works, callers fall back to the raw section key.
const sectionSchema = new mongoose.Schema({
  key: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String },
  displayOrder: { type: Number, default: 0 },
  collapsedByDefault: { type: Boolean, default: false },
  // Section-wise remarks (opt-in, see reportTypeSchema.sectionWiseRemarks) —
  // only meaningful when the parent template has that mode on.
  remarksEnabled: { type: Boolean, default: false },
  defaultRemarks: { type: String },
  // Section-wise method (opt-in, see reportTypeSchema.sectionWiseMethod) —
  // only meaningful when the parent template has that mode on. No per-report
  // override exists (unlike remarks) — this string is the whole answer.
  method: { type: String }
}, { _id: false });

const reportTypeSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: { type: String },
  code: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  isActive: { type: Boolean, default: true },
  parameters: [parameterSchema],
  sections: [sectionSchema],
  method: { type: String },
  defaultRemarks: { type: String },
  // Mode switch: false (default) = the single global defaultRemarks/remarks
  // field above, unchanged. true = per-section remarks (sections[].defaultRemarks
  // / Report.sectionRemarks) instead — mutually exclusive with the global field,
  // enforced at the rendering/editing layer, not here.
  sectionWiseRemarks: { type: Boolean, default: false },
  // Same mode-switch shape as sectionWiseRemarks, but for method text —
  // independent toggle, since a template may want one, the other, both, or
  // neither. false (default) = the single global `method` field above,
  // unchanged. true = per-section method (sections[].method) instead.
  sectionWiseMethod: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Update updatedAt timestamp on save
reportTypeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('ReportType', reportTypeSchema);
