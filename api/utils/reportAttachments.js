const Report = require('../models/Report');

// A file name a patient can make sense of in their downloads folder.
function pdfFileName(report) {
  const patient = (report.patientInfo?.name || "report").replace(/[^a-z0-9]+/gi, "-");
  const type = (report.reportTypeCode || "report").replace(/[^a-z0-9]+/gi, "-");
  return `${patient}-${type}.pdf`.toLowerCase();
}

// Same idea as pdfFileName, but for a merged multi-report PDF — falls back to
// the plain single-report name when there's only one report after all.
function mergedPdfFileName(primary, count) {
  if (count <= 1) return pdfFileName(primary);
  const patient = (primary.patientInfo?.name || "report").replace(/[^a-z0-9]+/gi, "-");
  return `${patient}-${count}-reports.pdf`.toLowerCase();
}

// Validates a set of "extra" report ids against a primary report for the
// combined-PDF / attach-to-email flows: each must exist, be signed, and
// belong to the exact same linked patient as the primary. This is the guard
// that stops a crafted request attaching a different patient's report — it's
// checked by patientId equality, never by name (see /:id/related's comment
// for why a name match isn't safe: the real database has eleven reports for
// "Sagar"/male across five different recorded ages). Shared by the
// report-email and report-pdf routes AND their background jobs (which
// re-resolve at run time) so this can't drift between call sites.
async function resolveAttachableReports(primary, extraIds) {
  const ids = Array.from(new Set((extraIds || []).map(String))).filter(
    (rid) => rid !== String(primary._id)
  );
  if (!ids.length) return { ok: true, extras: [] };

  if (!primary.patientId) {
    return {
      ok: false,
      status: 400,
      message: "This report isn't linked to a patient yet — link it before attaching other reports.",
    };
  }

  const found = await Report.find({ _id: { $in: ids } });
  if (found.length !== ids.length) {
    return { ok: false, status: 400, message: "One or more of the selected reports could not be found" };
  }
  for (const extra of found) {
    if (extra.status?.value !== "signed") {
      return {
        ok: false,
        status: 400,
        message: `"${extra.reportTypeCode}" is not signed and cannot be attached`,
      };
    }
    const samePatient =
      !!extra.patientId && String(extra.patientId) === String(primary.patientId);
    if (!samePatient) {
      return { ok: false, status: 400, message: "Every attached report must belong to the same patient" };
    }
  }

  // Preserve the caller's requested order — $in doesn't guarantee it.
  const byId = new Map(found.map((r) => [String(r._id), r]));
  const extras = ids.map((rid) => byId.get(rid)).filter(Boolean);
  return { ok: true, extras };
}

module.exports = { pdfFileName, mergedPdfFileName, resolveAttachableReports };
