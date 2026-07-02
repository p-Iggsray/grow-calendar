import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMonthIndex, journalPlantEntry } from "../worker/journal.js";

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
