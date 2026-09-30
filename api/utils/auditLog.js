const AuditLog = require('../models/AuditLog');

// Fire-and-forget: an audit-log failure must never break the mutation it's
// describing. Callers await this (so ordering in tests is deterministic) but
// its own errors are swallowed after logging.
async function logEvent({ actor, action, category, description, targetType, targetId }) {
  try {
    await AuditLog.create({
      actor: actor
        ? { userId: actor._id || actor.userId, name: actor.name, role: actor.role }
        : undefined,
      action,
      category,
      description,
      targetType,
      targetId,
    });
  } catch (error) {
    console.error('Error writing audit log:', error);
  }
}

module.exports = { logEvent };
