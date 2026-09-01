import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeHtml, escapeHtml, looksLikeHtml, noteToHtml,
  htmlToPlainText, htmlIsEmpty, appendToNote,
  normalizeSpaces,
  trimTrailingSpace,
} from "../src/lib/richText.js";

// ── Sanitizer ────────────────────────────────────────────────────────────────
test("sanitizeHtml: keeps the editor's whitelist, normalized", () => {
  assert.equal(
    sanitizeHtml("<H1>Title</H1><p>Some <B>bold</B>, <i>italic</i>, <u>underline</u></p><ul><li>a</li></ul>"),
    "<h1>Title</h1><p>Some <b>bold</b>, <i>italic</i>, <u>underline</u></p><ul><li>a</li></ul>"
  );
  assert.equal(sanitizeHtml('<font size="5">big</font>'), '<font size="5">big</font>');
  assert.equal(sanitizeHtml("<font size=2>small</font>"), '<font size="2">small</font>');
});

test("sanitizeHtml: strips scripts, styles, attributes, and unknown tags", () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script>hi'), "alert(1)hi");
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>hi'), "hi");
  assert.equal(sanitizeHtml('<b onclick="x()">hi</b>'), "hi</b>"); // attributed tag dropped
  assert.equal(sanitizeHtml('<a href="https://evil">link</a>'), "link");
  assert.equal(sanitizeHtml('<span style="color:red">x</span>'), "x");
  assert.equal(sanitizeHtml('<font size="99">x</font>'), "x</font>");
});

// ── Plain <-> rich bridging ──────────────────────────────────────────────────
test("noteToHtml: legacy plain notes are escaped with line breaks kept", () => {
  assert.equal(noteToHtml("watered 2 gal\n<3 the girls"), "watered 2 gal<br>&lt;3 the girls");
  assert.equal(noteToHtml(""), "");
});

test("noteToHtml: rich notes pass through the sanitizer", () => {
  assert.equal(noteToHtml("<p>hi <b>there</b></p><script>x</script>"), "<p>hi <b>there</b></p>x");
});

test("htmlToPlainText: flattens blocks, lists, and entities to readable text", () => {
  assert.equal(
    htmlToPlainText("<h1>Week 4</h1><p>Fed &amp; watered</p><ul><li>topped A</li><li>LST on B</li></ul>"),
    "Week 4\nFed & watered\n- topped A\n- LST on B"
  );
  // Plain text passes through untouched.
  assert.equal(htmlToPlainText("just words < 3"), "just words < 3");
});

test("htmlIsEmpty: editor leftovers count as empty, words do not", () => {
  assert.equal(htmlIsEmpty("<div><br></div>"), true);
  assert.equal(htmlIsEmpty("<p></p><ul><li></li></ul>"), true);
  assert.equal(htmlIsEmpty("<p>hi</p>"), false);
  assert.equal(htmlIsEmpty(""), true);
});

test("escapeHtml + looksLikeHtml basics", () => {
  assert.equal(escapeHtml('<b>&"'), "&lt;b&gt;&amp;&quot;");
  assert.equal(looksLikeHtml("<p>x</p>"), true);
  assert.equal(looksLikeHtml("2 < 3 and 4 > 1"), false);
});

// ── Appending (MJ's append_note) ─────────────────────────────────────────────
test("appendToNote: plain entries gain a newline, rich entries a paragraph", () => {
  assert.equal(appendToNote("day one", "day two"), "day one\nday two");
  assert.equal(appendToNote("", "first"), "first");
  assert.equal(appendToNote("<p>rich</p>", "MJ: check runoff <ph>"), "<p>rich</p><p>MJ: check runoff &lt;ph&gt;</p>");
  assert.equal(appendToNote("plain", "  "), "plain");
});

// ── Non-breaking spaces ──────────────────────────────────────────────────────
// contentEditable emits &nbsp; for a trailing space. Stored, it came back as
// the literal text "&nbsp;" on the end of the entry.

test("normalizeSpaces turns both the entity and the raw character into a space", () => {
  assert.equal(normalizeSpaces("watered today&nbsp;"), "watered today ");
  assert.equal(normalizeSpaces("watered\u00A0today"), "watered today");
  assert.equal(normalizeSpaces("a&NBSP;b"), "a b");
  assert.equal(normalizeSpaces(null), "");
});

test("a plain note with a trailing nbsp survives the editor round trip clean", () => {
  // What the browser hands us after typing "watered today " into an empty box.
  const emitted = trimTrailingSpace(sanitizeHtml("watered today&nbsp;"));
  assert.equal(emitted, "watered today");
  // And loading it back must not escape anything into visible "&amp;nbsp;".
  assert.equal(noteToHtml(emitted), "watered today");
  assert.doesNotMatch(noteToHtml(emitted), /nbsp/i);
});

test("an entry already stored with the entity is healed on the way back in", () => {
  // The bug baked these into the database; loading one must not show it.
  assert.equal(noteToHtml("fed 2 gal&nbsp;"), "fed 2 gal ");
  assert.doesNotMatch(noteToHtml("fed 2 gal&nbsp;"), /&amp;/);
  assert.equal(htmlToPlainText("fed 2 gal&nbsp;"), "fed 2 gal ");
  assert.equal(htmlToPlainText("<p>fed 2 gal&nbsp;</p>"), "fed 2 gal");
});

test("sanitizing never lets a non-breaking space through to storage", () => {
  assert.doesNotMatch(sanitizeHtml("<p>a&nbsp;&nbsp;b</p>"), /nbsp/i);
  assert.equal(sanitizeHtml("<p>a&nbsp;b</p>"), "<p>a b</p>");
});

test("trimTrailingSpace leaves the grower's own blank line alone", () => {
  assert.equal(trimTrailingSpace("<p>one</p><p><br></p>"), "<p>one</p><p><br></p>");
  assert.equal(trimTrailingSpace("<p>one</p>   "), "<p>one</p>");
  assert.equal(trimTrailingSpace("one\u00A0 "), "one");
});

test("an entry of nothing but a non-breaking space is still empty", () => {
  assert.equal(htmlIsEmpty("&nbsp;"), true);
  assert.equal(htmlIsEmpty("<div>&nbsp;</div>"), true);
  assert.equal(htmlIsEmpty("\u00A0"), true);
  assert.equal(htmlIsEmpty("<p>real words</p>"), false);
});
