import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_ORDER, buildRunningTimeline, currentStageOf, dayOfGrow,
  stageGroup, stageIndex, stageLabel, stageOnDate,
} from "../src/lib/stageTimeline.js";
import { stageFromRow } from "../worker/stages.js";
import { buildDayInfo } from "../worker/mj-logic.js";
import { buildTimelineText } from "../src/lib/timelineText.js";
import { resolveSurveyForSetup } from "../src/lib/stageAnchor.js";

// ── buildRunningTimeline ─────────────────────────────────────────────────────
test("buildRunningTimeline sorts, and only ever moves forward", () => {
  const events = buildRunningTimeline([
    { date: "2026-06-10", stage: "vegetative" },
    { date: "2026-06-01", stage: "seedling" },
    { date: "2026-06-20", stage: "seedling" },   // a lagging plant: no going back
    { date: "2026-07-01", stage: "flowering" },
  ]);
  assert.deepEqual(events, [
    { date: "2026-06-01", stage: "seedling" },
    { date: "2026-06-10", stage: "vegetative" },
    { date: "2026-07-01", stage: "flowering" },
  ]);
});

test("buildRunningTimeline collapses several plants switching on one day", () => {
  const events = buildRunningTimeline([
    { date: "2026-06-10", stage: "vegetative" },
    { date: "2026-06-10", stage: "flowering" },
  ]);
  assert.deepEqual(events, [{ date: "2026-06-10", stage: "flowering" }]);
});

test("buildRunningTimeline drops rows with no date or an unknown stage", () => {
  assert.deepEqual(buildRunningTimeline([
    { date: "", stage: "seedling" },
    { date: "2026-06-01", stage: "banana" },
    { date: "2026-06-02", stage: "vegetative" },
  ]), [{ date: "2026-06-02", stage: "vegetative" }]);
  assert.deepEqual(buildRunningTimeline(null), []);
});

// ── stageOnDate ──────────────────────────────────────────────────────────────
const TIMELINE = [
  { date: "2026-06-01", stage: "seedling" },
  { date: "2026-06-15", stage: "vegetative" },
  { date: "2026-07-20", stage: "flowering" },
];

test("stageOnDate holds a stage from its switch day until the next one", () => {
  assert.equal(stageOnDate(TIMELINE, "2026-05-31"), null);   // before the grow
  assert.equal(stageOnDate(TIMELINE, "2026-06-01"), "seedling");   // switch day counts
  assert.equal(stageOnDate(TIMELINE, "2026-06-14"), "seedling");
  assert.equal(stageOnDate(TIMELINE, "2026-06-15"), "vegetative");
  assert.equal(stageOnDate(TIMELINE, "2026-12-31"), "flowering");  // runs on into the future
  assert.equal(stageOnDate(TIMELINE, ""), null);
  assert.equal(stageOnDate(null, "2026-06-20"), null);
});

// ── dayOfGrow ────────────────────────────────────────────────────────────────
test("dayOfGrow: day 1 is the first recorded day; earlier days are null", () => {
  assert.equal(dayOfGrow("2026-06-01", "2026-06-01"), 1);
  assert.equal(dayOfGrow("2026-06-01", "2026-07-03"), 33);
  assert.equal(dayOfGrow("2026-06-01", "2026-05-31"), null);
  assert.equal(dayOfGrow(null, "2026-07-03"), null);
  assert.equal(dayOfGrow("2026-06-01", null), null);
});

test("dayOfGrow counts across a DST boundary without drifting", () => {
  // Mar 8 2026 is a US DST spring-forward day; UTC math must ignore it.
  assert.equal(dayOfGrow("2026-03-01", "2026-03-15"), 15);
});

// ── labels, groups, ordering ─────────────────────────────────────────────────
test("every stage has a label and a colour group", () => {
  for (const stage of STAGE_ORDER) {
    assert.ok(stageLabel(stage), `${stage} needs a label`);
    assert.match(stageGroup(stage).color, /^#[0-9a-f]{6}$/i);
    assert.ok(stageIndex(stage) >= 0);
  }
  assert.equal(stageLabel("banana"), null);
  assert.equal(stageGroup("banana"), null);
  assert.equal(stageIndex("banana"), -1);
});

test("drying, curing and done share the harvest colour", () => {
  for (const s of ["harvest", "drying", "curing", "done"]) {
    assert.equal(stageGroup(s).key, "harvest");
  }
});

// ── currentStageOf ───────────────────────────────────────────────────────────
test("currentStageOf takes the furthest growing plant and ignores archived ones", () => {
  assert.equal(currentStageOf([
    { stage: "seedling", status: "growing" },
    { stage: "flowering", status: "growing" },
  ]), "flowering");
  assert.equal(currentStageOf([
    { stage: "seedling", status: "growing" },
    { stage: "harvest", status: "harvested" },   // archived: not the grow's stage
  ]), "seedling");
  assert.equal(currentStageOf([]), null);
  assert.equal(currentStageOf(null), null);
});

// ── stageFromRow ─────────────────────────────────────────────────────────────
test("stageFromRow reads detail first, then falls back to the display body", () => {
  assert.equal(stageFromRow({ detail: '{"stage":"flowering"}', body: "" }), "flowering");
  assert.equal(stageFromRow({ detail: { stage: "Curing" }, body: "" }), "curing");
  assert.equal(stageFromRow({ detail: null, body: "Stage → Vegetative" }), "vegetative");
  assert.equal(stageFromRow({ detail: null, body: "Stage -> Harvest" }), "harvest");
  assert.equal(stageFromRow({ detail: "not json", body: "Stage → Seedling" }), "seedling");
  assert.equal(stageFromRow({ detail: null, body: "watered today" }), null);
  assert.equal(stageFromRow(null), null);
});

// ── buildDayInfo (MJ) ────────────────────────────────────────────────────────
test("buildDayInfo reports the recorded stage, day number, and switch days", () => {
  const timeline = { events: TIMELINE, firstDate: "2026-06-01" };
  const mid = buildDayInfo("2026-06-20", timeline);
  assert.equal(mid.stage, "vegetative");
  assert.equal(mid.stageLabel, "Vegetative");
  assert.equal(mid.growDay, 20);
  assert.equal(mid.stageChangedTo, null);

  const flip = buildDayInfo("2026-07-20", timeline);
  assert.equal(flip.stageChangedTo, "Flowering");

  const before = buildDayInfo("2026-05-20", timeline);
  assert.equal(before.stage, null);
  assert.equal(before.beforeGrowStarted, true);
});

test("buildDayInfo on a grow with nothing recorded reports no stage", () => {
  const info = buildDayInfo("2026-06-20", { events: [], firstDate: null });
  assert.equal(info.stage, null);
  assert.equal(info.growDay, null);
  assert.equal(info.beforeGrowStarted, true);
});

// ── buildTimelineText (MJ context) ───────────────────────────────────────────
test("buildTimelineText lists real switches and never invents a schedule", () => {
  const text = buildTimelineText(TIMELINE, "2026-06-01", "2026-06-20");
  assert.match(text, /2026-06-15 \(day 15\): moved to Vegetative/);
  assert.match(text, /Today \(2026-06-20\) is day 20 and the grow is in Vegetative/);
  assert.match(text, /no scheduled or estimated dates/);
  assert.doesNotMatch(text, /harvest on|projected|expected harvest/i);
});

test("buildTimelineText on an empty grow tells MJ not to invent dates", () => {
  assert.match(buildTimelineText([], null, "2026-06-20"), /nothing recorded yet/);
});

// ── resolveSurveyForSetup ────────────────────────────────────────────────────
test("resolveSurveyForSetup expands counts and tags every plant with the stage", () => {
  const out = resolveSurveyForSetup({
    currentStage: "flowering",
    stageStartDate: "2026-07-20",
    strains: [{ name: "Haze", count: 3 }, { name: "GDP" }],
  });
  assert.equal(out.strains.length, 4);
  assert.equal(out.plantCount, 4);
  assert.ok(out.strains.every(s => s.stage === "flowering"));
  assert.ok(out.strains.every(s => s.count === undefined));
  // No derived dates survive: the grower's own date is the only one.
  assert.equal(out.transplantDate, undefined);
  assert.equal(out.stageStartDate, "2026-07-20");
});

test("resolveSurveyForSetup defaults to seedling and clamps silly counts", () => {
  const out = resolveSurveyForSetup({ strains: [{ name: "X", count: 999 }] });
  assert.equal(out.currentStage, "seedling");
  assert.equal(out.strains.length, 12);
});
