const { UnrecoverableError } = require('bullmq');
const Report = require('../models/Report');
const ReportType = require('../models/ReportType');
const LabSettings = require('../models/LabSettings');
const User = require('../models/User');
const { sendMail } = require('../utils/mailer');
const { buildReportEmail } = require('../utils/emailTemplate');
const { logEvent } = require('../utils/auditLog');
const { renderReports } = require('./renderReports');

// A permanent SMTP rejection (bad mailbox, policy reject) should fail the
// job immediately rather than retry — retrying just resends the same
// rejected address three times and writes three identical failure rows.
// 5xx SMTP response codes are permanent by protocol definition; 4xx are
// transient (greylisting, temp failure) and should retry normally.
function isPermanentMailError(error) {
  const code = error?.responseCode;
  return typeof code === 'number' && code >= 500 && code < 600;
}

async function reportEmailJob(job) {
  const { primaryReportId, includeReportIds, recipient, actor } = job.data;

  const actorUser = await User.findById(actor.userId);
  if (!actorUser) {
    throw new UnrecoverableError('The user who requested this send no longer exists');
  }

  let primary;
  let allReports;
  try {
    const rendered = await renderReports({
      primaryReportId,
      includeReportIds,
      user: actorUser,
    });
    primary = rendered.primary;
    allReports = rendered.allReports;

    // Retry-safety: if a previous attempt of THIS job already sent (and only
    // the follow-up persistence step failed before the worker died), don't
    // send the patient a second email — just re-run the persistence.
    //
    // Matched on activityId, NOT jobId: jobIds are deterministic content
    // hashes and enqueueWithDedup re-adds the SAME id for a deliberate
    // resend, so a jobId match would find the ORIGINAL send's delivery and
    // silently skip a resend the user explicitly asked for. activityId is
    // unique per user action, so it only ever matches this job's own earlier
    // attempt.
    if (job.attemptsMade > 0 && job.data.activityId) {
      const fresh = await Report.findById(primary._id);
      const alreadySent = (fresh?.deliveries || []).some(
        (d) => String(d.activityId) === String(job.data.activityId) && d.status === 'sent'
      );
      if (alreadySent) {
        return { recipient, attachments: allReports.length, resent: false, alreadySent: true };
      }
    }

    const [labSettings, types] = await Promise.all([
      LabSettings.findOne(),
      ReportType.find({ _id: { $in: allReports.map((r) => r.reportTypeId) } }).select('_id name'),
    ]);
    const typeName = new Map(types.map((t) => [String(t._id), t.name]));

    const attachments = [
      {
        filename: rendered.filename,
        content: rendered.mergedPdf,
        contentType: 'application/pdf',
      },
    ];

    const { subject, html, text } = buildReportEmail({
      reports: allReports.map((r) => ({
        reportTypeCode: r.reportTypeCode,
        reportTypeName: typeName.get(String(r.reportTypeId)),
        patientInfo: r.patientInfo,
      })),
      labSettings,
      patientName: primary.patientInfo?.name || 'Patient',
    });

    let messageId;
    try {
      ({ messageId } = await sendMail({ to: recipient, subject, html, text, attachments, labSettings }));
    } catch (sendError) {
      if (isPermanentMailError(sendError)) {
        throw new UnrecoverableError(sendError.message);
      }
      throw sendError;
    }

    // Recorded on every report in the email, each carrying the full set, so
    // any one report can answer "was this delivered, to whom, when, by whom".
    const delivery = {
      channel: 'email',
      recipient,
      status: 'sent',
      messageId,
      activityId: job.data.activityId || null,
      jobId: job.id,
      includedReportIds: allReports.map((r) => r._id),
      sentBy: { userId: actorUser._id, name: actorUser.name, role: actorUser.role },
      sentAt: new Date(),
    };
    await Promise.all(
      allReports.map((report) => {
        report.deliveries.push(delivery);
        if (!report.patientEmail) report.patientEmail = recipient;
        return report.save();
      })
    );

    await logEvent({
      actor: actorUser,
      action: 'report.email',
      category: 'Delivery',
      description: `Emailed ${allReports.length} report(s) for ${primary.patientInfo?.name || 'Unknown'} to ${recipient}`,
      targetType: 'Report',
      targetId: primary._id,
    });

    return { recipient, attachments: allReports.length, messageId };
  } catch (error) {
    // A failed send is exactly the case someone needs the history for.
    // Same asymmetry as the old synchronous handler: recorded on the
    // primary report only, not every extra — deliberately not "fixed" here.
    if (primary) {
      try {
        primary.deliveries.push({
          channel: 'email',
          recipient,
          status: 'failed',
          error: error.message,
          activityId: job.data.activityId || null,
          jobId: job.id,
          includedReportIds: (allReports || [primary]).map((r) => r._id),
          sentBy: { userId: actorUser._id, name: actorUser.name, role: actorUser.role },
          sentAt: new Date(),
        });
        await primary.save();
      } catch (_) {
        // Recording the failure must never mask the original error.
      }

      await logEvent({
        actor: actorUser,
        action: 'report.email.failed',
        category: 'Delivery',
        description: `Failed to email report for ${primary.patientInfo?.name || 'Unknown'} to ${recipient}: ${error.message}`,
        targetType: 'Report',
        targetId: primary._id,
      }).catch(() => {});
    }
    throw error;
  }
}

module.exports = { reportEmailJob, isPermanentMailError };
