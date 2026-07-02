import { test } from "node:test";
import assert from "node:assert/strict";
import { isLogFilled } from "../worker/growLog.js";
import { sweepDates } from "../src/lib/autoCompleteTasks.js";

// ── Logged-day detection (drives the calendar ring) ─────────────────────────
test("isLogFilled: any real entry counts, empty rows do not", () => {
  assert.equal(isLogFilled(null), false);
  assert.equal(isLogFilled({}), false);
  assert.equal(isLogFilled({ water_gal: null, feed: null, water_plants: "[]", training: null }), false);
  assert.equal(isLogFilled({ temp_high: 78 }), true);
  assert.equal(isLogFilled({ humidity: 55 }), true);
  assert.equal(isLogFilled({ feed: "half dose" }), true);
  assert.equal(isLogFilled({ water_plants: JSON.stringify([{ gal: 2 }]) }), true);
  assert.equal(isLogFilled({ training: JSON.stringify([{ action: "LST" }]) }), true);
  assert.equal(isLogFilled({ plant_health: "not json" }), false);
});

// ── Auto-complete sweep window ───────────────────────────────────────────────
test("sweepDates covers days after the cursor and before today", () => {
  assert.deepEqual(sweepDates("2026-06-25", "2026-06-29"), ["2026-06-26", "2026-06-27", "2026-06-28"]);
});

test("sweepDates is empty when the cursor is already at yesterday", () => {
  assert.deepEqual(sweepDates("2026-06-28", "2026-06-29"), []);
});

test("sweepDates never includes today and caps a long-dormant device", () => {
  const dates = sweepDates("2026-01-01", "2026-06-29");
  assert.ok(!dates.includes("2026-06-29"));
  assert.equal(dates.length, 31);
  assert.equal(dates[dates.length - 1], "2026-06-28"); // the most recent days win
});

test("sweepDates crosses month boundaries correctly", () => {
  assert.deepEqual(sweepDates("2026-06-29", "2026-07-02"), ["2026-06-30", "2026-07-01"]);
});
