import { test } from "node:test";
import assert from "node:assert/strict";
import { rundownFilename } from "../src/lib/rundown.js";

const day = new Date(2026, 8, 13); // Sep 13 2026, local

test("the filename names the space and the day, and sorts by date", () => {
  assert.equal(rundownFilename("Flower Tent", day), "flower-tent-rundown-2026-09-13.html");
});

test("punctuation and case are flattened into something a filesystem accepts", () => {
  assert.equal(rundownFilename("  4x4 Tent (Blue Dream!) ", day), "4x4-tent-blue-dream-rundown-2026-09-13.html");
});

test("a space with no usable name still gets a file", () => {
  assert.equal(rundownFilename("", day), "environment-rundown-2026-09-13.html");
  assert.equal(rundownFilename("***", day), "environment-rundown-2026-09-13.html");
  assert.equal(rundownFilename(null, day), "environment-rundown-2026-09-13.html");
});

test("a very long name is trimmed rather than making an unopenable file", () => {
  const name = rundownFilename("a".repeat(200), day);
  assert.equal(name, `${"a".repeat(60)}-rundown-2026-09-13.html`);
});

test("single-digit months and days are padded so files sort", () => {
  assert.match(rundownFilename("Tent", new Date(2026, 0, 5)), /-2026-01-05\.html$/);
});
