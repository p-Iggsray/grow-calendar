import { test } from "node:test";
import assert from "node:assert/strict";
import { FAMILY_ORDER, phaseFamily, familyPhases } from "../src/lib/growdata/phases.js";
import { getDetail } from "../src/lib/growdata/detail.js";
import { parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig({
  start: "2026-05-21", transplant: "2026-05-24", calMag: "2026-06-07", feedStart: "2026-06-21",
  fullDose: "2026-07-05", flush1: "2026-06-24", flush2: "2026-07-24", flush3: "2026-08-24",
  backyardMove: "2026-07-28", preFlower: "2026-08-01", flowerStart: "2026-08-15",
  gdpFlush: "2026-09-20", gdpHarvest: "2026-09-27", hazeFlush: "2026-10-04", hazeHarvest: "2026-10-18",
});
const vegDay = new Date(2026, 5, 15); // mid-veg

// ── Phase families ───────────────────────────────────────────────────────────
test("every granular phase maps to exactly one family", () => {
  const all = ["pre", "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
    "pre_flower", "flower", "flower_haze", "flush", "flush_gdp", "flush_haze",
    "harvest_gdp", "harvest_haze"];
  for (const p of all) assert.ok(phaseFamily(p), `no family for ${p}`);
  assert.equal(phaseFamily("flower").key, "flower");
  assert.equal(phaseFamily("veg_half").key, "veg");
  assert.equal(phaseFamily("flush_gdp").key, "flush");
});

test("familyPhases unions consecutive families and clamps at the end", () => {
  assert.deepEqual(familyPhases("veg", 1), ["early_veg", "veg_cm", "veg_half", "veg_full"]);
  assert.ok(familyPhases("veg", 2).includes("flower"));      // veg + flower
  assert.ok(familyPhases("veg", 2).includes("early_veg"));
  assert.equal(familyPhases("harvest", 5).length, 2);         // clamps to harvest only
  assert.deepEqual(familyPhases("bogus", 3), []);
  assert.equal(FAMILY_ORDER.length, 5);
});

// ── Manual task mode (getDetail) ─────────────────────────────────────────────
test("manual grows show NO hardcoded tasks", () => {
  const d = getDetail(vegDay, config, {}, { manual: true }, {}, []);
  assert.deepEqual(d.tasks, []);
  assert.ok(d.title); // still has a phase label
});

test("manual grows show user phase-span tasks via event rules", () => {
  const rules = [{
    id: "r1", task: "Check soil moisture",
    window: { type: "phase", phases: familyPhases("veg", 1) },
    cadence: { type: "everyDay" },
  }];
  const onVeg = getDetail(vegDay, config, {}, { manual: true }, {}, rules);
  assert.deepEqual(onVeg.tasks, ["Check soil moisture"]);
  // Outside the veg span (a flower day) the task should not appear.
  const flowerDay = new Date(2026, 8, 1); // September, flowering
  const onFlower = getDetail(flowerDay, config, {}, { manual: true }, {}, rules);
  assert.ok(!onFlower.tasks.includes("Check soil moisture"));
});

test("non-manual grows still get the built-in fallback tasks", () => {
  const d = getDetail(vegDay, config, {}, null, {}, []);
  assert.ok(d.tasks.length > 0, "expected hardcoded fallback tasks");
});

test("manual + day override still layers on", () => {
  const overrides = { "2026-06-15": { addedTasks: ["Extra: top dress"] } };
  const d = getDetail(vegDay, config, overrides, { manual: true }, {}, []);
  assert.deepEqual(d.tasks, ["Extra: top dress"]);
});
