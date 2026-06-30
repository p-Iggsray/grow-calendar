import { test } from "node:test";
import assert from "node:assert/strict";
import { getPhase } from "../src/lib/growdata/phase.js";
import { buildMilestones, getGrowProgress } from "../src/lib/growdata/milestones.js";
import { parseConfig } from "../src/lib/planConfig.js";
import { fillMissingConfigKeys } from "../worker/planSetup.js";
import { deriveTransplantDate, stageToStartType, resolveSurveyForSetup, STAGE_TO_TRANSPLANT_OFFSET } from "../src/lib/stageAnchor.js";

function buildConfig(survey, extra = {}) {
  const config = { transplant: survey.transplantDate, ...extra };
  fillMissingConfigKeys(config, survey);
  return parseConfig(config);
}
const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

// ── Anchor math ──────────────────────────────────────────────────────────────
test("deriveTransplantDate maps each stage to the right transplant offset", () => {
  assert.equal(deriveTransplantDate("germination", "2026-06-01"), "2026-06-20"); // +19
  assert.equal(deriveTransplantDate("seedling", "2026-06-01"), "2026-06-15");    // +14
  assert.equal(deriveTransplantDate("vegetative", "2026-06-01"), "2026-06-01");  // 0
  assert.equal(deriveTransplantDate("flowering", "2026-09-01"),
    new Date(2026, 8, 1 + STAGE_TO_TRANSPLANT_OFFSET.flowering).toISOString().slice(0, 10));
});

test("stageToStartType: germination/seedling are seed starts", () => {
  assert.equal(stageToStartType("germination"), "seed");
  assert.equal(stageToStartType("seedling"), "seed");
  assert.equal(stageToStartType("vegetative"), "veg");
  assert.equal(stageToStartType("flowering"), "veg");
});

test("resolveSurveyForSetup computes transplant + tags every plant with the stage", () => {
  const out = resolveSurveyForSetup({
    currentStage: "seedling", stageStartDate: "2026-06-01",
    strains: [{ name: "A" }, { name: "B" }],
  });
  assert.equal(out.transplantDate, "2026-06-15");
  assert.equal(out.startType, "seed");
  assert.ok(out.strains.every(s => s.stage === "seedling"));
});

// ── Calendar phases ──────────────────────────────────────────────────────────
test("a seed grow shows germination → seedling → pre → transplant", () => {
  const cfg = buildConfig({ transplantDate: "2026-06-20", startType: "seed" });
  assert.equal(getPhase(D("2026-06-03"), cfg), "germination"); // ~ -17
  assert.equal(getPhase(D("2026-06-10"), cfg), "seedling");    // ~ -10
  assert.equal(getPhase(D("2026-06-19"), cfg), "pre");
  assert.equal(getPhase(D("2026-06-20"), cfg), "transplant");
  assert.equal(getPhase(D("2026-05-20"), cfg), null);          // before germination
  assert.ok(buildMilestones(cfg).some(m => m.label === "Germination"));
});

test("a clone grow has NO germination/seedling window (collapsed)", () => {
  const cfg = buildConfig({ transplantDate: "2026-06-20", startType: "clone" });
  assert.equal(getPhase(D("2026-06-10"), cfg), null); // nothing before pre/transplant
  assert.equal(getPhase(D("2026-06-19"), cfg), "pre");
  assert.ok(!buildMilestones(cfg).some(m => m.label === "Germination"));
});

test("back-compat: a config without the new keys behaves like before", () => {
  const raw = { transplant: "2026-06-20", startType: "clone" };
  fillMissingConfigKeys(raw, { startType: "clone" });
  // Simulate an OLD stored config that never had germinate/seedlingStart.
  delete raw.germinate; delete raw.seedlingStart;
  const cfg = parseConfig(raw);
  assert.equal(getPhase(D("2026-06-19"), cfg), "pre");
  assert.equal(getPhase(D("2026-06-10"), cfg), null);
  assert.equal(typeof getGrowProgress(D("2026-07-01"), cfg), "number");
});
