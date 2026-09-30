// Remarks are stored as small, sanitized HTML (bold/italic/underline/line
// breaks only) so a technician/doctor/admin can format part of a line, not
// just the whole field. Older data predates this and is plain text with
// literal newlines — this tells the two apart so no DB migration is needed.
const RICH_TAG_PATTERN = /<\/?(b|strong|i|em|u|br|div|span)\b/i;

// sanitize-html (the server-side sanitizer every value goes through before
// saving) entity-escapes "&"/"<"/">" even in a value with no formatting tags
// at all — a plain sentence containing "&" comes back as e.g. "A &amp; B",
// tagless but already safe HTML. Without also checking for that, such a
// value was misread as legacy unescaped plain text and escaped a *second*
// time, turning "&amp;" into the literal text "&amp;amp;" once rendered —
// exactly the "&amp; Induration &lt; 5 mm" bug this fixes.
const HTML_ENTITY_PATTERN = /&(amp|lt|gt|quot|#39);/i;

export function looksLikeRichText(raw: string): boolean {
  return RICH_TAG_PATTERN.test(raw) || HTML_ENTITY_PATTERN.test(raw);
}

function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Renders either kind of stored value as safe HTML: passes real rich text
// through untouched (already sanitized server-side before it was saved),
// otherwise escapes legacy plain text and turns its newlines into <br>.
export function toRemarksHtml(raw: string | null | undefined): string {
  if (!raw) return "";
  if (looksLikeRichText(raw)) return raw;
  return escapeHtml(raw).replace(/\n/g, "<br>");
}

// Plain-text preview of rich (or legacy) content, for use as a placeholder
// hint — placeholders can't render formatting, so this just strips tags.
export function stripHtmlForPlaceholder(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .replace(/<(br|div|p)\b[^>]*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
