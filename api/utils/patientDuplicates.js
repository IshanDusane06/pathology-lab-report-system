const Patient = require('../models/Patient');
const { normalizeName, normalizePhone, resolveAge } = require('./patientNormalize');
const { phoneticKey } = require('./phonetic');

// How close two recorded ages must be to count as corroborating evidence.
// Wide enough to survive the age drift that re-typing on every visit causes,
// narrow enough that a parent and child sharing a name don't collide.
const AGE_TOLERANCE_YEARS = 3;

// Candidate duplicates for a patient about to be created (or edited).
//
// This runs BEFORE the record is committed — prevention at the point of entry
// is what actually keeps duplicate counts low. Merging is the cleanup path,
// not the strategy. Nothing here ever blocks on its own: a strong match is
// surfaced for a human to judge, because the single strongest signal (a
// shared phone number) is also completely normal within a family.
async function findDuplicateCandidates(input, options = {}) {
  const { excludeId = null, limit = 8 } = options;

  const nameNormalized = normalizeName(input.name);
  const phoneNormalized = normalizePhone(input.phone);
  const namePhonetic = phoneticKey(input.name);

  const signals = [];
  if (phoneNormalized) signals.push({ phoneNormalized });
  if (nameNormalized) signals.push({ nameNormalized });
  if (namePhonetic) signals.push({ namePhonetic, sex: input.sex });

  if (!signals.length) return [];

  const query = { $or: signals, mergedInto: null };
  if (excludeId) query._id = { $ne: excludeId };

  // One round trip for all three signals; scoring happens in memory over a
  // handful of rows, never in the database.
  const rows = await Patient.find(query).limit(50);

  const incoming = resolveAge({ dob: input.dob, ageYears: input.ageYears });

  const scored = rows
    .map((patient) => {
      const reasons = [];
      let confidence = null;

      if (phoneNormalized && patient.phoneNormalized === phoneNormalized) {
        confidence = 'strong';
        reasons.push('Same phone number');
      }

      if (nameNormalized && patient.nameNormalized === nameNormalized) {
        if (patient.sex === input.sex) {
          confidence = 'strong';
          reasons.push('Same name and sex');
        } else if (confidence !== 'strong') {
          confidence = 'medium';
          reasons.push('Same name, different sex on record');
        }
      }

      if (
        confidence !== 'strong' &&
        namePhonetic &&
        patient.namePhonetic === namePhonetic &&
        patient.sex === input.sex
      ) {
        const existing = resolveAge(patient);
        const agesComparable = incoming.years != null && existing.years != null;
        const agesClose =
          agesComparable && Math.abs(incoming.years - existing.years) <= AGE_TOLERANCE_YEARS;

        if (agesClose || !agesComparable) {
          confidence = confidence || 'medium';
          reasons.push(
            agesClose
              ? 'Name sounds the same, similar age'
              : 'Name sounds the same, age not recorded'
          );
        }
      }

      if (!confidence) return null;
      return { patient, confidence, reasons };
    })
    .filter(Boolean);

  // Strongest first, then most recently seen — the order a human should
  // review them in.
  const rank = { strong: 0, medium: 1 };
  scored.sort(
    (a, b) =>
      rank[a.confidence] - rank[b.confidence] ||
      new Date(b.patient.createdAt) - new Date(a.patient.createdAt)
  );

  return scored.slice(0, limit);
}

module.exports = { findDuplicateCandidates, AGE_TOLERANCE_YEARS };
