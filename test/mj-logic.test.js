import { test } from "node:test";
import assert from "node:assert/strict";
import { appendNoteText, buildDayInfo, MJ_PERSONA, MJ_TOOLS, VALID_CONFIG_DATE_KEYS } from "../worker/mj-logic.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG);

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

test("buildDayInfo on transplant day: phase, counters, and milestone", () => {
  const info = buildDayInfo("2026-05-24", config);
  assert.equal(info.date, "2026-05-24");
  assert.equal(info.phase, "transplant");
  assert.equal(info.phaseLabel, "Transplant Day");
  assert.equal(info.daysSinceTransplant, 0);
  // Season starts at germinate (2026-05-05) = day 1, so transplant is day 20.
  assert.equal(info.growDay, 20);
  assert.ok(info.milestones.includes("Transplant"));
  assert.equal(info.outsideSeason, undefined);
});

test("buildDayInfo outside the season: null phase, flag set, no milestones", () => {
  const info = buildDayInfo("2026-01-15", config);
  assert.equal(info.phase, null);
  assert.equal(info.phaseLabel, null);
  assert.equal(info.growDay, null);
  assert.equal(info.daysSinceTransplant, null);
  assert.deepEqual(info.milestones, []);
  assert.equal(info.outsideSeason, true);
});

test("buildDayInfo on a plain mid-season day carries no milestones", () => {
  const info = buildDayInfo("2026-06-10", config);
  assert.equal(info.phase, "veg_cm");
  assert.deepEqual(info.milestones, []);
});

test("MJ_TOOLS carries no task or phase-override tools", () => {
  const names = new Set(MJ_TOOLS.map(t => t.name));
  for (const gone of [
    "set_tasks_done", "add_task", "remove_task", "update_phase_tasks",
    "create_event_rule", "delete_event_rule",
  ]) {
    assert.ok(!names.has(gone), `${gone} should be removed from MJ_TOOLS`);
  }
});

test("MJ_PERSONA no longer speaks of tasks", () => {
  assert.ok(!/task/i.test(MJ_PERSONA), "persona should not mention tasks");
});

test("MJ_TOOLS includes get_day with a required date parameter", () => {
  const tool = MJ_TOOLS.find(t => t.name === "get_day");
  assert.ok(tool, "get_day tool missing from MJ_TOOLS");
  assert.ok(tool.parameters.properties.date, "get_day missing date parameter");
  assert.deepEqual(tool.parameters.required, ["date"]);
});

test("MJ_TOOLS includes get_week with start_date parameter", () => {
  const tool = MJ_TOOLS.find(t => t.name === "get_week");
  assert.ok(tool, "get_week tool missing from MJ_TOOLS");
  assert.ok(tool.parameters.properties.start_date, "get_week missing start_date parameter");
  assert.deepEqual(tool.parameters.required, ["start_date"]);
});

test("MJ_TOOLS includes replace_note with date and text parameters", () => {
  const tool = MJ_TOOLS.find(t => t.name === "replace_note");
  assert.ok(tool, "replace_note tool missing from MJ_TOOLS");
  assert.ok(tool.parameters.properties.date, "replace_note missing date parameter");
  assert.ok(tool.parameters.properties.text, "replace_note missing text parameter");
  assert.deepEqual(tool.parameters.required, ["date", "text"]);
});

test("VALID_CONFIG_DATE_KEYS keeps the load-bearing config date keys", () => {
  for (const key of ["start", "transplant", "feedStart", "flowerStart", "gdpHarvest", "hazeHarvest"]) {
    assert.ok(VALID_CONFIG_DATE_KEYS.has(key), `expected ${key} in VALID_CONFIG_DATE_KEYS`);
  }
});
