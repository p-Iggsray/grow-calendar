import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionPlants, latestMetrics } from "../src/components/PlantsTab/constants.js";

test("partitionPlants splits growing vs archived", () => {
  const survey = { strains: [
    { id: "a", status: "growing" }, { id: "b", status: "harvested" },
    { id: "c", status: "dead" }, { id: "d" },
  ] };
  const { active, archived } = partitionPlants(survey);
  assert.deepEqual(active.map((p) => p.id), ["a", "d"]);
  assert.deepEqual(archived.map((p) => p.id), ["b", "c"]);
});

test("partitionPlants tolerates a null survey", () => {
  const { active, archived } = partitionPlants(null);
  assert.deepEqual(active, []);
  assert.deepEqual(archived, []);
});

test("latestMetrics picks newest height + health from date-desc entries", () => {
  const entries = [
    { date: "2026-06-17", height: null, height_unit: null, health: "stressed" },
    { date: "2026-06-10", height: 30, height_unit: "in", health: "healthy" },
  ];
  const m = latestMetrics(entries);
  assert.equal(m.lastDate, "2026-06-17");
  assert.equal(m.health, "stressed");
  assert.equal(m.height, 30);
  assert.equal(m.heightUnit, "in");
});

test("latestMetrics returns nulls for empty input", () => {
  assert.deepEqual(latestMetrics([]), { height: null, heightUnit: null, health: null, lastDate: null });
});
