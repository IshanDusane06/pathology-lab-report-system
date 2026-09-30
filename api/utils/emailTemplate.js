// Our own branding — the Metropolis sample was a workflow reference only.
// Two things from it are deliberately not reproduced: its branding, and its
// external/broken inline images (a locked-down mail client renders those as
// empty boxes). This template loads nothing from the network at all.
//
// Table-based layout with inline CSS is the only thing that survives Outlook
// and Gmail reliably; a real plain-text alternative ships alongside for
// accessibility and spam scoring.

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/**
 * @param {Object[]} reports  signed report docs being attached
 * @param {Object}   labSettings
 * @param {string}   patientName
 */
function buildReportEmail({ reports, labSettings, patientName }) {
  const labName = labSettings?.labName || 'Our Laboratory';
  const tagline = labSettings?.tagline || '';
  const address = labSettings?.address || '';
  const regNo = labSettings?.registrationNumber || '';
  const footerNote = labSettings?.email?.footerNote || '';

  const count = reports.length;
  const subject =
    count > 1
      ? `${labName} — Test reports for ${patientName} (${count} reports)`
      : `${labName} — Test report for ${patientName}`;

  const rows = reports
    .map(
      (r) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e6e8eb;font-size:14px;color:#111827;">${escapeHtml(
            r.reportTypeName || r.reportTypeCode
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6e8eb;font-size:14px;color:#4b5563;">${escapeHtml(
            formatDate(r.patientInfo?.date)
          )}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #e6e8eb;font-size:14px;color:#047857;">Signed</td>
        </tr>`
    )
    .join('');

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f6f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e6e8eb;border-radius:8px;">

          <tr>
            <td style="padding:24px 24px 8px 24px;border-bottom:1px solid #e6e8eb;">
              <div style="font-size:18px;font-weight:700;color:#111827;font-family:Georgia,serif;">${escapeHtml(labName)}</div>
              ${tagline ? `<div style="font-size:13px;color:#6b7280;margin-top:2px;">${escapeHtml(tagline)}</div>` : ''}
            </td>
          </tr>

          <tr>
            <td style="padding:20px 24px 4px 24px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 12px 0;font-size:14px;color:#111827;">Dear Sir / Madam,</p>
              <p style="margin:0 0 12px 0;font-size:14px;color:#374151;line-height:1.5;">
                Please find ${count > 1 ? 'the reports' : 'the report'} for
                <strong>${escapeHtml(patientName)}</strong> attached to this email as a single PDF file${
                  count > 1 ? `, combining all ${count} reports` : ''
                }.
                ${count > 1 ? 'They have' : 'It has'} been reviewed and digitally signed by our consulting pathologist.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:8px 24px 4px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e6e8eb;border-radius:6px;border-collapse:separate;font-family:Arial,Helvetica,sans-serif;">
                <tr style="background:#f9fafb;">
                  <th align="left" style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:1px solid #e6e8eb;">Test</th>
                  <th align="left" style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:1px solid #e6e8eb;">Report date</th>
                  <th align="left" style="padding:10px 12px;font-size:12px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;border-bottom:1px solid #e6e8eb;">Status</th>
                </tr>
                ${rows}
              </table>
            </td>
          </tr>

          ${
            footerNote
              ? `<tr><td style="padding:16px 24px 0 24px;font-family:Arial,Helvetica,sans-serif;">
                   <p style="margin:0;font-size:13px;color:#374151;line-height:1.5;">${escapeHtml(footerNote)}</p>
                 </td></tr>`
              : ''
          }

          <tr>
            <td style="padding:16px 24px 20px 24px;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.5;">
                This report is confidential and intended only for the named patient and their treating clinician.
                Laboratory investigations should be interpreted alongside clinical findings, not in isolation.
                If you have received this email in error, please notify the laboratory and delete it.
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:16px 24px;background:#f9fafb;border-top:1px solid #e6e8eb;border-radius:0 0 8px 8px;font-family:Arial,Helvetica,sans-serif;">
              <div style="font-size:13px;font-weight:600;color:#111827;">${escapeHtml(labName)}</div>
              ${address ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;">${escapeHtml(address)}</div>` : ''}
              ${regNo ? `<div style="font-size:12px;color:#6b7280;margin-top:3px;">Reg. No: ${escapeHtml(regNo)}</div>` : ''}
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const textLines = [
    `Dear Sir / Madam,`,
    ``,
    `Please find ${count > 1 ? 'the reports' : 'the report'} for ${patientName} attached to this email` +
      `${count > 1 ? ` as a single PDF file, combining all ${count} reports` : ' as a PDF file'}.`,
    `${count > 1 ? 'They have' : 'It has'} been reviewed and digitally signed by our consulting pathologist.`,
    ``,
    ...reports.map(
      (r) => `  - ${r.reportTypeName || r.reportTypeCode}` +
        `${formatDate(r.patientInfo?.date) ? ` (${formatDate(r.patientInfo.date)})` : ''} — Signed`
    ),
    ``,
    ...(footerNote ? [footerNote, ``] : []),
    `This report is confidential and intended only for the named patient and their treating clinician.`,
    `Laboratory investigations should be interpreted alongside clinical findings, not in isolation.`,
    `If you have received this email in error, please notify the laboratory and delete it.`,
    ``,
    labName,
    ...(address ? [address] : []),
    ...(regNo ? [`Reg. No: ${regNo}`] : []),
  ];

  return { subject, html, text: textLines.join('\n') };
}

function buildTestEmail({ labSettings }) {
  const labName = labSettings?.labName || 'Our Laboratory';
  return {
    subject: `${labName} — Email configuration test`,
    text:
      `This is a test email from ${labName}'s reporting system.\n\n` +
      `If you are reading this, outgoing email is configured correctly and signed reports can be delivered to patients.`,
    html: `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5;">
      <p style="margin:0 0 12px 0;">This is a test email from <strong>${escapeHtml(labName)}</strong>'s reporting system.</p>
      <p style="margin:0;color:#374151;">If you are reading this, outgoing email is configured correctly and signed reports can be delivered to patients.</p>
    </div>`,
  };
}

module.exports = { buildReportEmail, buildTestEmail };
