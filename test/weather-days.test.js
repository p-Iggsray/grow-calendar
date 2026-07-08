import { test } from "node:test";
import assert from "node:assert/strict";
import {
  locKey, coordsFromSurvey, shapeOpenMeteoDaily, isFinalReading, mergeAutoWeather,
} from "../worker/weatherDays.js";
import { isLogFilled } from "../worker/growLog.js";

test("locKey buckets coordinates to ~1km so nearby grows share cache", () => {
  assert.equal(locKey(40.71283, -74.00602), "40.71,-74.01");
  assert.equal(locKey(40.714, -74.009), "40.71,-74.01");
});

test("coordsFromSurvey: numbers pass, junk and missing return null", () => {
  assert.deepEqual(coordsFromSurvey({ lat: 40.7, lon: -74 }), { lat: 40.7, lon: -74 });
  assert.deepEqual(coordsFromSurvey({ lat: "40.7", lon: "-74" }), { lat: 40.7, lon: -74 });
  assert.equal(coordsFromSurvey({ lat: "x", lon: -74 }), null);
  assert.equal(coordsFromSurvey({}), null);
  assert.equal(coordsFromSurvey(null), null);
  // null/"" coerce to 0 via Number() - must NOT become 0,0 coordinates.
  assert.equal(coordsFromSurvey({ lat: null, lon: null }), null);
  assert.equal(coordsFromSurvey({ lat: "", lon: "" }), null);
});

test("hasGrowLocation: coords or a place name count; null/'' coords do not", async () => {
  const { hasGrowLocation } = await import("../src/lib/growProfile.js");
  assert.equal(hasGrowLocation({ lat: 40.7, lon: -74 }), true);
  assert.equal(hasGrowLocation({ location: "Portland, OR" }), true);
  assert.equal(hasGrowLocation({ lat: null, lon: null, location: "  " }), false);
  assert.equal(hasGrowLocation({ lat: "", lon: "" }), false);
  assert.equal(hasGrowLocation({}), false);
  assert.equal(hasGrowLocation(null), false);
});

test("shapeOpenMeteoDaily: parallel arrays become per-day records", () => {
  const days = shapeOpenMeteoDaily({
    daily: {
      time: ["2026-07-03", "2026-07-04"],
      temperature_2m_max: [88.4, 91.06],
      temperature_2m_min: [64.1, 66.9],
      relative_humidity_2m_mean: [55, 61.5],
      precipitation_sum: [0, 0.25],
    },
  });
  assert.equal(days.length, 2);
  assert.deepEqual(days[1], { date: "2026-07-04", high: 91.1, low: 66.9, humidity: 61.5, precip: 0.3 });
});

test("shapeOpenMeteoDaily: missing arrays and nulls degrade to null fields", () => {
  const days = shapeOpenMeteoDaily({
    daily: { time: ["2026-07-03"], temperature_2m_max: [null] },
  });
  assert.deepEqual(days[0], { date: "2026-07-03", high: null, low: null, humidity: null, precip: null });
  assert.deepEqual(shapeOpenMeteoDaily({}), []);
  assert.deepEqual(shapeOpenMeteoDaily(null), []);
});

test("isFinalReading: a row written after its day ended is final", () => {
  assert.equal(isFinalReading({ date: "2026-07-03", updated_at: "2026-07-04T12:00:00Z" }), true);
  assert.equal(isFinalReading({ date: "2026-07-03", updated_at: "2026-07-03T21:00:00Z" }), false);
  assert.equal(isFinalReading(null), false);
});

// ── Auto-logging merge rules ─────────────────────────────────────────────────
test("mergeAutoWeather: fills only the blanks, never grower-entered values", () => {
  const wx = { high: 91, low: 67, humidity: 62 };
  // Fresh day: everything fills.
  assert.deepEqual(mergeAutoWeather(null, wx), { temp_high: 91, temp_low: 67, humidity: 62 });
  // Grower already logged a high: only the gaps fill.
  assert.deepEqual(
    mergeAutoWeather({ temp_high: 89, temp_low: null, humidity: null }, wx),
    { temp_low: 67, humidity: 62 }
  );
  // Fully logged day: nothing to write.
  assert.equal(mergeAutoWeather({ temp_high: 89, temp_low: 65, humidity: 60 }, wx), null);
  // No usable weather: nothing to write.
  assert.equal(mergeAutoWeather(null, null), null);
  assert.equal(mergeAutoWeather(null, { high: null, low: null, humidity: null }), null);
});

test("auto-created weather rows never count as a logged day", () => {
  // Row created by the auto-logger: readings present but flagged.
  assert.equal(isLogFilled({ temp_high: 91, temp_low: 67, humidity: 62, auto_weather: 1 }), false);
  // The grower touches the row (flag cleared on save): it counts again.
  assert.equal(isLogFilled({ temp_high: 91, temp_low: 67, humidity: 62, auto_weather: 0 }), true);
  // Legacy rows without the column behave exactly as before.
  assert.equal(isLogFilled({ temp_high: 91 }), true);
  assert.equal(isLogFilled({ water_gal: null, feed: null }), false);
});
