import { test } from "node:test";
import assert from "node:assert/strict";
import { validatePlantFields, isPastDateKey } from "../worker/plantsRoster.js";
import { joinStageDate } from "../worker/plants.js";
import { getGrowReport } from "../worker/report.js";

// The breeder's range and a plant's real start date: what a harvest window and
// an honest age are built from.

test("the breeder's range is a minimum and a maximum, in that order", () => {
  const ok = validatePlantFields({ flowerWeeks: 8, flowerWeeksMax: 10 }, true, "cannabis");
  assert.equal(ok.ok, true);
  assert.equal(ok.value.flowerWeeksMax, 10);
  assert.equal(validatePlantFields({ flowerWeeks: 10, flowerWeeksMax: 8 }, true, "cannabis").ok, false);
  assert.equal(validatePlantFields({ flowerWeeksMax: 30 }, true, "cannabis").ok, false);
  assert.equal(validatePlantFields({ flowerWeeksMax: null }, true, "cannabis").value.flowerWeeksMax, null);
});

test("an autoflower's seed-to-harvest weeks fit the field", () => {
  assert.equal(validatePlantFields({ flowerWeeks: 11, flowerWeeksMax: 14, photo: false }, true, "cannabis").ok, true);
});

test("a start date can be in the past, never the future", () => {
  assert.equal(validatePlantFields({ startedOn: "2026-08-01" }, true, "cannabis").value.startedOn, "2026-08-01");
  assert.equal(validatePlantFields({ startedOn: "2999-01-01" }, true, "cannabis").ok, false);
  assert.equal(validatePlantFields({ startedOn: "08/01/2026" }, true, "cannabis").ok, false);
  assert.equal(validatePlantFields({ startedOn: null }, true, "cannabis").value.startedOn, null);
  assert.equal(isPastDateKey("2026-10-07", "2026-10-06"), true, "a phone a day ahead of UTC is not the future");
  assert.equal(isPastDateKey("2026-10-09", "2026-10-06"), false);
  assert.equal(isPastDateKey("1999-12-31", "2026-10-06"), false);
});

test("a new plant enters its stage when the grower says, else sensibly", () => {
  const today = "2026-10-06";
  // An explicit date wins.
  assert.deepEqual(joinStageDate({ stageSince: "2026-09-15" }, "2026-08-01", "flowering", "cannabis", today),
    { ok: true, date: "2026-09-15" });
  // Joining as a seedling or earlier: it was in that stage from the day it started.
  assert.deepEqual(joinStageDate({}, "2026-09-30", "germination", "cannabis", today),
    { ok: true, date: "2026-09-30" });
  // Joining further on with no date: today, as before.
  assert.deepEqual(joinStageDate({}, "2026-08-01", "vegetative", "cannabis", today),
    { ok: true, date: today });
  assert.deepEqual(joinStageDate({}, undefined, "vegetative", "cannabis", today), { ok: true, date: today });
});

test("a stage cannot begin before the plant, or in the future", () => {
  const today = "2026-10-06";
  assert.equal(joinStageDate({ stageSince: "2026-07-01" }, "2026-08-01", "flowering", "cannabis", today).ok, false);
  assert.equal(joinStageDate({ stageSince: "2026-12-01" }, "2026-08-01", "flowering", "cannabis", today).ok, false);
  assert.equal(joinStageDate({ stageSince: "2026-09-01" }, undefined, "flowering", "cannabis", today).ok, false,
    "with no start date the plant starts today, so a stage cannot predate it");
});

// ── The rundown carries the same clock ──────────────────────────────────────

test("the rundown prints each plant's start, stage lengths and breeder window", async () => {
  const survey = {
    crop: "cannabis",
    strains: [{
      id: "p1", name: "Blue Dream", type: "hybrid", photo: true, status: "growing",
      flowerWeeks: 8, flowerWeeksMax: 10, startedOn: "2026-08-01", stage: "flowering",
    }],
  };
  const stageRows = [
    { date: "2026-08-01", body: "", detail: '{"stage":"seedling"}', plant_id: "p1" },
    { date: "2026-08-20", body: "", detail: '{"stage":"vegetative"}', plant_id: "p1" },
    { date: "2026-09-15", body: "", detail: '{"stage":"flowering"}', plant_id: "p1" },
  ];
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return /FROM grows/.test(sql)
              ? { id: "g1", user_id: 7, display_name: "Tent", created_at: "2026-08-01T00:00:00Z", survey: JSON.stringify(survey) }
              : null;
          },
          async all() { return { results: /FROM plant_log\s+WHERE user_id = \? AND grow_id = \? AND kind = 'stage'/.test(sql) ? stageRows : [] }; },
          async run() { return { meta: { changes: 0 } }; },
        };
      },
    },
  };
  const html = await (await getGrowReport(env, { id: 7 }, "g1")).text();
  assert.match(html, /8 to 10 wk flower/);
  assert.match(html, /Started Aug 1/);
  assert.match(html, /Seedling 2w 5d · Vegetative 3w 5d · Flowering/);
  assert.match(html, /Nov 10 to 24|In harvest window|past the harvest window|Harvest Nov 10 to 24/);
});

test("MJ is told each plant's stage length, age and breeder window", async () => {
  const { buildRosterContext } = await import("../worker/mj/context.js");
  const survey = {
    crop: "cannabis",
    strains: [
      { id: "a", name: "Blue Dream", photo: true, flowerWeeks: 8, flowerWeeksMax: 10, startedOn: "2026-08-01", stage: "flowering" },
      { id: "b", name: "Blue Dream", photo: true, flowerWeeks: 8, flowerWeeksMax: 10, startedOn: "2026-08-01", stage: "flowering" },
    ],
  };
  const records = ["a", "b"].map((plantId) => ({ plantId, date: "2026-09-15", stage: "flowering" }));
  const line = buildRosterContext(survey, { records, todayKey: "2026-10-23" });
  assert.match(line, /Blue Dream x2/);
  assert.match(line, /flowering for 5w 3d/);
  assert.match(line, /day 83 since started/);
  assert.match(line, /breeder 8 to 10 wk of flower/);
  assert.match(line, /Harvest Nov 10 to 24, in 18 to 32 days/);
  // Without a date it is the old one-liner, which the prompt cache test pins.
  assert.equal(buildRosterContext(survey), "PLANTS IN THIS SPACE: Blue Dream [flowering], Blue Dream [flowering].");
});
