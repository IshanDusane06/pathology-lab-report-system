// Shared validation for the patient create/edit dialogs. Mirrors the
// server-side checks in api/utils/patientNormalize.js exactly, so a rejected
// value never round-trips to the server just to bounce back with a 400.

// A native <input type="date"> always yields "YYYY-MM-DD". The Date
// constructor doesn't reject an overflowed calendar date like "1997-06-31"
// (June has 30 days) — it silently rolls forward to July 1st instead of
// producing an invalid date, so `isNaN(new Date(...))` alone never catches
// it. Round-tripping through the individual year/month/day components does:
// a date that got rolled forward disagrees with the month/day it was built
// from.
export function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const asDate = new Date(year, month - 1, day);
  return asDate.getFullYear() === year && asDate.getMonth() === month - 1 && asDate.getDate() === day;
}

// Mobile numbers are entered as exactly 10 digits — the phone input strips
// anything else as the user types, so by the time validate() runs this is
// really just a length check.
export const PHONE_PATTERN = /^\d{10}$/;
export function isValidPhone(value: string): boolean {
  return PHONE_PATTERN.test(value.trim());
}

// Same permissive-but-real pattern already used for report delivery emails
// (SendReportEmailDialog.tsx / api/routes/reports.js) — catches typos
// without rejecting valid but unusual addresses.
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

// The patient dialogs capture date of birth as three separate Day/Month/Year
// fields rather than a native <input type="date"> — measured directly: when
// a typed day doesn't exist for the given month (e.g. day 31 in June), the
// browser's native date input silently resets its own .value to "" with no
// validity flag raised (validity.badInput stays false), even mid-entry. That
// makes an invalid date indistinguishable from an untouched field, so no
// error can ever fire and the record silently saves with no DOB at all.
// Explicit fields sidestep the native control entirely — we always know
// exactly what was typed.

export function splitIsoDate(iso: string | null | undefined): { day: string; month: string; year: string } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!match) return { day: "", month: "", year: "" };
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
}

// Formatting only — does NOT check the date actually exists (see
// isValidCalendarDate for that). Returns "" unless all three parts are
// present and the year is a genuine 4-digit year, so a still-in-progress
// entry (e.g. year typed as "99") never turns into a plausible-looking date.
export function combineDateParts(day: string, month: string, year: string): string {
  if (!day || !month || year.length !== 4) return "";
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y)) return "";
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
