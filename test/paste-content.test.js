import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanPastedHtml, pasteToHtml, rowsToTableHtml, tableFromText, withLineAfterTable,
} from "../src/lib/pasteContent.js";
import { sanitizeHtml, htmlToPlainText } from "../src/lib/richText.js";

const SHEETS = '<meta charset="utf-8"><google-sheets-html-origin><style type="text/css"><!--td {border: 1px solid #cccccc;}--></style>'
  + '<table xmlns="http://www.w3.org/1999/xhtml" cellspacing="0" cellpadding="0" dir="ltr" border="1" style="table-layout:fixed;font-size:10pt">'
  + '<colgroup><col width="100"/><col width="100"/></colgroup><tbody>'
  + '<tr style="height:21px;"><td style="overflow:hidden;padding:2px 3px">Day</td><td style="padding:2px 3px">EC</td></tr>'
  + '<tr><td>1</td><td style="text-align:right">1.2</td></tr>'
  + '<tr><td>2</td><td>1.4</td></tr></tbody></table>';

const EXCEL = '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style><!--table {mso-displayed-decimal-separator:"\\.";} .xl65 {color:red;}--></style></head>'
  + '<body><!--StartFragment--><table border=0 width=200><col width=64>'
  + '<tr height=20><td class=xl65>Plant</td><td>Height&nbsp;(in)</td><td></td></tr>'
  + '<tr><td>Blue Dream</td><td align=right>24</td><td></td></tr>'
  + '<tr><td></td><td></td><td></td></tr>'
  + '<tr><td>Gelato &amp; Co</td><td align=right>19</td><td></td></tr>'
  + '</table><!--EndFragment--></body></html>';

test("a Sheets copy becomes a tidy table with a header row", () => {
  const html = pasteToHtml({ html: SHEETS, text: "Day\tEC\n1\t1.2\n2\t1.4" });
  assert.equal(html,
    "<table><thead><tr><th>Day</th><th>EC</th></tr></thead><tbody>"
    + "<tr><td>1</td><td>1.2</td></tr><tr><td>2</td><td>1.4</td></tr></tbody></table>");
  assert.doesNotMatch(html, /style|colgroup|border/);
});

test("an Excel copy loses its stylesheet, empty rows and empty columns", () => {
  const html = pasteToHtml({ html: EXCEL, text: "" });
  assert.doesNotMatch(html, /mso|xl65|color:red|StartFragment/);
  assert.match(html, /<th>Plant<\/th><th>Height \(in\)<\/th>/);
  assert.match(html, /<td>Gelato &amp; Co<\/td><td>19<\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3, "the blank row is gone");
  assert.equal((html.match(/<t[dh]>/g) || []).length, 6, "the blank column is gone");
});

test("cells marked as headers stay headers even when they hold numbers", () => {
  const html = cleanPastedHtml("<table><tr><th>2024</th><th>2025</th></tr><tr><td>a</td><td>b</td></tr></table>");
  assert.match(html, /<thead><tr><th>2024<\/th><th>2025<\/th><\/tr><\/thead>/);
});

test("tab separated text becomes a table", () => {
  const html = tableFromText("Date\tTemp\tRH\n10/1\t78\t55%\n10/2\t76\t58%\n");
  assert.match(html, /^<table><thead><tr><th>Date<\/th><th>Temp<\/th><th>RH<\/th><\/tr><\/thead>/);
  assert.match(html, /<td>58%<\/td>/);
});

test("comma separated data becomes a table, quoted commas and all", () => {
  const html = tableFromText('strain,weeks,notes\nBlue Dream,9,"tall, stretchy"\nGelato,8,dense');
  assert.match(html, /<td>tall, stretchy<\/td>/);
  assert.match(html, /<th>strain<\/th>/);
});

test("a markdown table becomes a table", () => {
  const html = tableFromText("| Nutrient | ml/gal |\n|---|---:|\n| Grow | 5 |\n| Bloom | 2.5 |");
  assert.equal(html,
    "<table><thead><tr><th>Nutrient</th><th>ml/gal</th></tr></thead><tbody>"
    + "<tr><td>Grow</td><td>5</td></tr><tr><td>Bloom</td><td>2.5</td></tr></tbody></table>");
});

test("ordinary sentences with commas stay sentences", () => {
  assert.equal(tableFromText("Watered the girls, then fed them.\nTopped Gelato, tied down Blue Dream."), null);
  assert.equal(tableFromText("just one line\twith a tab"), null);
  assert.equal(pasteToHtml({ text: "Line one\nLine <two>" }), "Line one<br>Line &lt;two&gt;");
});

test("a single copied cell is just its text", () => {
  assert.equal(rowsToTableHtml([["  6.2 "]]), "6.2");
  assert.equal(cleanPastedHtml("<table><tr><td>6.2</td></tr></table>"), "6.2");
});

test("pasted web text keeps its words and loses its styling", () => {
  const html = pasteToHtml({
    html: '<div style="color:red"><span style="font-size:20px">Hello <b class="x">there</b></span><img src="x.png" onerror="bad()"><script>bad()</script></div>',
    text: "Hello there",
  });
  assert.equal(html, "<div>Hello <b>there</b></div>");
});

test("a Google Docs copy is not all bold", () => {
  const html = pasteToHtml({ html: '<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span>Plain words</span></p></b>' });
  assert.doesNotMatch(html, /<b>/);
  assert.match(html, /Plain words/);
});

test("a table gets a line under it to keep typing on", () => {
  assert.equal(withLineAfterTable("<table></table>"), "<table></table><p><br></p>");
  assert.equal(withLineAfterTable("text"), "text");
});

test("stored tables survive the sanitizer and read as text in search", () => {
  const stored = "<p>Feed</p><table><thead><tr><th>EC</th><th>pH</th></tr></thead><tbody><tr><td>1.2</td><td>6.1</td></tr></tbody></table>";
  assert.equal(sanitizeHtml(stored), stored);
  assert.equal(htmlToPlainText(stored), "Feed\nEC | pH\n1.2 | 6.1");
});
