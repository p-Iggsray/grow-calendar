import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeuristicPlan } from "../src/lib/heuristicPlan.js";

const PHASES = ["germination", "seedling", "pre", "transplant", "early_veg", "veg_cm",
  "veg_half", "veg_full", "flush", "pre_flower", "flower", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze"];

function allText(plan) {
  return Object.values(plan.phases)
    .flatMap(p => [p.title, p.summary, p.notes, ...p.tasks])
    .concat(plan.threats.flatMap(t => [t.title, t.desc]))
    .join(" ");
}

test("covers every phase getPhase can return, each with tasks", () => {
  const plan = buildHeuristicPlan({ environment: "indoor", medium: "soil" });
  for (const ph of PHASES) {
    assert.ok(plan.phases[ph], `missing phase ${ph}`);
    assert.ok(Array.isArray(plan.phases[ph].tasks) && plan.phases[ph].tasks.length > 0, `no tasks for ${ph}`);
  }
});

test("contains no em dashes or fancy special characters", () => {
  for (const env of ["indoor", "outdoor", "greenhouse"]) {
    const text = allText(buildHeuristicPlan({ environment: env, medium: "soil" }));
    const bad = text.match(/[‐-―‘’“”…°→←✦]/g);
    assert.equal(bad, null, `special chars in ${env}: ${bad}`);
  }
});

test("tasks differ by environment (light schedule) and by medium (watering)", () => {
  const indoor = allText(buildHeuristicPlan({ environment: "indoor", medium: "soil" }));
  const outdoor = allText(buildHeuristicPlan({ environment: "outdoor", medium: "soil" }));
  assert.ok(indoor.includes("18 hours on"), "indoor should mention a light schedule");
  assert.ok(outdoor.includes("direct sun"), "outdoor should mention sun");
  assert.notEqual(indoor, outdoor);

  const coco = allText(buildHeuristicPlan({ environment: "indoor", medium: "coco" }));
  const soil = allText(buildHeuristicPlan({ environment: "indoor", medium: "soil" }));
  assert.ok(coco.includes("Coco"), "coco watering guidance");
  assert.ok(soil.includes("top inch"), "soil watering guidance");
});

test("outdoor gets weather/frost threats; indoor gets heat/mildew", () => {
  const out = buildHeuristicPlan({ environment: "outdoor", medium: "soil" }).threats.map(t => t.id);
  const ind = buildHeuristicPlan({ environment: "indoor", medium: "soil" }).threats.map(t => t.id);
  assert.ok(out.includes("frost"));
  assert.ok(ind.includes("heat"));
});
