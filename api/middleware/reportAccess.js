// Ownership invariant: exactly one party may edit `parameters`/`patientInfo`
// per status. Ownership is by recorded technician identity, not raw role, so
// a Doctor who directly created a draft can still edit their own draft.
const OWNERSHIP_RULES = {
  draft: (report, user) => String(report.technician?.userId) === String(user._id),
  changesRequested: (report, user) => String(report.technician?.userId) === String(user._id),
  pendingApproval: (report, user) => user.role === 'Doctor',
  signed: () => false,
  rejected: () => false
};

function canEditReportContent(report, user) {
  const rule = OWNERSHIP_RULES[report.status?.value];
  return rule ? rule(report, user) : false;
}

// Per-action state-machine legality — separate from (and composed with) the
// ownership invariant above: this checks *whether the action can fire at all*
// from the report's current state, not who's allowed to edit content.
const TRANSITIONS = {
  submit: {
    from: ['draft', 'changesRequested'],
    to: 'pendingApproval',
    actor: ['Technician', 'Admin'],
    requiresRemarks: false,
    ownerOnly: true
  },
  sign: {
    from: ['pendingApproval'],
    to: 'signed',
    actor: 'Doctor',
    requiresRemarks: false
  },
  // A Doctor finalizing their own still-unsubmitted report directly — the
  // creator already has signing authority, so there's no one else to route
  // it to for approval. Distinct from `sign` above (which reviews a report
  // someone else submitted) rather than widening `sign`'s `from`, since the
  // two represent different real-world actions with different actors.
  finalize: {
    from: ['draft', 'changesRequested'],
    to: 'signed',
    actor: 'Doctor',
    requiresRemarks: false,
    ownerOnly: true
  },
  unsign: {
    from: ['signed'],
    to: 'pendingApproval',
    actor: 'Doctor',
    requiresRemarks: true
  },
  requestChanges: {
    from: ['pendingApproval', 'signed'],
    to: 'changesRequested',
    actor: 'Doctor',
    requiresRemarks: true
  },
  reject: {
    from: ['pendingApproval'],
    to: 'rejected',
    actor: 'Doctor',
    requiresRemarks: true
  }
};

function assertTransition(report, action, user, remarks) {
  const rule = TRANSITIONS[action];
  if (!rule) {
    return { ok: false, status: 500, message: `Unknown transition: ${action}` };
  }
  const allowedActors = [].concat(rule.actor);
  if (!allowedActors.includes(user.role)) {
    return { ok: false, status: 403, message: `Only ${allowedActors.join('/')} can ${action} a report` };
  }
  if (!rule.from.includes(report.status?.value)) {
    return { ok: false, status: 409, message: `Cannot ${action} a report with status "${report.status?.value}"` };
  }
  if (rule.requiresRemarks && !remarks) {
    return { ok: false, status: 400, message: 'remarks is required for this action' };
  }
  if (rule.ownerOnly && String(report.technician?.userId) !== String(user._id)) {
    return { ok: false, status: 403, message: `Only the report's creator can ${action} it` };
  }
  return { ok: true, to: rule.to };
}

// Delete rights are deliberately separate from the ownership invariant above
// (which governs editing content) — deleting a report someone else owns is
// allowed for Doctor/Admin on unsigned reports, unlike editing it.
function canDeleteReport(report, user) {
  const status = report.status?.value;
  if (user.role === 'Admin') return true;
  if (user.role === 'Doctor') return status !== 'signed';
  if (user.role === 'Technician') {
    return (
      String(report.technician?.userId) === String(user._id) &&
      ['draft', 'changesRequested'].includes(status)
    );
  }
  return false;
}

module.exports = { canEditReportContent, assertTransition, canDeleteReport, TRANSITIONS };
