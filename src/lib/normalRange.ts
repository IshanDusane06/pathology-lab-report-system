import { NormalValue } from "@/services/reportTypesApi";

// Picks the right normalValues[] entry for a specific patient — the one
// place gender/age matching happens, reused by the live data-entry form and
// the final read-only report so both agree, and so a template with several
// ranges (e.g. Hemoglobin's separate male/female bands) actually shows the
// one that applies instead of always the first one defined.
export function selectNormalValue(
  normalValues: NormalValue[] | undefined,
  sex?: string | null,
  age?: string | number | null,
): NormalValue | null {
  if (!normalValues?.length) return null;

  const numAge = typeof age === "string" ? parseInt(age, 10) : age;
  const ageKnown = typeof numAge === "number" && !isNaN(numAge);
  const sexNorm = (sex || "").toLowerCase();

  const matches = normalValues.filter((nv) => {
    const genderOk = nv.gender === "all" || nv.gender === sexNorm;
    const ageOk =
      !ageKnown ||
      ((nv.ageRange?.min == null || numAge! >= nv.ageRange.min) &&
        (nv.ageRange?.max == null || numAge! <= nv.ageRange.max));
    return genderOk && ageOk;
  });

  // A specific-gender match is more useful than a generic "all" one when
  // both qualify (e.g. sex known, both a male-specific and an all-gender
  // range technically fit — the specific one is what should print).
  const specific = matches.find((nv) => nv.gender !== "all");
  if (specific) return specific;
  if (matches.length) return matches[0];

  // Nothing matched (e.g. a data gap in age-band coverage) — degrade to
  // showing *some* range rather than none.
  return normalValues.find((nv) => nv.gender === "all") || normalValues[0];
}
