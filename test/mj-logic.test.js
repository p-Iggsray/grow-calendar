import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChecked, appendNoteText, buildDayView } from "../worker/mj-logic.js";

test("mergeChecked adds indices, dedupes, sorts ascending", () => {
  assert.deepEqual(mergeChecked([2, 1], [3, 1], true), [1, 2, 3]);
});

test("mergeChecked removes indices when done=false", () => {
  assert.deepEqual(mergeChecked([1, 2, 3], [2], false), [1, 3]);
});

test("appendNoteText appends with a newline separator", () => {
  assert.equal(appendNoteText("foo", "bar"), "foo\nbar");
});

test("appendNoteText creates the note when existing is empty or null", () => {
  assert.equal(appendNoteText("", "bar"), "bar");
  assert.equal(appendNoteText(null, "bar"), "bar");
});

test("appendNoteText ignores a blank addition", () => {
  assert.equal(appendNoteText("foo", "   "), "foo");
});

test("buildDayView maps tasks with done flags and splits guidance/userNote", () => {
  const detail = { title: "T", summary: "S", tasks: ["a", "b", "c"], notes: "guide" };
  const v = buildDayView("2026-06-12", "veg_cm", detail, [0, 2], "my note");
  assert.equal(v.date, "2026-06-12");
  assert.equal(v.phase, "veg_cm");
  assert.equal(v.tasks.length, 3);
  assert.deepEqual(v.tasks[0], { index: 0, text: "a", done: true });
  assert.deepEqual(v.tasks[1], { index: 1, text: "b", done: false });
  assert.equal(v.guidance, "guide");
  assert.equal(v.userNote, "my note");
});
