import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrencesForDate } from "../src/lib/growdata/eventRules.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG); // start 2026-05-21, transplant 2026-05-24

function rule(extra) {
  return { id: "evt_1", label: "Neem", task: "Spray neem", enabled: true, createdAt: "2026-06-26T00:00:00.000Z", ...extra };
}

test("empty or missing rules yields no occurrences", () => {
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, []), []);
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, undefined), []);
});

test("range window + everyDay fires inside the range only", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]);
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 25), config, r), []);
});

test("range window + everyNDays fires on the cadence beat", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyNDays", n: 7, anchor: "2026-06-01" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]); // 06-01 + 14
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 16), config, r), []);
});

test("phase window matches by getPhase membership", () => {
  const r = [rule({ window: { type: "phase", phases: ["veg_full"] }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 6, 10), config, r), ["Spray neem"]); // 2026-07-10 is veg_full
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), []); // veg_cm
});

test("milestone window resolves offsets off a config date", () => {
  const r = [rule({ window: { type: "milestone", anchor: "transplant", offsetStart: -3, offsetEnd: -3 }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 4, 21), config, r), ["Spray neem"]); // 3 days before 2026-05-24
  assert.deepEqual(occurrencesForDate(new Date(2026, 4, 22), config, r), []);
});

test("dates cadence ignores window and fires on listed days", () => {
  const r = [rule({ cadence: { type: "dates", dates: ["2026-06-30", "2026-07-14"] } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 30), config, r), ["Spray neem"]);
  assert.deepEqual(occurrencesForDate(new Date(2026, 6, 1), config, r), []);
});

test("weekdays cadence fires on listed weekday within window", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "weekdays", days: ["mon"] } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]); // 2026-06-15 is a Monday
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 16), config, r), []); // Tuesday
});

test("disabled rules never fire", () => {
  const r = [rule({ enabled: false, window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), []);
});

test("multiple rules return in createdAt order", () => {
  const r = [
    rule({ id: "b", task: "B", createdAt: "2026-06-26T02:00:00.000Z", window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } }),
    rule({ id: "a", task: "A", createdAt: "2026-06-26T01:00:00.000Z", window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } }),
  ];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["A", "B"]);
});
