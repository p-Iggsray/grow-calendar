import { test } from "node:test";
import assert from "node:assert/strict";
import { summariseStatus, whenLabel } from "../src/lib/homeStatus.js";

// The home card only ever reports days somebody wrote down. These tests pin
// that: no averaging, no filling a gap, no reading a plan.

const day = (date, extra = {}) => ({ date, ...extra });

test("no days at all means nothing to report, not zeroes", () => {
  const { water, climate } = summariseStatus([]);
  assert.equal(water, null);
  assert.equal(climate, null);
  assert.deepEqual(summariseStatus(null), { water: null, climate: null });
  assert.deepEqual(summariseStatus(undefined), { water: null, climate: null });
});

test("the most recent watering wins, and carries the unit it was logged in", () => {
  const { water } = summariseStatus([
    day("2026-09-02", { log: { water_gal: 0.5, water_unit: "gal", waterings: 2 } }),
    day("2026-09-05", { log: { water_gal: 0.066, water_unit: "ml", waterings: 1 } }),
  ]);
  assert.equal(water.date, "2026-09-05");
  assert.equal(water.unit, "ml");
  assert.equal(water.waterings, 1);
});

test("days arriving oldest first are still read newest first", () => {
  const ascending = [
    day("2026-09-01", { log: { water_gal: 1, water_unit: "gal" } }),
    day("2026-09-09", { log: { water_gal: 2, water_unit: "l" } }),
  ];
  assert.equal(summariseStatus(ascending).water.date, "2026-09-09");
});

test("a day whose log was opened and left blank is not a watering", () => {
  const { water } = summariseStatus([
    day("2026-09-06", { log: { water_gal: 0, water_unit: "gal", waterings: 0 } }),
    day("2026-09-04", { log: { water_gal: 1.5, water_unit: "gal", waterings: 3 } }),
  ]);
  assert.equal(water.date, "2026-09-04", "the empty day was skipped");
  assert.equal(water.gal, 1.5);
});

test("a space's own reading beats the weather service on the same day", () => {
  const { climate } = summariseStatus([
    day("2026-09-06", {
      log: { temp_high: 78, temp_low: 66, humidity: 55 },
      weather: { high: 91, low: 70, humidity: 30 },
    }),
  ]);
  assert.equal(climate.source, "log");
  assert.equal(climate.high, 78);
  assert.equal(climate.humidity, 55);
});

test("an outdoor space with nothing logged falls back to what was written in for it", () => {
  const { climate } = summariseStatus([
    day("2026-09-06", { log: { water_gal: 2 }, weather: { high: 91, low: 70, humidity: 30 } }),
  ]);
  assert.equal(climate.source, "weather");
  assert.equal(climate.low, 70);
});

test("humidity alone is a reading; an empty log is not", () => {
  assert.equal(summariseStatus([day("2026-09-06", { log: { humidity: 88 } })]).climate.humidity, 88);
  assert.equal(summariseStatus([day("2026-09-06", { log: { water_gal: 1 } })]).climate, null);
});

test("watering and climate are found independently, on different days", () => {
  const { water, climate } = summariseStatus([
    day("2026-09-07", { log: { temp_high: 74, humidity: 88 } }),
    day("2026-09-05", { log: { water_gal: 0.07, water_unit: "ml", waterings: 1 } }),
  ]);
  assert.equal(climate.date, "2026-09-07");
  assert.equal(water.date, "2026-09-05");
});

test("recent days read as counts, older ones as dates", () => {
  assert.equal(whenLabel("2026-09-07", "2026-09-07"), "today");
  assert.equal(whenLabel("2026-09-06", "2026-09-07"), "yesterday");
  assert.equal(whenLabel("2026-09-04", "2026-09-07"), "3 days ago");
  assert.equal(whenLabel("2026-08-12", "2026-09-07"), "12 Aug");
});

test("whenLabel survives junk rather than printing NaN", () => {
  assert.equal(whenLabel(null, "2026-09-07"), "");
  assert.equal(whenLabel("2026-09-07", null), "");
  assert.equal(whenLabel("nonsense", "2026-09-07"), "");
});
