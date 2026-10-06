import { test } from "node:test";
import assert from "node:assert/strict";
import {
  addDays, daysBetweenKeys, shortWeeks, rangeLabel, plantStartDate, plantAge,
  plantStageSpans, spanDays, spanOn, breederWeeks, weeksRangeLabel, harvestWindow,
  harvestStatus, harvestLine, plantClocks, windowGroups, windowsOn, soonestHarvest,
  breederFieldLabel,
} from "../src/lib/plantClock.js";

const rec = (plantId, date, stage) => ({ plantId, date, stage });

test("date keys move and measure in whole days, across months and DST", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-03-07", 2), "2026-03-09");
  assert.equal(daysBetweenKeys("2026-10-01", "2026-12-01"), 61);
  assert.equal(daysBetweenKeys("2026-10-05", "2026-10-01"), -4);
  assert.equal(addDays("not a date", 1), null);
});

test("short forms read the way a grower says them", () => {
  assert.equal(shortWeeks(64), "9w 1d");
  assert.equal(shortWeeks(14), "2w");
  assert.equal(shortWeeks(3), "3d");
  assert.equal(rangeLabel("2026-12-01", "2026-12-15"), "Dec 1 to 15");
  assert.equal(rangeLabel("2026-11-28", "2026-12-12"), "Nov 28 to Dec 12");
  assert.equal(rangeLabel("2026-12-01", "2026-12-01"), "Dec 1");
});

test("a plant counts from its real start date, then from the day it was added", () => {
  assert.equal(plantStartDate({ startedOn: "2026-08-01", createdAt: "2026-09-01" }), "2026-08-01");
  assert.equal(plantStartDate({ createdAt: "2026-09-01" }), "2026-09-01");
  assert.equal(plantStartDate({}, "2026-07-01"), "2026-07-01");
  assert.equal(plantAge({ startedOn: "2026-08-01" }, "2026-10-04"), 64);
  assert.equal(plantAge({ startedOn: "2026-08-01" }, "2026-07-01"), null);
});

test("stage spans run forward, end where the next begins, and ignore other plants", () => {
  const plant = { id: "a", startedOn: "2026-08-01", stage: "flowering" };
  const spans = plantStageSpans(plant, [
    rec("a", "2026-08-01", "germination"),
    rec("a", "2026-08-06", "seedling"),
    rec("a", "2026-08-20", "vegetative"),
    rec("b", "2026-08-21", "flowering"),
    rec("a", "2026-09-15", "flowering"),
    rec("a", "2026-09-20", "vegetative"),   // backward: ignored
  ]);
  assert.deepEqual(spans.map((s) => [s.stage, s.start, s.end]), [
    ["germination", "2026-08-01", "2026-08-06"],
    ["seedling", "2026-08-06", "2026-08-20"],
    ["vegetative", "2026-08-20", "2026-09-15"],
    ["flowering", "2026-09-15", null],
  ]);
  assert.equal(spanDays(spans[2]), 26);
  assert.equal(spanDays(spans[3], "2026-10-04"), 19);
  assert.equal(spanOn(spans, "2026-08-10").stage, "seedling");
  assert.equal(spanOn(spans, "2026-07-10"), null);
});

test("a record older than the plant's start is pulled up to the start", () => {
  const spans = plantStageSpans({ id: "a", startedOn: "2026-08-01" }, [rec("a", "2026-07-01", "seedling")]);
  assert.equal(spans[0].start, "2026-08-01");
});

test("a plant from before switches were recorded is in its stage since it started", () => {
  const spans = plantStageSpans({ id: "a", createdAt: "2026-08-01", stage: "vegetative" }, []);
  assert.deepEqual(spans, [{ stage: "vegetative", start: "2026-08-01", end: null }]);
});

test("the breeder range falls back sensibly", () => {
  assert.deepEqual(breederWeeks({ flowerWeeks: 8, flowerWeeksMax: 10 }), { min: 8, max: 10 });
  assert.deepEqual(breederWeeks({ flowerWeeks: 9 }), { min: 9, max: 9 });
  assert.deepEqual(breederWeeks({ flowerWeeks: 9, flowerWeeksMax: 7 }), { min: 9, max: 9 });
  assert.deepEqual(breederWeeks({ photo: false }), { min: 10, max: 12 });
  assert.equal(weeksRangeLabel({ min: 8, max: 10 }), "8 to 10 wk");
  assert.equal(weeksRangeLabel({ min: 9, max: 9 }), "9 wk");
});

test("a photoperiod counts from the flip; before it, there are no dates", () => {
  const plant = { id: "a", photo: true, flowerWeeks: 8, flowerWeeksMax: 10 };
  const veg = harvestWindow(plant, [{ stage: "vegetative", start: "2026-08-20", end: null }], "cannabis");
  assert.equal(veg.pending, true);
  assert.equal(harvestLine(veg, "2026-09-01"), "Harvest 8 to 10 wk after flip");

  const spans = [
    { stage: "vegetative", start: "2026-08-20", end: "2026-09-15" },
    { stage: "flowering", start: "2026-09-15", end: null },
  ];
  const w = harvestWindow(plant, spans, "cannabis");
  assert.equal(w.anchor, "2026-09-15");
  assert.equal(w.start, "2026-11-10");
  assert.equal(w.end, "2026-11-24");
});

test("a flushing plant still counts from when it flowered", () => {
  const plant = { id: "a", flowerWeeks: 8, flowerWeeksMax: 9 };
  const w = harvestWindow(plant, [
    { stage: "flowering", start: "2026-09-15", end: "2026-11-01" },
    { stage: "flushing", start: "2026-11-01", end: null },
  ], "cannabis");
  assert.equal(w.anchor, "2026-09-15");
});

test("an autoflower counts from the day it was started", () => {
  const plant = { id: "a", photo: false, flowerWeeks: 10, flowerWeeksMax: 12, startedOn: "2026-08-01" };
  const w = harvestWindow(plant, [{ stage: "vegetative", start: "2026-08-10", end: null }], "cannabis", "2026-08-01");
  assert.equal(w.pending, false);
  assert.equal(w.start, "2026-10-10");
  assert.equal(w.end, "2026-10-24");
});

test("mushrooms get history but no harvest window", () => {
  assert.equal(harvestWindow({ id: "t" }, [{ stage: "fruiting", start: "2026-09-01", end: null }], "mushrooms"), null);
});

test("status walks before, open, past, and stops at harvest", () => {
  const w = { pending: false, anchor: "2026-09-15", start: "2026-11-10", end: "2026-11-24", minWeeks: 8, maxWeeks: 10, harvestedOn: null };
  const before = harvestStatus(w, "2026-10-23");
  assert.equal(before.phase, "before");
  assert.equal(before.daysToStart, 18);
  assert.equal(before.daysToEnd, 32);
  assert.equal(harvestLine(w, "2026-10-23"), "Harvest Nov 10 to 24, in 18 to 32 days");

  const open = harvestStatus(w, "2026-11-12");
  assert.equal(open.phase, "open");
  assert.equal(open.dayOfWindow, 3);
  assert.equal(open.windowDays, 15);
  assert.equal(harvestLine(w, "2026-11-24"), "In harvest window, last day");

  assert.equal(harvestStatus(w, "2026-11-28").daysPast, 4);
  assert.equal(harvestLine(w, "2026-11-28"), "4 days past the harvest window");
  assert.equal(harvestLine({ ...w, harvestedOn: "2026-11-20" }, "2026-11-28"), "Harvested Nov 20");
});

test("a single-week window says one number of days", () => {
  const w = { pending: false, anchor: "2026-09-15", start: "2026-11-10", end: "2026-11-10", minWeeks: 8, maxWeeks: 8, harvestedOn: null };
  assert.equal(harvestLine(w, "2026-11-09"), "Harvest Nov 10, in 1 day");
});

test("a space's windows group by date and only count growing plants", () => {
  const plants = [
    { id: "a", name: "Blue Dream", flowerWeeks: 8, flowerWeeksMax: 10, status: "growing" },
    { id: "b", name: "Blue Dream", flowerWeeks: 8, flowerWeeksMax: 10, status: "growing" },
    { id: "c", name: "Gelato", flowerWeeks: 9, flowerWeeksMax: 9, status: "growing" },
    { id: "d", name: "Gone", flowerWeeks: 8, status: "dead" },
    { id: "e", name: "Still veg", flowerWeeks: 8, status: "growing", stage: "vegetative", createdAt: "2026-09-01" },
  ];
  const records = ["a", "b", "c", "d"].map((id) => rec(id, "2026-09-15", "flowering"));
  const clocks = plantClocks(plants, records, { todayKey: "2026-10-04", crop: "cannabis" });
  assert.equal(clocks.length, 4);
  const groups = windowGroups(clocks);
  assert.deepEqual(groups.map((g) => [g.start, g.end, g.plants.map((p) => p.id)]), [
    ["2026-11-10", "2026-11-24", ["a", "b"]],
    ["2026-11-17", "2026-11-17", ["c"]],
  ]);
  assert.equal(windowsOn(groups, "2026-11-12").length, 1);
  assert.equal(windowsOn(groups, "2026-11-17").length, 2);
  assert.equal(windowsOn(groups, "2026-11-25").length, 0);
  assert.equal(soonestHarvest(clocks).window.start, "2026-11-10");
  assert.equal(clocks.find((c) => c.plant.id === "a").inStage, 19);
});

test("the breeder field is labelled for what an auto and a photo actually quote", () => {
  assert.match(breederFieldLabel({ photo: false }, "cannabis"), /Seed to harvest/);
  assert.match(breederFieldLabel({ photo: true }, "cannabis"), /Flowering time/);
  assert.match(breederFieldLabel({}, "mushrooms"), /first flush/);
});

test("a breeder range stays inside its type's limits, most never below least", async () => {
  const { clampBreederWeeks } = await import("../src/lib/plantClock.js");
  assert.deepEqual(clampBreederWeeks({ min: 8, max: 10 }, false), { min: 8, max: 10 });
  assert.deepEqual(clampBreederWeeks({ min: 11, max: 9 }, false), { min: 11, max: 11 });
  assert.deepEqual(clampBreederWeeks({ min: 3, max: 30 }, false), { min: 6, max: 16 });
  assert.deepEqual(clampBreederWeeks({ min: 12, max: 18 }, true), { min: 12, max: 18 });
});

test("identical plants read as one row with a count", async () => {
  const { clockRows } = await import("../src/lib/plantClock.js");
  const plants = [
    { id: "a", name: "Blue Dream", startedOn: "2026-08-01", stage: "vegetative" },
    { id: "b", name: "blue dream ", startedOn: "2026-08-01", stage: "vegetative" },
    { id: "c", name: "Blue Dream", startedOn: "2026-08-02", stage: "vegetative" },
  ];
  const rows = clockRows(plantClocks(plants, [], { todayKey: "2026-10-01", crop: "cannabis" }));
  assert.deepEqual(rows.map((r) => [r.plant.id, r.count]), [["a", 2], ["c", 1]]);
});

test("a journal day shows each plant as it was that day", async () => {
  const { plantsOnDate } = await import("../src/lib/plantClock.js");
  const plants = [
    { id: "a", name: "Blue Dream", startedOn: "2026-08-01", flowerWeeks: 8, flowerWeeksMax: 10 },
    { id: "b", name: "Blue Dream", startedOn: "2026-08-01", flowerWeeks: 8, flowerWeeksMax: 10 },
    { id: "late", name: "Gelato", startedOn: "2026-10-01" },
  ];
  const records = ["a", "b"].flatMap((id) => [
    rec(id, "2026-08-01", "seedling"),
    rec(id, "2026-08-20", "vegetative"),
    rec(id, "2026-09-15", "flowering"),
  ]);
  const sept = plantsOnDate(plants, records, "2026-09-01", { crop: "cannabis" });
  assert.equal(sept.length, 1, "Gelato had not started; the two Blue Dreams are one row");
  assert.equal(sept[0].count, 2);
  assert.equal(sept[0].age, 31);
  assert.equal(sept[0].stage, "vegetative");
  assert.equal(sept[0].dayInStage, 12);
  assert.equal(sept[0].inWindow, false);

  const nov = plantsOnDate(plants, records, "2026-11-12", { crop: "cannabis" });
  const bd = nov.find((r) => r.plant.id === "a");
  assert.equal(bd.inWindow, true);
  assert.equal(bd.dayOfWindow, 3);
  assert.equal(bd.windowDays, 15);
});

test("a day ahead shows age and window but never a stage nobody has reached", async () => {
  const { plantsOnDate } = await import("../src/lib/plantClock.js");
  const plants = [{ id: "a", name: "Blue Dream", startedOn: "2026-08-01", flowerWeeks: 8, flowerWeeksMax: 10 }];
  const records = [rec("a", "2026-09-15", "flowering")];
  const [row] = plantsOnDate(plants, records, "2026-11-12", { crop: "cannabis", todayKey: "2026-10-06" });
  assert.equal(row.stage, null);
  assert.equal(row.age, 103);
  assert.equal(row.inWindow, true);
});
