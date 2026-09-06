import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_STAGES, CROPS, CROP_STAGES, DEFAULT_CROP, STAGE_GROUP, STAGE_LABEL,
  cropOf, cropOfStage, defaultStage, defaultVarietyType, flushTotals, isCrop,
  isVarietyType, nextFlushNumber, stagesFor, varietyTypes, wizardStages, words,
} from "../src/lib/crops.js";
import { buildRunningTimeline, stageIndex, stageOnDate } from "../src/lib/stageTimeline.js";
import { phaseOrder, phaseAfterDrying, dryGuide, dryReadiness } from "../src/lib/lifecycle.js";

// Two crops share one app. These tests pin the two rules that let them: stage
// ids are unique across crops, and every stage sits in one ordered ladder.

test("a space that never said what it grows is cannabis", () => {
  // Every grow in the database predates this field, and they are all cannabis.
  assert.equal(cropOf(undefined), "cannabis");
  assert.equal(cropOf({}), "cannabis");
  assert.equal(cropOf({ crop: "tomatoes" }), "cannabis");
  assert.equal(cropOf({ environment: "indoor" }), "cannabis");
  assert.equal(DEFAULT_CROP, "cannabis");
  // And a survey that does say reads as what it says.
  assert.equal(cropOf({ crop: "mushrooms" }), "mushrooms");
  assert.equal(cropOf("mushrooms"), "mushrooms");
  assert.equal(isCrop("mushrooms"), true);
  assert.equal(isCrop("kelp"), false);
});

test("no stage id belongs to two crops", () => {
  // This is what lets the timeline, the calendar and the stage history stay
  // crop-agnostic: an id says which crop it is.
  assert.equal(new Set(ALL_STAGES).size, ALL_STAGES.length);
  for (const stage of CROP_STAGES.cannabis) {
    assert.equal(cropOfStage(stage), "cannabis", stage);
  }
  for (const stage of CROP_STAGES.mushrooms) {
    assert.equal(cropOfStage(stage), "mushrooms", stage);
  }
  assert.equal(cropOfStage("photosynthesis"), null);
});

test("every stage has a label and a colour, whichever crop it is", () => {
  for (const stage of ALL_STAGES) {
    assert.ok(STAGE_LABEL[stage], `${stage} has no label`);
    assert.ok(STAGE_GROUP[stage]?.color, `${stage} has no colour`);
    assert.ok(stageIndex(stage) >= 0, `${stage} is not on the ladder`);
  }
});

test("one ladder orders each crop correctly and never interleaves them", () => {
  const ladders = CROPS.map((c) => stagesFor(c).map(stageIndex));
  for (const indices of ladders) {
    const ascending = [...indices].sort((a, b) => a - b);
    assert.deepEqual(indices, ascending, "a crop's own stages are out of order");
  }
  // Cannabis occupies the front of the ladder, mushrooms the back, so an index
  // comparison inside one crop can never be confused by the other.
  const lastCannabis = Math.max(...stagesFor("cannabis").map(stageIndex));
  const firstMushroom = Math.min(...stagesFor("mushrooms").map(stageIndex));
  assert.ok(lastCannabis < firstMushroom);
});

test("a tub's timeline runs forward through mushroom stages", () => {
  const events = buildRunningTimeline([
    { date: "2026-03-01", stage: "inoculation" },
    { date: "2026-03-14", stage: "colonization" },
    { date: "2026-03-02", stage: "colonization" },   // out of order, and behind
    { date: "2026-04-02", stage: "fruiting" },
  ], "2026-03-01");

  assert.deepEqual(events.map(e => e.stage), ["inoculation", "colonization", "fruiting"]);
  assert.equal(stageOnDate(events, "2026-03-20"), "colonization");
  assert.equal(stageOnDate(events, "2026-04-10"), "fruiting");
  // A day before the tub existed belongs to no stage at all.
  assert.equal(stageOnDate(events, "2026-02-27"), null);
});

test("each crop starts a new entry where that crop actually starts", () => {
  assert.equal(defaultStage("cannabis"), "seedling");
  assert.equal(defaultStage("mushrooms"), "inoculation");
  // The wizard offers everything up to the first harvest, and no further.
  for (const crop of CROPS) {
    const offered = wizardStages(crop).map(s => s.value);
    const ladder = stagesFor(crop);
    assert.deepEqual(offered, ladder.slice(0, offered.length));
    assert.ok(offered.length < ladder.length, "nothing past the first harvest is a place to start");
  }
});

test("a variety type from the wrong crop is not a variety type", () => {
  assert.equal(isVarietyType("cannabis", "hybrid"), true);
  assert.equal(isVarietyType("cannabis", "cube"), false);
  assert.equal(isVarietyType("mushrooms", "cube"), true);
  assert.equal(isVarietyType("mushrooms", "sativa"), false);
  assert.equal(defaultVarietyType("cannabis"), "hybrid");
  assert.equal(defaultVarietyType("mushrooms"), "cube");
  for (const crop of CROPS) assert.ok(varietyTypes(crop).length >= 3);
});

test("a tub is never called a plant", () => {
  const tent = words("cannabis");
  const tub = words("mushrooms");
  assert.equal(tent.unit, "plant");
  assert.equal(tub.unit, "tub");
  assert.equal(tub.variety, "species");
  assert.equal(tub.waterVerb, "misted");
  // Every word one crop has, the other has too, or a screen would render
  // "undefined" the moment it switched.
  assert.deepEqual(Object.keys(tent).sort(), Object.keys(tub).sort());
  for (const [key, value] of Object.entries(tub)) {
    assert.ok(value !== undefined && value !== "", `mushrooms have no ${key}`);
  }
});

// ── Flushes ──────────────────────────────────────────────────────────────────
test("flushes are counted from what the tub has already given", () => {
  assert.equal(nextFlushNumber([]), 1);
  assert.equal(nextFlushNumber(null), 1);
  const history = [
    { kind: "flush", detail: { flush: 1, wetG: 412, dryG: 41 } },
    { kind: "note", detail: { flush: 99 } },          // not a flush
    { kind: "flush", detail: { flush: 2, wetG: 288 } },
  ];
  assert.equal(nextFlushNumber(history), 3);

  const totals = flushTotals(history);
  assert.equal(totals.flushes, 2);
  assert.equal(totals.wetG, 700);
  // A flush picked but not yet weighed dry counts as a flush, not as zero dry.
  assert.equal(totals.dryG, 41);
});

// ── After the harvest ────────────────────────────────────────────────────────
test("nothing cures a mushroom", () => {
  assert.deepEqual(phaseOrder("cannabis"), ["growing", "drying", "curing", "done"]);
  assert.deepEqual(phaseOrder("mushrooms"), ["growing", "drying", "done"]);
  assert.equal(phaseAfterDrying("cannabis"), "curing");
  assert.equal(phaseAfterDrying("mushrooms"), "done");
});

test("drying is judged against the right crop's window", () => {
  const started = { dryStartedAt: "2026-05-01", dryChecklist: {}, dryLogs: [] };
  const day3 = new Date(2026, 4, 4);

  // Three days in: a tub is at the finish, a plant has barely started.
  assert.equal(dryReadiness(started, day3, "mushrooms").status, "window");
  assert.equal(dryReadiness(started, day3, "cannabis").status, "early");

  // And each crop's own last checkbox is the one that settles it.
  const g = dryGuide("mushrooms");
  const done = { ...started, dryChecklist: { [g.checklist[g.checklist.length - 1].key]: true } };
  assert.equal(dryReadiness(done, day3, "mushrooms").status, "ready");
});
