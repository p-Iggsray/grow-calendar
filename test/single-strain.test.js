import { test } from "node:test";
import assert from "node:assert/strict";
import { getPhase, buildMilestones } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

// Single-strain grows set the secondary-strain dates equal to the primary's
// (see fillMissingConfigKeys). Two-strain grows finish the secondary later.
const SINGLE = parseConfig({
  ...DEFAULT_CONFIG,
  hazeFlush: DEFAULT_CONFIG.gdpFlush,
  hazeHarvest: DEFAULT_CONFIG.gdpHarvest,
});
const TWO = parseConfig(DEFAULT_CONFIG);

function collectPhases(config) {
  const phases = new Set();
  for (let t = config.start.getTime(); t <= config.hazeHarvest.getTime(); t += 86400000) {
    const p = getPhase(new Date(t), config);
    if (p) phases.add(p);
  }
  return phases;
}

const SECONDARY_PHASES = ["flower_haze", "flush_haze", "harvest_haze"];

test("single-strain grow never emits secondary-strain phases", () => {
  const phases = collectPhases(SINGLE);
  for (const p of SECONDARY_PHASES) {
    assert.ok(!phases.has(p), `single-strain should not emit ${p}`);
  }
  // The primary flush + harvest must still appear (not shadowed by haze phases).
  assert.ok(phases.has("flush_gdp"), "single-strain should still show the primary flush");
  assert.ok(phases.has("harvest_gdp"), "single-strain should still show the primary harvest");
});

test("single-strain milestones omit the duplicate second harvest", () => {
  const labels = buildMilestones(SINGLE).map(m => m.label);
  assert.ok(!labels.includes("Final Harvest"), "no phantom second harvest milestone");
  assert.ok(labels.includes("Primary Harvest"), "primary harvest milestone present");
});

test("two-strain grow still emits secondary-strain phases and the second harvest", () => {
  const phases = collectPhases(TWO);
  for (const p of SECONDARY_PHASES) {
    assert.ok(phases.has(p), `two-strain should emit ${p}`);
  }
  assert.ok(
    buildMilestones(TWO).map(m => m.label).includes("Final Harvest"),
    "two-strain keeps the final harvest milestone",
  );
});
