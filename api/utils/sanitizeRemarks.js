const sanitizeHtml = require('sanitize-html');

// Remarks are authored via a contentEditable rich-text box (bold/italic/
// underline + line breaks only) and later rendered with dangerouslySetInnerHTML
// on the frontend — this is the one point that actually enforces the allow-list,
// so nothing unsafe (script tags, event handlers, styles, links) ever reaches
// storage regardless of what the client sent.
//
// `span` + a narrow `style` allow-list is a deliberate exception to the
// otherwise attribute-free policy: the editor's execCommand can emit
// span/style-based bold/italic/underline instead of <b>/<i>/<u> depending on
// browser engine and selection context, and without this the formatting was
// silently discarded on save. sanitize-html parses/validates each CSS
// declaration against the regexes below rather than passing through a raw
// string, so this doesn't reopen any injection surface (no url(), no
// expression(), no arbitrary properties).
function sanitizeRemarks(raw) {
  if (raw === undefined || raw === null) return raw;
  return sanitizeHtml(String(raw), {
    allowedTags: ['b', 'strong', 'i', 'em', 'u', 'br', 'div', 'span'],
    allowedAttributes: { span: ['style'] },
    allowedStyles: {
      span: {
        'font-weight': [/^(bold|bolder|[1-9]00)$/],
        'font-style': [/^italic$/],
        'text-decoration': [/^underline$/],
      },
    },
  });
}

module.exports = { sanitizeRemarks };
