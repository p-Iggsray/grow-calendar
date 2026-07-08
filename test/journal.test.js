import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthIndex, journalPlantEntry, buildTimelineDays, makeExcerpt, escapeLike, attachWeather } from "../worker/journal.js";
import { journalStreak, dayOfGrow } from "../src/lib/journalStats.js";

// ── Month index ──────────────────────────────────────────────────────────────
test("buildMonthIndex: only FILLED grow-log days count as logged", () => {
  const logs = [
    { date: "2026-06-02", water_gal: 1.5 },                       // filled (numeric)
    { date: "2026-06-03", water_gal: null, feed: null },          // empty row
    { date: "2026-06-04", plant_health: '[{"plant":"A"}]' },      // filled (array)
  ];
  const days = buildMonthIndex(logs, [], []);
  assert.deepEqual(Object.keys(days).sort(), ["2026-06-02", "2026-06-04"]);
  assert.equal(days["2026-06-02"].log, true);
});

test("buildMonthIndex: merges notes and plant-entry counts onto the same day", () => {
  const days = buildMonthIndex(
    [{ date: "2026-06-10", feed: "1/2 dose" }],
    [{ date: "2026-06-10" }, { date: "2026-06-12" }],
    [{ date: "2026-06-10", n: 3 }, { date: "2026-06-15", n: 1 }],
  );
  assert.deepEqual(days["2026-06-10"], { log: true, note: true, plants: 3 });
  assert.deepEqual(days["2026-06-12"], { log: false, note: true, plants: 0 });
  assert.deepEqual(days["2026-06-15"], { log: false, note: false, plants: 1 });
});

test("buildMonthIndex: empty inputs produce an empty index", () => {
  assert.deepEqual(buildMonthIndex([], [], []), {});
  assert.deepEqual(buildMonthIndex(undefined, undefined, undefined), {});
});

// ── Plant entry shaping ──────────────────────────────────────────────────────
test("journalPlantEntry: parses detail JSON and resolves the plant name", () => {
  const e = journalPlantEntry(
    { id: 7, plant_id: "p1", date: "2026-06-10", kind: "watering", detail: '{"gal":1.5}', body: "", height: null, height_unit: null, health: null },
    { p1: "Blue Dream" },
  );
  assert.equal(e.plantName, "Blue Dream");
  assert.deepEqual(e.detail, { gal: 1.5 });
  assert.equal(e.kind, "watering");
});

test("journalPlantEntry: bad detail JSON and unknown plants degrade gracefully", () => {
  const e = journalPlantEntry(
    { id: 8, plant_id: "gone", date: "2026-06-10", kind: null, detail: "{broken", body: "hello" },
    {},
  );
  assert.equal(e.plantName, "Plant"); // deleted plant still shows its entries
  assert.equal(e.detail, null);
  assert.equal(e.kind, "note");       // legacy rows without a kind read as notes
  assert.equal(e.body, "hello");
});

// ── Timeline feed ────────────────────────────────────────────────────────────
test("buildTimelineDays: merges all three sources per day, newest first", () => {
  const days = buildTimelineDays(
    [
      { date: "2026-06-10", water_gal: 1.5, temp_high: 82, water_plants: '[{"plant":"A"},{"plant":"B"}]' },
      { date: "2026-06-08", water_gal: null }, // unfilled: dropped
    ],
    [{ date: "2026-06-12", body: "Topped the Blue Dream today." }, { date: "2026-06-10", body: "  " }],
    [{ date: "2026-06-10", n: 2, kinds: "watering,training" }],
  );
  assert.deepEqual(days.map(d => d.date), ["2026-06-12", "2026-06-10"]);
  assert.equal(days[0].noteExcerpt, "Topped the Blue Dream today.");
  assert.equal(days[0].log, null);
  assert.equal(days[1].log.water_gal, 1.5);
  assert.equal(days[1].log.waterings, 2);
  assert.equal(days[1].noteExcerpt, ""); // whitespace-only note ignored
  assert.deepEqual(days[1].plantKinds, ["watering", "training"]);
});

test("makeExcerpt: collapses whitespace and cuts on a word boundary", () => {
  assert.equal(makeExcerpt("  line one\n\nline two  "), "line one line two");
  const long = "word ".repeat(100);
  const out = makeExcerpt(long, 50);
  assert.ok(out.length <= 51); // 50 chars + ellipsis
  assert.ok(out.endsWith("…"));
  assert.ok(!out.includes("  "));
});

test("escapeLike: neutralizes LIKE wildcards in search text", () => {
  assert.equal(escapeLike("50%_a\\b"), "50\\%\\_a\\\\b");
});

test("attachWeather: folds cached weather onto matching timeline days only", () => {
  const days = [{ date: "2026-07-04" }, { date: "2026-07-03" }, { date: "2026-07-01" }];
  attachWeather(days, {
    "2026-07-04": { high: 91.1, low: 66.9, humidity: 62 },
    "2026-07-03": { high: null, low: null, humidity: null }, // nothing usable
  });
  assert.deepEqual(days[0].weather, { high: 91.1, low: 66.9, humidity: 62 });
  assert.equal(days[1].weather, undefined);
  assert.equal(days[2].weather, undefined);
  assert.doesNotThrow(() => attachWeather(null, null));
});

// ── Journal stats ────────────────────────────────────────────────────────────
const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

test("journalStreak: counts consecutive days back from today", () => {
  const today = D("2026-07-03");
  assert.equal(journalStreak(["2026-07-03", "2026-07-02", "2026-07-01", "2026-06-28"], today), 3);
});

test("journalStreak: today not yet journaled keeps yesterday's streak alive", () => {
  const today = D("2026-07-03");
  assert.equal(journalStreak(["2026-07-02", "2026-07-01"], today), 2);
  assert.equal(journalStreak(["2026-06-30"], today), 0); // gap of a day breaks it
  assert.equal(journalStreak([], today), 0);
});

test("dayOfGrow: day 1 is the grow's first day; before the grow returns null", () => {
  const config = { germinate: D("2026-06-01") };
  assert.equal(dayOfGrow(D("2026-06-01"), config), 1);
  assert.equal(dayOfGrow(D("2026-07-03"), config), 33);
  assert.equal(dayOfGrow(D("2026-05-20"), config), null);
  assert.equal(dayOfGrow(D("2026-07-03"), {}), null);
});
