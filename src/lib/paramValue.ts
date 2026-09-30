// Whether a parameter's value counts as "nothing entered yet" — shared by
// every "is this required field filled in" check (client-side validation on
// save/submit, and ReportReadOnlyView's hasValue(), which also drives
// section auto-hide). A scalar value uses plain emptiness; a "datedReadings"
// or "breakdown" value is an array, and [] is neither undefined, null, nor ""
// in JS, so it would otherwise pass every existing check as "provided" with
// zero actual entries filled in. Both array shapes carry their own `.value`
// (a datedReadings entry alongside `date`, a breakdown entry alongside
// `label`), so checking just `.value` here works for either without needing
// to know which one it is.
export function isParamValueEmpty(value: unknown): boolean {
  if (Array.isArray(value)) {
    return !value.some((entry) => String((entry as { value?: unknown })?.value ?? "").trim() !== "");
  }
  return value === undefined || value === null || value === "";
}
