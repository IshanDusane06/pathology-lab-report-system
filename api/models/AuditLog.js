const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  actor: {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    name: { type: String },
    role: { type: String },
  },
  action: { type: String, required: true }, // e.g. 'report.sign', 'user.roleChange'
  category: {
    type: String,
    enum: ['Signature', 'Access', 'Template', 'Delivery', 'Patient'],
    required: true,
  },
  description: { type: String, required: true },
  targetType: { type: String }, // e.g. 'Report', 'User', 'ReportType'
  targetId: { type: mongoose.Schema.Types.ObjectId },
  createdAt: { type: Date, default: Date.now },
});

auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
