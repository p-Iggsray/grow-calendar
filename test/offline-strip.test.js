import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("the strip no longer promises a sync that does not happen", () => {
  // The old text said "changes will sync when reconnected" while nothing
  // synced. It is only allowed to say that now because the outbox makes it
  // true; see src/lib/outbox.js.
  assert.ok(!app.includes("OFFLINE - changes will sync when reconnected"));
  assert.ok(app.includes("will sync"));
  assert.ok(app.includes("useOutbox"));
});

test("the strip says how much is waiting, and counts in English", () => {
  assert.match(app, /pending === 1 \? "change" : "changes"/);
  assert.match(app, /pending === 1 \? "CHANGE" : "CHANGES"/);
});

test("the shell gives up the height the strip takes", () => {
  // Fixed to the top, so without this it sits on the top bar's eyebrow. Two
  // lines of text made that obvious; one line hid it.
  assert.match(app, /const STRIP_HEIGHT = 28;/);
  assert.match(app, /const strip = !online \|\| pending > 0;/);
  assert.match(app, /strip \? \{ \.\.\.SHELL_STYLE, paddingTop: STRIP_HEIGHT \}/);
});

test("the strip's height matches what it is actually drawn with", () => {
  // 8px padding top and bottom around one 11px line. If the padding changes
  // and STRIP_HEIGHT does not, the strip covers content again.
  const block = app.slice(app.indexOf("{/* Offline banner */}"), app.indexOf("{/* Tab content"));
  const paddings = [...block.matchAll(/padding: "(\d+)px 16px"/g)].map((m) => Number(m[1]));
  assert.ok(paddings.length >= 2, "expected both strips to declare their padding");
  for (const pad of paddings) assert.equal(2 * pad + 12, 28);
});

test("both states are one line of text, not two", () => {
  // At 390px, 11px type and 1.5px letter-spacing, the strip holds roughly 50
  // characters. Two lines cover the top bar.
  const strings = [...app.matchAll(/"(OFFLINE - [^"]*)"/g)].map((m) => m[1]);
  const templates = [...app.matchAll(/`(OFFLINE - [^`]*)`/g)].map((m) => m[1]);
  const longest = [...strings, ...templates]
    .map((t) => t.replace(/\$\{[^}]+\}/g, "12 changes"));
  assert.ok(longest.length >= 2);
  for (const t of longest) {
    assert.ok(t.length <= 50, `"${t}" is ${t.length} characters and will wrap`);
  }
});

test("the syncing strip only shows when there is something to sync", () => {
  assert.match(app, /\{online && pending > 0 && \(/);
});
