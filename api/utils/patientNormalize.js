// Normalization helpers for patient identity fields.
//
// The normalized forms are what actually get indexed and searched; the raw
// `name`/`phone` a technician typed are preserved untouched for display.
//
// The split exists for one measured reason: an index can only be SEEKED into
// by an anchored, case-sensitive regex. With a /i flag MongoDB still reads the
// index, but reads all of it — an index seek degrades into a full index scan.
// Measured on this collection: the same single-result query examined 1 key
// case-sensitively and 33 (every key present) case-insensitively. So search
// compares an already-lowercased stored field against an already-lowercased
// query, and never reaches for /i.

// Lowercased, whitespace-collapsed. This is the searchable form.
function normalizeName(name) {
  return String(name || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Digits only, keeping the last 10 — so "+91 98765 43210", "098765 43210"
// and "9876543210" all normalize to the same key. Deliberately NOT unique:
// families share one number, which is a supported case, not a conflict.
function normalizePhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Raw user input is never compiled into a RegExp unescaped — same escape the
// related-reports query already uses.
function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Age resolution, single source of truth. DOB is authoritative when present;
// otherwise the recorded age is returned along with when it was recorded, so
// a stale age is visibly stale rather than silently wrong.
function resolveAge(patient, asOf = new Date()) {
  if (patient?.dob) {
    const dob = new Date(patient.dob);
    let years = asOf.getFullYear() - dob.getFullYear();
    const monthDelta = asOf.getMonth() - dob.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < dob.getDate())) {
      years -= 1;
    }
    return { years: Math.max(0, years), source: 'dob', recordedAt: null };
  }
  if (patient?.ageYears != null) {
    return {
      years: patient.ageYears,
      source: 'recorded',
      recordedAt: patient.ageRecordedAt || null,
    };
  }
  return { years: null, source: 'unknown', recordedAt: null };
}

// A real HTML5 <input type="date"> always yields "YYYY-MM-DD". The Date
// constructor doesn't reject an overflowed calendar date like "1997-06-31"
// (June has 30 days) — it silently rolls forward to July 1st instead of
// returning NaN, so `isNaN(new Date(...))` alone never catches it. Round-
// tripping through the individual year/month/day components does: a date
// that got rolled forward disagrees with the month/day it was built from.
function isValidDobString(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(year, month - 1, day);
  return asDate.getFullYear() === year && asDate.getMonth() === month - 1 && asDate.getDate() === day;
}

// Mobile numbers are recorded as exactly 10 digits — the frontend strips
// anything else as the user types, but the server never trusts that alone.
const PHONE_PATTERN = /^\d{10}$/;
function isValidPhone(value) {
  return PHONE_PATTERN.test(String(value || '').trim());
}

// Same permissive-but-real pattern already used for report delivery emails
// (api/routes/reports.js) — catches typos without rejecting valid but
// unusual addresses.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function isValidEmail(value) {
  return EMAIL_PATTERN.test(String(value || '').trim());
}

module.exports = {
  normalizeName,
  normalizePhone,
  escapeRegex,
  resolveAge,
  isValidDobString,
  isValidPhone,
  isValidEmail,
};
