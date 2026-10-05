const express = require("express");
const router = express.Router();
const Report = require("../models/Report");
const ReportType = require("../models/ReportType");
const { isAuthenticated } = require("../middleware/auth");
const { canEditReportContent, assertTransition, canDeleteReport } = require("../middleware/reportAccess");
const { computeContentHash, computeHmac } = require("../utils/reportSignature");
const { logEvent } = require("../utils/auditLog");
const LabSettings = require("../models/LabSettings");
const { sanitizeRemarks } = require("../utils/sanitizeRemarks");
const { isMailConfigured } = require("../utils/mailer");
const { renderReportPdf, renderReportsPdfs, mergePdfBuffers } = require("../utils/reportPdf");
const Patient = require("../models/Patient");
const { resolveAge, escapeRegex } = require("../utils/patientNormalize");
const { pdfFileName, mergedPdfFileName, resolveAttachableReports } = require("../utils/reportAttachments");
const { reportDeliveryQueue, JOB_OPTIONS } = require("../queue/queues");
const { pingRedis } = require("../queue/connection");
const { enqueueWithDedup } = require("../queue/enqueue");
const { emailJobId, pdfJobId } = require("../jobs/jobIds");
const pdfStore = require("../jobs/pdfStore");

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// Deliberately permissive but structurally real — enough to catch typos and
// obviously malformed input without rejecting valid but unusual addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(value) {
  return typeof value === "string" && EMAIL_PATTERN.test(value.trim());
}

// Build the report's patientInfo snapshot from the Patient record.
//
// Identity (name, sex, age, contact, address) is taken from the patient, NOT
// from whatever the client posted — the snapshot has to be a faithful record
// of the patient as they stood when the report was issued, and a client is
// not the authority on that. Per-visit facts (date, referredBy) do come from
// the request: the referring doctor legitimately differs from one visit to
// the next.
//
// This also finally populates contact/address, which have existed in the
// schema since the beginning but were never collected by any screen.
function buildPatientSnapshot(patient, requested = {}) {
  const age = resolveAge(patient);
  const resolvedAge = age.years != null ? age.years : requested.age;

  return {
    name: patient.name,
    date: requested.date || new Date(),
    referredBy: requested.referredBy,
    sex: patient.sex,
    age: resolvedAge,
    contact: patient.phone || null,
    address: patient.address || null,
  };
}

function reportLabel(report) {
  const shortId = String(report._id).slice(-6);
  return `#${shortId} — ${report.patientInfo?.name || "Unknown"}, ${(report.reportTypeCode || "").toUpperCase()}`;
}

const FILTERABLE_FIELDS = [
  "status.value",
  "reportTypeCode",
  "technician.userId",
  "doctor.userId",
  "patientInfo.name",
  "patientId",
];

function statusUpdate(user, remarks = null) {
  return {
    updatedBy: { userId: user._id, name: user.name, role: user.role },
    updatedAt: new Date(),
    remarks,
  };
}

function activeSignature(report) {
  return [...report.signatures].reverse().find((s) => !s.invalidatedAt);
}

// Section-wise remarks (one entry per section, only used when the report's
// type has sectionWiseRemarks enabled) — sanitize each entry the same way
// the single global `remarks` field already is, since both are user-authored
// HTML from the same RemarksEditor component.
function sanitizeSectionRemarks(sectionRemarks) {
  if (!Array.isArray(sectionRemarks)) return sectionRemarks;
  return sectionRemarks.map((sr) => ({ ...sr, remarks: sanitizeRemarks(sr.remarks) }));
}

// A "paragraph"-type parameter's value is rich-text HTML (authored via the
// same RemarksEditor as remarks), unlike every other parameter type's plain
// number/short-string/boolean value. A "datedReadings" parameter's value is
// an array of {date, value} entries, each carrying its own rich-text HTML the
// same way. A "breakdown" parameter's value is an array of {label, value}
// entries — plain numbers, no rich text, but each label needs checking
// against the template's own admin-defined sub-fields (a stale or crafted
// payload could otherwise carry a label that no longer exists). Report.
// parameters[] doesn't carry its own `type` (only the template does), so
// which entries need sanitizing — and how — has to be resolved against the
// template. Called with the report's own ReportType — a small extra lookup,
// only when `parameters` is in the update.
function sanitizeRichTextParameterValues(parameters, reportType) {
  if (!Array.isArray(parameters) || !reportType) return parameters;
  const paramByName = new Map((reportType.parameters || []).map((p) => [p.name, p]));
  if (!paramByName.size) return parameters;
  return parameters.map((p) => {
    const templateParam = paramByName.get(p.name);
    const type = templateParam?.type;
    if (type === "paragraph") {
      return { ...p, value: sanitizeRemarks(String(p.value ?? "")) };
    }
    if (type === "datedReadings") {
      const entries = Array.isArray(p.value) ? p.value : [];
      return {
        ...p,
        // A reading with no date can't be sorted or rendered meaningfully —
        // dropped rather than kept as a dangling, unplaceable entry.
        value: entries
          .filter((entry) => entry && entry.date)
          .map((entry) => ({ date: entry.date, value: sanitizeRemarks(String(entry.value ?? "")) })),
      };
    }
    if (type === "breakdown") {
      const validLabels = new Set((templateParam.subFields || []).map((sf) => sf.label));
      const entries = Array.isArray(p.value) ? p.value : [];
      return {
        ...p,
        value: entries
          .filter((entry) => entry && validLabels.has(entry.label))
          .map((entry) => ({ label: entry.label, value: entry.value ?? "" })),
      };
    }
    return p;
  });
}

// Shared by /sign (reviewing a submitted report) and /finalize (a Doctor
// self-signing their own report) — both end up in the exact same signed
// state, just reached via a different transition/actor check.
function applySignature(report, user) {
  const contentHash = computeContentHash(report);
  const hmac = computeHmac(contentHash);

  report.signatures.push({
    signedBy: { userId: user._id, name: user.name, role: user.role },
    signedAt: new Date(),
    contentHash,
    hmac,
    algorithm: "sha256-hmac-sha256",
    invalidatedAt: null,
    invalidatedReason: null,
  });
  report.doctor = {
    userId: user._id,
    name: user.name,
    qualification: user.profile?.qualification || null,
    registrationNumber: user.profile?.registrationNumber || null,
  };
  report.status = { value: "signed", ...statusUpdate(user) };
}

// Get reports, paginated (optionally filtered). Also what Reports.tsx's
// "all reports" browse page and Dashboard's Recent Reports widget call.
router.get("/", isAuthenticated, async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const filters = {};

    if (req.query.status) {
      filters["status.value"] = req.query.status;
    }

    if (req.query.reportTypeCode) {
      filters.reportTypeCode = req.query.reportTypeCode;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      filters.createdAt = {};
      if (req.query.dateFrom) {
        const from = new Date(req.query.dateFrom);
        from.setHours(0, 0, 0, 0);
        filters.createdAt.$gte = from;
      }
      if (req.query.dateTo) {
        const to = new Date(req.query.dateTo);
        to.setHours(23, 59, 59, 999);
        filters.createdAt.$lte = to;
      }
    }

    // Matches patient name OR the *display name* of the report type (not its
    // internal code) — the report-types collection is small enough (a few
    // dozen rows at most) that resolving matching codes first is cheap, and
    // it preserves exactly what Reports.tsx's client-side search used to do
    // before this endpoint took over filtering.
    if (req.query.search) {
      const term = String(req.query.search).trim();
      if (term) {
        const nameRegex = new RegExp(escapeRegex(term), "i");
        const matchingTypes = await ReportType.find({ name: nameRegex }).select("code");
        const matchingCodes = matchingTypes.map((t) => t.code);
        filters.$or = [
          { "patientInfo.name": nameRegex },
          ...(matchingCodes.length ? [{ reportTypeCode: { $in: matchingCodes } }] : []),
        ];
      }
    }

    const [reports, total] = await Promise.all([
      Report.find(filters).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Report.countDocuments(filters),
    ]);

    res.json({
      success: true,
      data: reports,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
});

// Get a specific report by ID
router.get("/:id", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    if (error.name === "CastError") {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }
    console.error("Error fetching report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch report",
    });
  }
});

// Create a new report — always starts as a draft, owned by its creator.
router.post("/", isAuthenticated, async (req, res) => {
  try {
    const reportData = { ...req.body };
    delete reportData.status;
    delete reportData.signatures;
    delete reportData.doctor;
    // Delivery history is written only by the email route — never accepted
    // from a client, or a send record could be fabricated.
    delete reportData.deliveries;
    if ("remarks" in reportData) {
      reportData.remarks = sanitizeRemarks(reportData.remarks);
    }
    if ("sectionRemarks" in reportData) {
      reportData.sectionRemarks = sanitizeSectionRemarks(reportData.sectionRemarks);
    }
    if (Array.isArray(reportData.parameters) && reportData.reportTypeId) {
      const reportTypeForSanitize = await ReportType.findById(reportData.reportTypeId).select("parameters");
      reportData.parameters = sanitizeRichTextParameterValues(reportData.parameters, reportTypeForSanitize);
    }

    // When a patient is linked, the server — not the client — decides what the
    // snapshot says about them.
    if (reportData.patientId) {
      const patient = await Patient.findById(reportData.patientId).catch(() => null);
      if (!patient) {
        return res.status(400).json({
          success: false,
          message: "That patient could not be found",
        });
      }
      // A merged record's reports belong to the survivor, so follow the
      // tombstone rather than linking to a record that no longer represents
      // anyone.
      if (patient.mergedInto) reportData.patientId = patient.mergedInto;

      reportData.patientInfo = buildPatientSnapshot(patient, reportData.patientInfo || {});
      if (!reportData.patientEmail && patient.email) {
        reportData.patientEmail = patient.email;
      }
    }

    const data = {
      ...reportData,
      status: { value: "draft", ...statusUpdate(req.user) },
      technician: {
        name: req.user.name,
        userId: req.user._id,
        qualification: req.user.profile?.qualification || null,
        registrationNumber: req.user.profile?.registrationNumber || null,
      },
    };

    const newReport = new Report(data);
    await newReport.save();

    res.status(201).json({
      success: true,
      message: "Report created successfully",
      data: newReport,
    });
  } catch (error) {
    console.error("Error creating report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create report",
    });
  }
});

// Update report content (parameters/patientInfo/etc). Status and signatures
// are only ever changed via the transition endpoints below, never here.
router.put("/:id", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    const updates = { ...req.body };
    delete updates.status;
    delete updates.signatures;
    delete updates._id;
    delete updates.technician;
    delete updates.doctor;
    // Written only by the email route — never accepted from a client.
    delete updates.deliveries;
    // Re-pointing a report at a different patient is a deliberate, audited act
    // with its own endpoint (POST /:id/link-patient). It must not be possible
    // as a side effect of an ordinary content save.
    delete updates.patientId;
    if ("remarks" in updates) {
      updates.remarks = sanitizeRemarks(updates.remarks);
    }
    if ("sectionRemarks" in updates) {
      updates.sectionRemarks = sanitizeSectionRemarks(updates.sectionRemarks);
    }
    if (Array.isArray(updates.parameters)) {
      const reportTypeForSanitize = await ReportType.findById(report.reportTypeId).select("parameters");
      updates.parameters = sanitizeRichTextParameterValues(updates.parameters, reportTypeForSanitize);
    }

    const touchesContent =
      "parameters" in updates ||
      "patientInfo" in updates ||
      "remarks" in updates ||
      "sectionRemarks" in updates;
    if (touchesContent && !canEditReportContent(report, req.user)) {
      return res.status(403).json({
        success: false,
        message: `Not authorized to edit this report while it is "${report.status.value}"`,
      });
    }

    updates.updatedAt = new Date();

    const updatedReport = await Report.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true,
    });

    res.json({
      success: true,
      message: "Report updated successfully",
      data: updatedReport,
    });
  } catch (error) {
    console.error("Error updating report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update report",
    });
  }
});

// Submit a draft (or a report sent back for changes) for doctor approval.
// Re-validates required parameters server-side.
router.post("/:id/submit", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "submit", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const reportType = await ReportType.findById(report.reportTypeId);
    if (reportType) {
      const requiredNames = reportType.parameters.filter((p) => p.isRequired).map((p) => p.name);
      const providedNames = new Set(
        (report.parameters || [])
          .filter((p) => {
            // A datedReadings value is an array — [] is neither undefined,
            // null, nor "", so without this it would pass as "provided"
            // even with zero actual readings entered.
            if (Array.isArray(p.value)) {
              return p.value.some((entry) => String(entry?.value ?? "").trim() !== "");
            }
            return p.value !== undefined && p.value !== null && p.value !== "";
          })
          .map((p) => p.name)
      );
      const missing = requiredNames.filter((name) => !providedNames.has(name));
      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Missing required parameters: ${missing.join(", ")}`,
        });
      }
    }

    report.status = { value: "pendingApproval", ...statusUpdate(req.user) };
    await report.save();

    res.json({ success: true, message: "Report submitted for approval", data: report });
  } catch (error) {
    console.error("Error submitting report:", error);
    res.status(500).json({ success: false, message: "Failed to submit report" });
  }
});

// Doctor signs a report — appends an HMAC-verified signature record and locks content.
router.post("/:id/sign", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "sign", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    applySignature(report, req.user);
    await report.save();

    await logEvent({
      actor: req.user,
      action: "report.sign",
      category: "Signature",
      description: `Signed report ${reportLabel(report)}`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, message: "Report signed", data: report });
  } catch (error) {
    console.error("Error signing report:", error);
    res.status(500).json({ success: false, message: "Failed to sign report" });
  }
});

// A Doctor finalizing their own still-unsubmitted report directly — skips
// the approval queue entirely since the creator already has signing
// authority. Same signature-recording logic as /sign, different transition.
router.post("/:id/finalize", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "finalize", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    applySignature(report, req.user);
    await report.save();

    await logEvent({
      actor: req.user,
      action: "report.sign",
      category: "Signature",
      description: `Signed report ${reportLabel(report)} (self-authored, no approval queue)`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, message: "Report signed", data: report });
  } catch (error) {
    console.error("Error finalizing report:", error);
    res.status(500).json({ success: false, message: "Failed to finalize report" });
  }
});

// Doctor un-signs a report — invalidates the active signature, returns it to
// pendingApproval in the doctor's own hands (e.g. to self-correct then re-sign).
router.post("/:id/unsign", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "unsign", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    const sig = activeSignature(report);

    const settings = await LabSettings.findOne();
    const limitHours = settings?.workflowPolicy?.limitUnsignHours;
    if (limitHours && sig) {
      const elapsedHours = (Date.now() - new Date(sig.signedAt).getTime()) / (60 * 60 * 1000);
      if (elapsedHours > limitHours) {
        return res.status(400).json({
          success: false,
          message: `This report was signed more than ${limitHours} hours ago — un-sign is no longer allowed. Create a fresh report instead.`,
        });
      }
    }

    if (sig) {
      sig.invalidatedAt = new Date();
      sig.invalidatedReason = req.body.remarks;
    }

    report.status = { value: "pendingApproval", ...statusUpdate(req.user, req.body.remarks) };
    await report.save();

    await logEvent({
      actor: req.user,
      action: "report.unsign",
      category: "Signature",
      description: `Un-signed report ${reportLabel(report)}`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, message: "Report un-signed", data: report });
  } catch (error) {
    console.error("Error un-signing report:", error);
    res.status(500).json({ success: false, message: "Failed to un-sign report" });
  }
});

// Doctor sends a report back to the technician for corrections. Callable from
// pendingApproval or signed (invalidating the signature in the latter case).
router.post("/:id/request-changes", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "requestChanges", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    if (report.status.value === "signed") {
      const sig = activeSignature(report);
      if (sig) {
        sig.invalidatedAt = new Date();
        sig.invalidatedReason = req.body.remarks;
      }
    }

    report.status = { value: "changesRequested", ...statusUpdate(req.user, req.body.remarks) };
    await report.save();

    await logEvent({
      actor: req.user,
      action: "report.requestChanges",
      category: "Signature",
      description: `Requested changes on ${reportLabel(report)} — "${req.body.remarks}"`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, message: "Changes requested", data: report });
  } catch (error) {
    console.error("Error requesting changes:", error);
    res.status(500).json({ success: false, message: "Failed to request changes" });
  }
});

// Doctor rejects a report outright — terminal, no further transitions.
router.post("/:id/reject", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    const check = assertTransition(report, "reject", req.user, req.body?.remarks);
    if (!check.ok) {
      return res.status(check.status).json({ success: false, message: check.message });
    }

    report.status = { value: "rejected", ...statusUpdate(req.user, req.body.remarks) };
    await report.save();

    await logEvent({
      actor: req.user,
      action: "report.reject",
      category: "Signature",
      description: `Rejected report ${reportLabel(report)}`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, message: "Report rejected", data: report });
  } catch (error) {
    console.error("Error rejecting report:", error);
    res.status(500).json({ success: false, message: "Failed to reject report" });
  }
});

// Delete a report — Admin: any status. Doctor: any status except signed.
// Technician: their own draft or changesRequested only.
router.delete("/:id", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({
        success: false,
        message: "Report not found",
      });
    }

    if (!canDeleteReport(report, req.user)) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this report",
      });
    }

    const label = reportLabel(report);
    await Report.findByIdAndDelete(req.params.id);

    await logEvent({
      actor: req.user,
      action: "report.delete",
      category: "Access",
      description: `Deleted report ${label}`,
      targetType: "Report",
      targetId: req.params.id,
    });

    res.json({
      success: true,
      message: "Report deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting report:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete report",
    });
  }
});

// Render a signed report as a PDF. Also what the real "Download PDF" button
// calls, which makes PDF rendering testable without sending any mail.
//
// An optional ?include=id1,id2 merges other signed reports for the same
// linked patient into one combined PDF — the same set of reports the "also
// attach" picker offers, validated by the same guard POST /:id/email uses.
// With no ?include, behavior is unchanged from before this existed.
router.get("/:id/pdf", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    if (report.status?.value !== "signed") {
      return res.status(400).json({
        success: false,
        message: "Only a signed report can be exported as a PDF",
      });
    }

    const includeIds =
      typeof req.query.include === "string" && req.query.include.trim()
        ? req.query.include.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    let pdf;
    let filename;

    if (includeIds.length) {
      const resolved = await resolveAttachableReports(report, includeIds);
      if (!resolved.ok) {
        return res.status(resolved.status).json({ success: false, message: resolved.message });
      }
      const allReports = [report, ...resolved.extras];
      const buffers = await renderReportsPdfs(allReports.map((r) => r._id), req.user);
      pdf = await mergePdfBuffers(buffers);
      filename = mergedPdfFileName(report, allReports.length);
    } else {
      pdf = await renderReportPdf(report._id, req.user);
      filename = pdfFileName(report);
    }

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdf.length);
    res.send(pdf);
  } catch (error) {
    console.error("Error rendering report PDF:", error);
    res.status(500).json({
      success: false,
      message: "Failed to generate the report PDF",
    });
  }
});

// Retro-link a historical report to a patient.
//
// This is the on-demand replacement for a bulk migration. No script ever
// guessed which of eleven same-named rows were the same human; a person
// decides, one report at a time, and only for reports someone actually
// revisits.
//
// The report's signed patientInfo snapshot is NOT rewritten. An already-signed
// report keeps rendering exactly what was signed — re-pointing the link is
// precisely the operation the envelope was designed to tolerate.
router.post("/:id/link-patient", isAuthenticated, async (req, res) => {
  try {
    const { patientId } = req.body || {};
    if (!patientId) {
      return res.status(400).json({ success: false, message: "patientId is required" });
    }

    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    let patient = await Patient.findById(patientId).catch(() => null);
    if (!patient) {
      return res.status(400).json({ success: false, message: "That patient could not be found" });
    }
    if (patient.mergedInto) {
      const survivor = await Patient.findById(patient.mergedInto);
      if (survivor) patient = survivor;
    }

    const previousId = report.patientId;
    report.patientId = patient._id;

    // Backfill contact details onto the snapshot only where it is silent, and
    // only while the report is still unsigned. Filling a blank is a correction;
    // overwriting a recorded value would rewrite history, and doing either to
    // a signed report would break the hash it was signed against.
    if (report.status?.value !== "signed" && !report.signatures?.length) {
      if (!report.patientInfo.contact && patient.phone) report.patientInfo.contact = patient.phone;
      if (!report.patientInfo.address && patient.address) report.patientInfo.address = patient.address;
    }
    if (!report.patientEmail && patient.email) report.patientEmail = patient.email;

    await report.save();

    await logEvent({
      actor: req.user,
      action: previousId ? "report.relinkPatient" : "report.linkPatient",
      category: "Patient",
      description: previousId
        ? `Re-linked report ${reportLabel(report)} to ${patient.name} (${patient.patientId})`
        : `Linked report ${reportLabel(report)} to ${patient.name} (${patient.patientId})`,
      targetType: "Report",
      targetId: report._id,
    });

    res.json({ success: true, data: report });
  } catch (error) {
    if (error?.name === "CastError") {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    console.error("Error linking report to patient:", error);
    res.status(500).json({ success: false, message: "Failed to link this report to a patient" });
  }
});

// Other signed reports belonging to the same patient, for the multi-report
// attachment picker. There is no patient entity — patients exist only as
// patientInfo.name strings — so this is a case-insensitive exact name match,
// encapsulated here rather than widening the /filtered allow-list. The UI
// presents these as a checklist a human ticks; nothing is ever auto-attached.
router.get("/:id/related", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }

    // Both the picker's rows and the primary report itself show the template's
    // display name, not the internal reportTypeCode slug (e.g. "REPORT ON
    // BLOOD GROUPING", not "blood-group") — resolved here so the client never
    // has to fetch or cross-reference the report-types list just to label
    // this list.
    const primaryType = await ReportType.findById(report.reportTypeId).select("name");
    const primary = {
      _id: report._id,
      reportTypeCode: report.reportTypeCode,
      reportTypeName: primaryType?.name || report.reportTypeCode,
      patientInfo: report.patientInfo,
    };

    // Scoped strictly by the patient link, never by name. The name-match this
    // replaced (case-insensitive exact match on patientInfo.name) is exactly
    // what let a report be offered here — and then attached via POST
    // /:id/email's identical name check — for a DIFFERENT person who happens
    // to share a name: the real database behind this app has eleven reports
    // for "Sagar"/male across five different recorded ages. A report with no
    // patientId has no reliable identity to match against, so it now gets
    // an empty list rather than falling back to the name it used to trust.
    if (!report.patientId) {
      return res.json({ success: true, data: [], patientLinked: false, primary });
    }

    const related = await Report.find({
      _id: { $ne: report._id },
      patientId: report.patientId,
      "status.value": "signed",
    })
      .select("_id reportTypeId reportTypeCode patientInfo status createdAt")
      .sort({ createdAt: -1 })
      .limit(25);

    const types = await ReportType.find({
      _id: { $in: related.map((r) => r.reportTypeId) },
    }).select("name");
    const nameByTypeId = new Map(types.map((t) => [String(t._id), t.name]));

    const withNames = related.map((r) => ({
      _id: r._id,
      reportTypeCode: r.reportTypeCode,
      reportTypeName: nameByTypeId.get(String(r.reportTypeId)) || r.reportTypeCode,
      patientInfo: r.patientInfo,
      status: r.status,
      createdAt: r.createdAt,
    }));

    res.json({ success: true, data: withNames, patientLinked: true, primary });
  } catch (error) {
    console.error("Error fetching related reports:", error);
    res.status(500).json({ success: false, message: "Failed to fetch related reports" });
  }
});

// Email a signed report (optionally with other signed reports for the same
// patient attached) to the patient. Any authenticated role may send, matching
// the Print gate — the real restriction is that the report must be signed.
//
// Validation stays synchronous (so bad input still gets an immediate 4xx/503,
// exactly as before); the actual render→merge→send→persist pipeline is a
// background job (api/jobs/reportEmail.js) — see the plan this followed for
// why (it was blocking the request for as long as N sequential PDF renders
// plus an SMTP round trip took). This responds 202 the moment the job is
// queued; the frontend learns completion via the SSE push.
router.post("/:id/email", isAuthenticated, async (req, res) => {
  try {
    if (!isMailConfigured()) {
      return res.status(503).json({
        success: false,
        message:
          "Email is not configured on the server yet — an Admin can set it up in Lab Settings.",
      });
    }

    const primary = await Report.findById(req.params.id);
    if (!primary) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    if (primary.status?.value !== "signed") {
      return res.status(400).json({
        success: false,
        message: "Only a signed report can be emailed",
      });
    }

    const recipient = (req.body?.recipient || primary.patientEmail || "").trim();
    if (!recipient) {
      return res.status(400).json({
        success: false,
        message: "No recipient email address — enter one to send this report",
      });
    }
    if (!isValidEmail(recipient)) {
      return res.status(400).json({
        success: false,
        message: "That doesn't look like a valid email address",
      });
    }

    // Extra attachments must be signed AND belong to the same patient — see
    // resolveAttachableReports' own comment for why this is checked by
    // patientId equality rather than name equality. Re-validated again
    // inside the job itself at run time, since a report's status can change
    // between enqueue and processing.
    const extraIds = Array.isArray(req.body?.includeReportIds) ? req.body.includeReportIds : [];
    const resolved = await resolveAttachableReports(primary, extraIds);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, message: resolved.message });
    }
    const allReports = [primary, ...resolved.extras];

    // Fails fast (bounded retry, ~200ms) rather than letting queue.add()
    // below hang on the BullMQ connection's own unbounded reconnect loop —
    // that loop is correct behavior for a long-running server, but wrong to
    // wait out inside a single HTTP request.
    try {
      await pingRedis();
    } catch (_) {
      return res.status(503).json({
        success: false,
        message: "Report delivery is temporarily unavailable — try again shortly.",
      });
    }

    const jobId = emailJobId(primary._id, extraIds, recipient);
    const { job, deduped } = await enqueueWithDedup(
      reportDeliveryQueue,
      "report-email",
      {
        primaryReportId: String(primary._id),
        includeReportIds: extraIds.map(String),
        recipient,
        actor: { userId: String(req.user._id), name: req.user.name, role: req.user.role },
        requestedAt: new Date().toISOString(),
      },
      jobId,
      JOB_OPTIONS.reportEmail
    );

    res.status(202).json({
      success: true,
      message: deduped ? "Report send already in progress" : "Report queued for sending",
      data: {
        jobId: job.id,
        status: "queued",
        deduped,
        recipient,
        // "attachments" here means reports included, not literal files — the
        // email always carries exactly one merged PDF, but the frontend's
        // toast reads this as "N reports sent" and should stay correct.
        attachments: allReports.length,
      },
    });
  } catch (error) {
    console.error("Error queuing report email:", error);
    if (error.code === "ECONNREFUSED" || /redis/i.test(error.message || "")) {
      return res.status(503).json({
        success: false,
        message: "Report delivery is temporarily unavailable — try again shortly.",
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || "Failed to queue the report email",
    });
  }
});

// Enqueue a PDF render job for a signed report (optionally merged with other
// signed reports for the same patient — same ?include= semantics the old
// synchronous GET /:id/pdf supported). Responds immediately with a jobId;
// the frontend fetches the actual bytes from GET /pdf-jobs/:jobId/result
// once the SSE push reports completion.
router.post("/:id/pdf-jobs", isAuthenticated, async (req, res) => {
  try {
    const report = await Report.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    if (report.status?.value !== "signed") {
      return res.status(400).json({
        success: false,
        message: "Only a signed report can be exported as a PDF",
      });
    }

    const includeIds =
      typeof req.body?.includeReportIds !== "undefined"
        ? (Array.isArray(req.body.includeReportIds) ? req.body.includeReportIds : [])
        : typeof req.query.include === "string" && req.query.include.trim()
        ? req.query.include.split(",").map((s) => s.trim()).filter(Boolean)
        : [];

    const resolved = await resolveAttachableReports(report, includeIds);
    if (!resolved.ok) {
      return res.status(resolved.status).json({ success: false, message: resolved.message });
    }
    const allReports = [report, ...resolved.extras];
    const filename = mergedPdfFileName(report, allReports.length);

    try {
      await pingRedis();
    } catch (_) {
      return res.status(503).json({
        success: false,
        message: "PDF generation is temporarily unavailable — try again shortly.",
      });
    }

    const jobId = pdfJobId(report._id, includeIds);
    const { job, deduped } = await enqueueWithDedup(
      reportDeliveryQueue,
      "report-pdf",
      {
        primaryReportId: String(report._id),
        includeReportIds: includeIds.map(String),
        actor: { userId: String(req.user._id), name: req.user.name, role: req.user.role },
        requestedAt: new Date().toISOString(),
      },
      jobId,
      JOB_OPTIONS.reportPdf
    );

    res.status(202).json({ success: true, data: { jobId: job.id, status: "queued", deduped, filename } });
  } catch (error) {
    console.error("Error queuing report PDF render:", error);
    if (error.code === "ECONNREFUSED" || /redis/i.test(error.message || "")) {
      return res.status(503).json({
        success: false,
        message: "PDF generation is temporarily unavailable — try again shortly.",
      });
    }
    res.status(500).json({ success: false, message: "Failed to queue the PDF render" });
  }
});

// Reconciliation endpoint — called once after an SSE reconnect for any job
// the client still considers open, not polled on an interval.
router.get("/pdf-jobs/:jobId", isAuthenticated, async (req, res) => {
  try {
    const job = await reportDeliveryQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    if (String(job.data?.actor?.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Not your job" });
    }
    const state = await job.getState();
    res.json({
      success: true,
      data: {
        jobId: job.id,
        state,
        progress: job.progress,
        returnvalue: job.returnvalue,
        failedReason: job.failedReason,
      },
    });
  } catch (error) {
    console.error("Error fetching PDF job state:", error);
    res.status(500).json({ success: false, message: "Failed to fetch job state" });
  }
});

// Fetches a completed report-pdf job's bytes. Single-use: deletes the Redis
// blob after a successful send so the common case frees it immediately
// rather than waiting out PDF_RESULT_TTL_SECONDS.
router.get("/pdf-jobs/:jobId/result", isAuthenticated, async (req, res) => {
  try {
    const job = await reportDeliveryQueue.getJob(req.params.jobId);
    if (!job) {
      return res.status(404).json({ success: false, message: "Job not found" });
    }
    // A jobId is not a secret — without this check it would be a bearer
    // token for another user's patient PDF.
    if (String(job.data?.actor?.userId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: "Not your job" });
    }

    const buffer = await pdfStore.getBuffer(req.params.jobId);
    if (!buffer || !buffer.length) {
      return res.status(410).json({
        success: false,
        message: "That download has expired — generate it again.",
      });
    }

    const filename = job.returnvalue?.filename || "report.pdf";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", buffer.length);
    res.send(buffer);
    await pdfStore.del(req.params.jobId);
  } catch (error) {
    console.error("Error fetching PDF job result:", error);
    res.status(500).json({ success: false, message: "Failed to fetch the rendered PDF" });
  }
});

// Filtered search — allow-listed keys only (was previously `Report.find(req.body)`
// with the raw request body as the Mongo filter).
router.post("/filtered", isAuthenticated, async (req, res) => {
  try {
    const requested = req.body || {};
    const filters = {};
    for (const key of FILTERABLE_FIELDS) {
      const value = requested[key];
      if (value === undefined) continue;
      // Allow-listing the key was never enough on its own: an object value
      // reaches Mongo as a query operator, so {"patientInfo.name": {"$regex": ".*"}}
      // would have been honoured. Only primitives are accepted.
      if (value !== null && typeof value === "object") {
        return res.status(400).json({
          success: false,
          message: `Filter "${key}" must be a plain value`,
        });
      }
      filters[key] = value;
    }

    const reports = await Report.find(filters).sort({ createdAt: -1 });
    res.json({
      success: true,
      data: reports,
    });
  } catch (error) {
    console.error("Error fetching reports:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reports",
    });
  }
});

module.exports = router;
