const crypto = require('crypto');

// A "datedReadings" or "breakdown" parameter's value is an array of entries,
// not a scalar — and nothing upstream guarantees insertion order, so two
// saves of the exact same logical content could otherwise hash differently
// depending on which order the UI happened to save them in. Sorting here
// means save order can never masquerade as a content change.
//
// The two entry shapes are kept on separate branches deliberately: a
// datedReadings entry has a `date` key, a breakdown entry has a `label` key
// instead. The datedReadings branch below is byte-for-byte unchanged from
// before breakdown existed — any already-signed report using datedReadings
// must keep hashing exactly the same way, or its signature would stop
// verifying. Merging the two shapes into one canonical object (e.g. adding a
// `label: null` field to every datedReadings entry) would silently do that,
// so they stay separate instead.
function canonicalizeParameterValue(value) {
  if (!Array.isArray(value)) return value ?? null;
  const isBreakdown = value.some((entry) => entry && typeof entry === 'object' && 'label' in entry);
  if (isBreakdown) {
    return [...value]
      .map((entry) => ({
        label: entry?.label ?? null,
        value: entry?.value ?? null
      }))
      .sort((a, b) => String(a.label).localeCompare(String(b.label)));
  }
  return [...value]
    .map((entry) => ({
      date: entry?.date ?? null,
      value: entry?.value ?? null
    }))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Deterministic shaping of report content before hashing: `parameters` is an
// array (order isn't guaranteed stable across request paths) and plain-object
// key order isn't safe to hash directly, so every field is explicitly ordered
// and null-coalesced here.
function canonicalizeReportContent({ parameters = [], patientInfo = {}, reportTypeId, remarks = null }) {
  const sortedParams = [...parameters]
    .map((p) => ({
      name: p.name,
      value: canonicalizeParameterValue(p.value),
      unit: p.unit ?? null,
      section: p.section ?? null,
      notes: p.notes ?? null
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    reportTypeId: String(reportTypeId),
    patientInfo: {
      name: patientInfo.name ?? null,
      date: patientInfo.date ? new Date(patientInfo.date).toISOString() : null,
      referredBy: patientInfo.referredBy ?? null,
      sex: patientInfo.sex ?? null,
      age: patientInfo.age ?? null,
      contact: patientInfo.contact ?? null,
      address: patientInfo.address ?? null
    },
    parameters: sortedParams,
    remarks: remarks ?? null
  };
}

function computeContentHash(report) {
  const canonical = canonicalizeReportContent(report);
  return crypto.createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
}

function computeHmac(contentHash) {
  return crypto.createHmac('sha256', process.env.SIGNING_SECRET).update(contentHash).digest('hex');
}

module.exports = { canonicalizeReportContent, computeContentHash, computeHmac };
