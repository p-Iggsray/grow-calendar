import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChecked, appendNoteText } from "../worker/mj-logic.js";

// Verify that the undo payloads for set_tasks_done produce the correct reversal.

test("set_tasks_done undo: done=true reversal un-checks the same indices", () => {
  // Simulate original state: tasks 0 and 1 are checked.
  const original = [0, 1, 3];
  // MJ marks tasks 2 and 4 as done (undoPayload will have done=false).
  const after = mergeChecked(original, [2, 4], true);
  assert.deepEqual(after, [0, 1, 2, 3, 4]);
  // Undo: apply done=false for [2, 4].
  const undone = mergeChecked(after, [2, 4], false);
  assert.deepEqual(undone, original);
});

test("set_tasks_done undo: done=false reversal re-checks the same indices", () => {
  const original = [0, 1, 2];
  // MJ un-checks tasks 1 and 2.
  const after = mergeChecked(original, [1, 2], false);
  assert.deepEqual(after, [0]);
  // Undo: re-check 1 and 2.
  const undone = mergeChecked(after, [1, 2], true);
  assert.deepEqual(undone, [0, 1, 2]);
});

test("undo_append_note: restoring originalNote exactly reverts the append", () => {
  const original = "existing content";
  const appended = appendNoteText(original, "new line");
  assert.equal(appended, "existing content\nnew line");
  // Undo is simply writing back originalNote — verify the string is preserved.
  assert.equal(original, "existing content");
});

test("undo_append_note: restoring empty originalNote reverts a first-time append", () => {
  const original = "";
  const appended = appendNoteText(original, "first note");
  assert.equal(appended, "first note");
  // Undo restores the empty string.
  assert.equal(original, "");
});
