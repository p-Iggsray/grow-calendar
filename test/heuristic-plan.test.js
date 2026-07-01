import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeuristicPlan } from "../src/lib/heuristicPlan.js";
import { fillMissingConfigKeys } from "../worker/planSetup.js";

const PHASES = ["germination", "seedling", "pre", "transplant", "early_veg", "veg_cm",
  "veg_half", "veg_full", "flush", "pre_flower", "flower", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze"];

const BASE = {
  environment: "outdoor", medium: "soil", containerType: "fabric", containerGallons: 7,
  wateringMethod: "hand", experienceLevel: "intermediate",
  strains: [{ type: "hybrid", photo: true, flowerWeeks: 9 }],
};
function text(patch) {
  const p = buildHeuristicPlan({ ...BASE, ...patch });
  return Object.values(p.phases).flatMap(x => [x.title, x.summary, x.notes, ...x.tasks])
    .concat(p.threats.flatMap(t => [t.title, t.desc])).join(" | ");
}

test("covers every phase getPhase can return, each with tasks", () => {
  const plan = buildHeuristicPlan(BASE);
  for (const ph of PHASES) {
    assert.ok(plan.phases[ph], `missing phase ${ph}`);
    assert.ok(plan.phases[ph].tasks.length > 0, `no tasks for ${ph}`);
  }
});

test("no em dashes or fancy special characters in any combination", () => {
  const combos = [
    { environment: "indoor", medium: "hydro", experienceLevel: "advanced" },
    { environment: "greenhouse", medium: "coco", wateringMethod: "drip" },
    { containerType: "plastic", containerGallons: 15 },
    { strains: [{ type: "indica", photo: false, flowerWeeks: 8 }] },
  ];
  for (const patch of combos) {
    const bad = text(patch).match(/[‐-―‘’“”…°→←✦]/g);
    assert.equal(bad, null, `special chars for ${JSON.stringify(patch)}: ${bad}`);
  }
});

test("every survey dimension changes the plan text", () => {
  const base = text({});
  const changes = [
    ["env indoor", { environment: "indoor" }],
    ["env greenhouse", { environment: "greenhouse" }],
    ["medium coco", { medium: "coco" }],
    ["medium hydro", { medium: "hydro" }],
    ["container plastic", { containerType: "plastic" }],
    ["container ground", { containerType: "ground" }],
    ["pot small", { containerGallons: 1 }],
    ["pot large", { containerGallons: 15 }],
    ["watering drip", { wateringMethod: "drip" }],
    ["exp beginner", { experienceLevel: "beginner" }],
    ["exp advanced", { experienceLevel: "advanced" }],
    ["autoflower", { strains: [{ type: "hybrid", photo: false, flowerWeeks: 9 }] }],
    ["sativa", { strains: [{ type: "sativa", photo: true, flowerWeeks: 11 }] }],
    ["indica", { strains: [{ type: "indica", photo: true, flowerWeeks: 8 }] }],
  ];
  for (const [label, patch] of changes) {
    assert.notEqual(text(patch), base, `${label} did not change the plan`);
  }
});

test("key choices produce the expected guidance", () => {
  assert.match(text({ environment: "indoor" }), /18 hours on/);
  assert.match(text({ strains: [{ type: "hybrid", photo: false, flowerWeeks: 9 }] }), /Autos/);
  assert.match(text({ medium: "hydro" }), /reservoir/i);
  assert.match(text({ medium: "coco" }), /Coco/);
  assert.match(text({ containerType: "fabric" }), /Fabric pots/);
  assert.match(text({ wateringMethod: "drip" }), /dripper/);
});

// ── Timeline responds to choices ─────────────────────────────────────────────
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
function cfg(sv) {
  const c = { transplant: "2026-06-01" };
  fillMissingConfigKeys(c, { transplantDate: "2026-06-01", ...sv });
  return c;
}

test("indoor veg length drives pre-flower and harvest", () => {
  const v4 = cfg({ environment: "indoor", vegWeeks: 4, strains: [{ photo: true, flowerWeeks: 9 }] });
  const v8 = cfg({ environment: "indoor", vegWeeks: 8, strains: [{ photo: true, flowerWeeks: 9 }] });
  assert.equal(days("2026-06-01", v4.preFlower), 28);
  assert.equal(days("2026-06-01", v8.preFlower), 56);
  assert.ok(days("2026-06-01", v8.gdpHarvest) > days("2026-06-01", v4.gdpHarvest));
});

test("autoflower flips on age regardless of veg weeks", () => {
  const auto = cfg({ environment: "indoor", vegWeeks: 10, strains: [{ photo: false, flowerWeeks: 9 }] });
  assert.equal(days("2026-06-01", auto.preFlower), 28);
});

test("flower length sets harvest and strain type sets flush lead", () => {
  const sat = cfg({ environment: "indoor", vegWeeks: 5, strains: [{ type: "sativa", photo: true, flowerWeeks: 12 }] });
  const ind = cfg({ environment: "indoor", vegWeeks: 5, strains: [{ type: "indica", photo: true, flowerWeeks: 8 }] });
  assert.ok(days("2026-06-01", sat.gdpHarvest) > days("2026-06-01", ind.gdpHarvest));
  assert.equal(days(sat.gdpFlush, sat.gdpHarvest), 14); // sativa longer flush
  assert.equal(days(ind.gdpFlush, ind.gdpHarvest), 7);  // indica shorter flush
});

test("two strains with different flower times stagger the harvests", () => {
  const two = cfg({ environment: "indoor", vegWeeks: 5, strains: [
    { type: "indica", photo: true, flowerWeeks: 8 },
    { type: "sativa", photo: true, flowerWeeks: 12 },
  ] });
  assert.ok(days("2026-06-01", two.hazeHarvest) > days("2026-06-01", two.gdpHarvest));
});
