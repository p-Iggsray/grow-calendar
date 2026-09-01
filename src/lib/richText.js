// Rich-text support for journal entries. Entries are stored as a small,
// whitelisted subset of HTML (bold/italic/underline, headers, lists, font
// sizes). Everything here is pure string work so the same module serves the
// browser editor and the worker (excerpts, MJ context) and is testable in node.

// Tags the editor can produce. Anything else is stripped entirely, attributes
// and all, so pasted or hand-crafted markup can never smuggle in scripts,
// styles, or event handlers.
const SIMPLE_TAG = /^<(\/?)(b|strong|i|em|u|p|div|br|ul|ol|li|h1|h2|h3)(\s*\/)?>$/i;
const FONT_OPEN = /^<font\s+size="?([1-7])"?\s*>$/i;
const FONT_CLOSE = /^<\/font\s*>$/i;

// contentEditable inserts a non-breaking space whenever you type a space at the
// end of a line, or a second space in a row - that is how a browser stops the
// space from collapsing. Left alone it gets STORED, and a note with no other
// markup then fails the looksLikeHtml check on the way back in, gets escaped,
// and reappears as the literal text "&nbsp;" at the end of the entry. So it is
// turned back into an ordinary space at every boundary: on the way in, on the
// way out, and on the way to plain text.
export function normalizeSpaces(text) {
  return String(text ?? "")
    .replace(/&nbsp;/gi, " ")
    .replace(/\u00A0/g, " ");
}

// Trailing blanks left by the editor are never meaningful and are exactly what
// used to be stored as a dangling "&nbsp;". Tags are left alone: a blank line
// the grower deliberately typed at the end is theirs to keep.
export function trimTrailingSpace(html) {
  return String(html ?? "").replace(/[\s\u00A0]+$/, "");
}

export function sanitizeHtml(html) {
  return normalizeSpaces(html).replace(/<[^>]*>?/g, (tag) => {
    const simple = tag.match(SIMPLE_TAG);
    if (simple) return `<${simple[1]}${simple[2].toLowerCase()}>`;
    const font = tag.match(FONT_OPEN);
    if (font) return `<font size="${font[1]}">`;
    if (FONT_CLOSE.test(tag)) return "</font>";
    return "";
  });
}

export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Does a stored note body already carry editor markup?
const HTML_MARKER = /<(b|strong|i|em|u|p|div|br|ul|ol|li|h1|h2|h3|font)[\s/>]/i;
export function looksLikeHtml(text) {
  return HTML_MARKER.test(String(text ?? ""));
}

// Prepare a stored note for the editor: legacy plain-text notes are escaped
// and their newlines preserved; HTML notes are re-sanitized on the way in.
export function noteToHtml(raw) {
  // Normalize first: an older entry that already carries a stored "&nbsp;"
  // would otherwise be escaped into visible "&amp;nbsp;" text.
  const text = normalizeSpaces(raw);
  if (!text) return "";
  if (looksLikeHtml(text)) return sanitizeHtml(text);
  return escapeHtml(text).replace(/\n/g, "<br>");
}

// Flatten entry HTML to readable plain text (for excerpts, search results,
// and MJ's view of the day). Block-level closes become newlines.
export function htmlToPlainText(html) {
  // Plain notes get the space fix too - they are the ones the bug bit.
  const text = normalizeSpaces(html);
  if (!looksLikeHtml(text)) return text;
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h1|h2|h3|ul|ol)>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// True when the markup holds no actual words (e.g. "<div><br></div>" or an
// empty bullet left behind by an emptied editor) so blank entries are stored
// as "".
export function htmlIsEmpty(html) {
  return normalizeSpaces(html)
    .replace(/<[^>]*>/g, "")
    .trim() === "";
}

// Append plain text (e.g. from MJ) onto an existing entry without breaking
// its formatting: HTML entries gain a paragraph, plain entries a newline.
export function appendToNote(existing, addition) {
  const base = String(existing ?? "").trimEnd();
  const add = String(addition ?? "").trim();
  if (!add) return base;
  if (!base) return add;
  if (looksLikeHtml(base)) return `${base}<p>${escapeHtml(add)}</p>`;
  return `${base}\n${add}`;
}
