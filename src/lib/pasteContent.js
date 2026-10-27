// What a paste into the journal becomes.
//
// A paste arrives as up to three things at once: HTML (a web page, Sheets,
// Excel, Numbers), plain text, and files. Pasted HTML carries a source's whole
// styling with it, Excel's in particular: style blocks, conditional comments,
// mso attributes. So nothing is pasted as given. Tables are rebuilt from their
// cells into one tidy shape, the rest goes through the same whitelist as every
// stored entry, and plain text that is really a table (tab or comma separated,
// or a markdown table) is turned into one.
//
// Pure string work so it is testable in node, where there is no DOMParser.

import { escapeHtml, sanitizeHtml } from "./richText.js";

// Blocks whose CONTENT is never text. Stripping only their tags would leave
// a stylesheet's rules in the entry as words.
const INVISIBLE_BLOCKS = /<(style|script|head|title|xml|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const COMMENTS = /<!--[\s\S]*?-->/g;
const TABLE = /<table\b[^>]*>([\s\S]*?)<\/table\s*>/gi;
const ROW = /<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi;
const CELL = /<(t[dh])\b[^>]*>([\s\S]*?)<\/t[dh]\s*>/gi;

// A row that is all labels above a row with a number in it reads as a header.
const NUMERIC = /^[-+]?[$€£]?\s*\d[\d,]*(\.\d+)?\s*(%|[a-zA-Z°]{1,4})?$/;

// Comma separated text must look like data, not two lines of a sentence.
const CSV_MAX_AVERAGE_FIELD = 24;

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'", "#039": "'" };

function decodeEntities(text) {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#0?39);/gi, (_, name) => ENTITIES[name.toLowerCase()] ?? "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

function cellText(html) {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, ""))
    .replace(/[\s\u00A0]+/g, " ")
    .trim();
}

const isNumeric = (s) => NUMERIC.test(s);

/** Does the first row read as column labels for the rows under it? */
export function looksLikeHeader(rows) {
  if (rows.length < 2) return false;
  const [first, ...rest] = rows;
  if (first.some((c) => c === "" || isNumeric(c))) return false;
  return rest.some((r) => r.some((c) => isNumeric(c)));
}

/**
 * Rows of cell text as one tidy table: every row the same width, empty rows
 * and columns gone, a header row only when there is one. A single cell is not
 * a table, so it comes back as its text.
 */
export function rowsToTableHtml(rows, { header = null } = {}) {
  let grid = rows.map((r) => r.map((c) => String(c ?? "").trim()));
  grid = grid.filter((r) => r.some((c) => c !== ""));
  if (grid.length === 0) return "";
  const width = Math.max(...grid.map((r) => r.length));
  grid = grid.map((r) => [...r, ...Array(width - r.length).fill("")]);
  const keep = [...Array(width).keys()].filter((i) => grid.some((r) => r[i] !== ""));
  grid = grid.map((r) => keep.map((i) => r[i]));
  if (grid.length === 1 && grid[0].length === 1) return escapeHtml(grid[0][0]);

  const hasHeader = header ?? looksLikeHeader(grid);
  const row = (r, tag) => `<tr>${r.map((c) => `<${tag}>${escapeHtml(c)}</${tag}>`).join("")}</tr>`;
  const head = hasHeader ? `<thead>${row(grid[0], "th")}</thead>` : "";
  const body = (hasHeader ? grid.slice(1) : grid).map((r) => row(r, "td")).join("");
  return `<table>${head}<tbody>${body}</tbody></table>`;
}

function tableHtmlFromMarkup(inner) {
  const rows = [];
  let headerCells = 0;
  let cells = 0;
  for (const [, rowHtml] of inner.matchAll(ROW)) {
    const row = [];
    for (const [, tag, cellHtml] of rowHtml.matchAll(CELL)) {
      row.push(cellText(cellHtml));
      if (rows.length === 0) { cells++; if (tag.toLowerCase() === "th") headerCells++; }
    }
    rows.push(row);
  }
  const marked = /<thead\b/i.test(inner) || (cells > 0 && headerCells === cells);
  return rowsToTableHtml(rows, { header: marked ? true : null });
}

/** Pasted HTML, cleaned: every table rebuilt, everything else whitelisted. */
export function cleanPastedHtml(html) {
  const stripped = String(html ?? "").replace(COMMENTS, "").replace(INVISIBLE_BLOCKS, "");
  const out = [];
  let last = 0;
  for (const m of stripped.matchAll(TABLE)) {
    out.push(sanitizeHtml(stripped.slice(last, m.index)));
    out.push(tableHtmlFromMarkup(m[1]));
    last = m.index + m[0].length;
  }
  out.push(sanitizeHtml(stripped.slice(last)));
  return out.join("").replace(/^[\s\u00A0]+|[\s\u00A0]+$/g, "");
}

export function htmlHasTable(html) {
  return /<table\b/i.test(String(html ?? ""));
}

function splitCsvLine(line) {
  const fields = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") { quoted = true; cur = ""; }
    else if (ch === ",") { fields.push(cur); cur = ""; }
    else cur += ch;
  }
  fields.push(cur);
  return fields.map((f) => f.trim());
}

function markdownRows(lines) {
  if (lines.length < 2 || !lines.every((l) => l.includes("|"))) return null;
  const separator = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;
  if (!separator.test(lines[1])) return null;
  const cells = (l) => l.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
  return { rows: [cells(lines[0]), ...lines.slice(2).map(cells)], header: true };
}

function tsvRows(lines) {
  if (lines.length < 2 || !lines.every((l) => l.includes("\t"))) return null;
  return { rows: lines.map((l) => l.split("\t")), header: null };
}

function csvRows(lines) {
  if (lines.length < 2) return null;
  const rows = lines.map(splitCsvLine);
  const width = rows[0].length;
  if (width < 2 || rows.some((r) => r.length !== width)) return null;
  const fields = rows.flat();
  const average = fields.reduce((n, f) => n + f.length, 0) / fields.length;
  if (average > CSV_MAX_AVERAGE_FIELD || !fields.some(isNumeric)) return null;
  return { rows, header: null };
}

/** Plain text that is really a table, as table HTML; null when it is not one. */
export function tableFromText(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l.trim() !== "");
  const found = markdownRows(lines) ?? tsvRows(lines) ?? csvRows(lines);
  return found ? rowsToTableHtml(found.rows, { header: found.header }) || null : null;
}

/** Plain text as editor HTML: escaped, line breaks kept. */
export function plainTextToHtml(text) {
  return escapeHtml(String(text ?? "").replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

/**
 * What to insert for a paste. `html` and `text` are the clipboard's two text
 * forms; either may be empty. A table in either wins over the rest, because a
 * spreadsheet copy carries both and only the HTML keeps the cells apart.
 */
export function pasteToHtml({ html = "", text = "" } = {}) {
  if (htmlHasTable(html)) return cleanPastedHtml(html);
  const fromText = tableFromText(text);
  if (fromText) return fromText;
  if (html.trim()) {
    const cleaned = cleanPastedHtml(html);
    if (cleaned.replace(/<[^>]*>/g, "").trim()) return cleaned;
  }
  return plainTextToHtml(text);
}

/** A table just inserted needs a line under it, or there is nowhere to type next. */
export function withLineAfterTable(html) {
  return /<\/table>$/.test(html) ? `${html}<p><br></p>` : html;
}
