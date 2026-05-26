import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG);
const DAY = "2026-06-12"; // an early_veg day with a stable task list
function dayDate() { return new Date(2026, 5, 12); }

test("addedTasks are appended", () => {
  const base = getDetail(dayDate(), config, {});
  const withAdd = getDetail(dayDate(), config, { [DAY]: { addedTasks: ["Spray neem tonight"] } });
  assert.equal(withAdd.tasks.length, base.tasks.length + 1);
  assert.equal(withAdd.tasks.at(-1), "Spray neem tonight");
});

test("editedTasks replace by index", () => {
  const withEdit = getDetail(dayDate(), config, { [DAY]: { editedTasks: { 0: "REPLACED" } } });
  assert.equal(withEdit.tasks[0], "REPLACED");
});

test("removedTasks drop by original index", () => {
  const base = getDetail(dayDate(), config, {});
  const withRemove = getDetail(dayDate(), config, { [DAY]: { removedTasks: [0] } });
  assert.equal(withRemove.tasks.length, base.tasks.length - 1);
  assert.equal(withRemove.tasks[0], base.tasks[1]);
});

test("note overrides the rendered notes field; warning attaches", () => {
  const d = getDetail(dayDate(), config, { [DAY]: { note: "custom note", warning: "watch heat" } });
  assert.equal(d.notes, "custom note");
  assert.equal(d.warning, "watch heat");
});

test("empty overrides leave the day unchanged", () => {
  const base = getDetail(dayDate(), config, {});
  const same = getDetail(dayDate(), config, {});
  assert.deepEqual(same, base);
});
