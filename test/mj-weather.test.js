import { test } from "node:test";
import assert from "node:assert/strict";
import { weatherBlock, freshnessNote, isUsable, WEATHER_MAX_AGE_MS } from "../src/lib/mjWeather.js";

const NOW = Date.parse("2026-09-15T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOURLY = {
  periods: [
    { temp: 78, shortForecast: "Sunny" },
    { temp: 80, shortForecast: "Sunny" },
    { temp: 81, shortForecast: "Partly cloudy" },
    { temp: 79, shortForecast: "Cloudy" },
  ],
  highLow: { high: 84, low: 61 },
};

test("an outdoor grow gets the forecast, headed by its own location", () => {
  const out = weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts: [], updatedAt: ago(5 * MIN), mode: "full", now: NOW });
  assert.match(out, /WEATHER AT THIS GROW \(Athens, OH\)/);
  assert.match(out, /high 84 F, low 61 F/);
  assert.match(out, /Right now: 78 F, Sunny/);
  assert.match(out, /Next 3h/);
});

test("nothing cached is silence, not a guess", () => {
  assert.equal(weatherBlock({ location: "Athens, OH", mode: "full", now: NOW }), "");
  assert.equal(weatherBlock({ location: "Athens, OH", hourly: null, alerts: [], updatedAt: ago(MIN), mode: "full", now: NOW }), "");
});

test("a grow set by GPS with no typed name still gets its weather, unheaded", () => {
  const out = weatherBlock({ hourly: HOURLY, alerts: [], updatedAt: ago(MIN), mode: "full", now: NOW });
  assert.match(out, /^WEATHER AT THIS GROW:/);
  assert.match(out, /78 F/);
});

test("an indoor space hears about severe weather and nothing else", () => {
  const alerts = [{ event: "Ice Storm Warning", headline: "Power outages likely" }];
  const out = weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts, updatedAt: ago(MIN), mode: "alerts", now: NOW });
  assert.match(out, /Ice Storm Warning/);
  assert.doesNotMatch(out, /high 84/);
  assert.doesNotMatch(out, /Right now/);
  assert.match(out, /reads its own instruments/);
});

test("an indoor space with nothing warned about gets no block", () => {
  assert.equal(weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts: [], updatedAt: ago(MIN), mode: "alerts", now: NOW }), "");
});

test("a stale forecast is dropped rather than stated as now", () => {
  const stale = ago(WEATHER_MAX_AGE_MS + MIN);
  assert.equal(weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts: [], updatedAt: stale, mode: "full", now: NOW }), "");
  // An alert still stands even when the forecast beside it went stale.
  const out = weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts: [{ event: "Frost Advisory" }], updatedAt: stale, mode: "full", now: NOW });
  assert.match(out, /Frost Advisory/);
  assert.doesNotMatch(out, /Right now/);
});

test("weather more than twenty minutes old says how old it is", () => {
  const out = weatherBlock({ location: "Athens, OH", hourly: HOURLY, alerts: [], updatedAt: ago(45 * MIN), mode: "full", now: NOW });
  assert.match(out, /Right now \(as of 45 minutes ago\)/);
});

test("freshnessNote is silent when the reading really is current", () => {
  assert.equal(freshnessNote(ago(2 * MIN), NOW), "");
  assert.equal(freshnessNote(ago(45 * MIN), NOW), "as of 45 minutes ago");
  assert.equal(freshnessNote(ago(3 * 60 * MIN), NOW), "as of 3 hours ago");
  assert.equal(freshnessNote("nonsense", NOW), "");
  assert.equal(freshnessNote(null, NOW), "");
});

test("isUsable rejects the missing, the ancient and the impossible", () => {
  assert.equal(isUsable(ago(MIN), NOW), true);
  assert.equal(isUsable(ago(WEATHER_MAX_AGE_MS + 1000), NOW), false);
  assert.equal(isUsable(null, NOW), false);
  assert.equal(isUsable("not a date", NOW), false);
  // A stamp from the future is a clock disagreeing, not fresh data.
  assert.equal(isUsable(new Date(NOW + 10 * MIN).toISOString(), NOW), false);
});

test("at most three alerts reach the prompt", () => {
  const many = Array.from({ length: 8 }, (_, i) => ({ event: `Alert ${i}` }));
  const out = weatherBlock({ location: "x", hourly: HOURLY, alerts: many, updatedAt: ago(MIN), mode: "full", now: NOW });
  assert.equal((out.match(/- Alert/g) ?? []).length, 3);
});

// ── The gate itself: which cache row a grow is allowed to read ──────────────
// This is the bug. The old query was `WHERE key LIKE 'weather:hourly:%' LIMIT 1`,
// so any grow got whichever row came back first, under a hard-coded heading.

import { buildWeatherContext } from "../worker/mj/context.js";

function fakeDb(rows) {
  const asked = [];
  return {
    asked,
    prepare(sql) {
      return {
        bind(...args) { this.key = args[0]; asked.push(args[0]); return this; },
        async first() {
          if (!/weather_cache/.test(sql)) return null;
          // A query with no key would be the old bug; there is no row for it.
          return rows[this.key] ?? null;
        },
        async all() { return { results: [] }; },
      };
    },
  };
}

// buildWeatherContext reads the real clock, so these rows are stamped against
// it rather than against the fixed NOW the pure tests use.
const justNow = () => new Date(Date.now() - MIN).toISOString();
const CACHE = {
  "weather:hourly:39.33,-82.1": { value: JSON.stringify(HOURLY), updated_at: justNow() },
  "weather:hourly:47.6,-122.3": { value: JSON.stringify({ periods: [{ temp: 51, shortForecast: "Rain" }], highLow: { high: 55, low: 48 } }), updated_at: justNow() },
};

test("a grow reads the cache row for its own coordinates and no other", async () => {
  const db = fakeDb(CACHE);
  const out = await buildWeatherContext({ DB: db }, { lat: 39.33, lon: -82.1, location: "Athens, OH", environment: "outdoor" });
  assert.match(out, /78 F/);
  assert.doesNotMatch(out, /51 F/, "must not read the other location's row");
  assert.ok(db.asked.every((k) => k.endsWith("39.33,-82.1")), db.asked.join(","));
});

test("a grow with no coordinates asks the cache nothing", async () => {
  const db = fakeDb(CACHE);
  assert.equal(await buildWeatherContext({ DB: db }, { location: "Somewhere", environment: "outdoor" }), "");
  assert.deepEqual(db.asked, [], "a grow with no location must not query at all");
});

test("an indoor grow queries its own row and reports only alerts", async () => {
  const db = fakeDb({
    ...CACHE,
    "weather:alerts:39.33,-82.1": { value: JSON.stringify([{ event: "Ice Storm Warning" }]), updated_at: justNow() },
  });
  const out = await buildWeatherContext({ DB: db }, { lat: 39.33, lon: -82.1, location: "Athens, OH", environment: "indoor" });
  assert.match(out, /Ice Storm Warning/);
  assert.doesNotMatch(out, /high 84/);
});

test("a space with no environment recorded is treated as outdoors", async () => {
  const out = await buildWeatherContext({ DB: fakeDb(CACHE) }, { lat: 39.33, lon: -82.1 });
  assert.match(out, /Right now: 78 F/);
});

test("a broken cache row degrades to silence, not a crash", async () => {
  const db = fakeDb({ "weather:hourly:39.33,-82.1": { value: "{not json", updated_at: justNow() } });
  assert.equal(await buildWeatherContext({ DB: db }, { lat: 39.33, lon: -82.1, environment: "outdoor" }), "");
});
