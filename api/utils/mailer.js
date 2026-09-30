const nodemailer = require('nodemailer');

// SMTP credentials come from env only — never from the database, never
// returned by any API. LabSettings holds the presentation half (sender name,
// From address, reply-to), which is safe to expose and Admin-editable.
function smtpConfig() {
  return {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    // Port 465 is implicit TLS; 587 upgrades via STARTTLS.
    secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  };
}

// Whether the server has enough env config to attempt a send at all. The
// route turns a false here into a 503 pointing the user at Lab Settings,
// rather than letting nodemailer fail with a cryptic transport error.
function isMailConfigured() {
  const { host, user, pass } = smtpConfig();
  return Boolean(host && user && pass);
}

let transporter = null;

function getTransport() {
  if (!isMailConfigured()) return null;
  if (!transporter) {
    const { host, port, secure, user, pass } = smtpConfig();
    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });
  }
  return transporter;
}

// Resolves the From header from LabSettings, falling back to the SMTP
// account. Gmail requires these to match (or be a verified alias) — the
// mismatch is surfaced in the Admin UI rather than discovered at send time.
function resolveFrom(labSettings) {
  const address = labSettings?.email?.senderAddress || process.env.SMTP_USER;
  const name = labSettings?.email?.senderName || labSettings?.labName || '';
  return name ? `"${name}" <${address}>` : address;
}

async function sendMail({ to, subject, html, text, attachments, labSettings }) {
  const transport = getTransport();
  if (!transport) {
    throw new Error('Email is not configured on the server');
  }

  const replyTo = labSettings?.email?.replyTo || undefined;

  const info = await transport.sendMail({
    from: resolveFrom(labSettings),
    to,
    replyTo,
    subject,
    text,
    html,
    attachments,
  });

  return { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected };
}

// Used by the Admin "Send test email" button — verifies the transport can
// actually authenticate before anyone tries it against a real patient.
async function verifyTransport() {
  const transport = getTransport();
  if (!transport) throw new Error('Email is not configured on the server');
  await transport.verify();
  return true;
}

module.exports = { isMailConfigured, sendMail, verifyTransport, resolveFrom, smtpConfig };
