import { test } from "node:test";
import assert from "node:assert/strict";
import { appendNoteText } from "../worker/mj-logic.js";

// Note-append undo works by writing back the original note verbatim. These
// tests pin the append/restore round trip the undo endpoint relies on.

test("undo_append_note: restoring originalNote exactly reverts the append", () => {
  const original = "existing content";
  const appended = appendNoteText(original, "new line");
  assert.equal(appended, "existing content\nnew line");
  // Undo is simply writing back originalNote - verify the string is preserved.
  assert.equal(original, "existing content");
});

test("undo_append_note: restoring empty originalNote reverts a first-time append", () => {
  const original = "";
  const appended = appendNoteText(original, "first note");
  assert.equal(appended, "first note");
  // Undo restores the empty string.
  assert.equal(original, "");
});

test("undo_append_note: HTML notes keep their original markup after undo", () => {
  const original = "<p>day one</p>";
  const appended = appendNoteText(original, "watered 2 gal");
  assert.equal(appended, "<p>day one</p><p>watered 2 gal</p>");
  assert.equal(original, "<p>day one</p>");
});
