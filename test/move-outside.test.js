import { test } from "node:test";
import assert from "node:assert/strict";
import { fillMissingConfigKeys } from "../worker/planSetup.js";
import { parseConfig } from "../src/lib/planConfig.js";
import { buildMilestones } from "../src/lib/growData.js";

function configFor(survey, extra = {}) {
  const config = { transplant: "2026-05-24", ...extra };
  fillMissingConfigKeys(config, survey);
  return config;
}

function milestoneLabels(config) {
  return buildMilestones(parseConfig(config)).map(m => m.label);
}

test("outdoor grow with plants already in final spot has no move-outside step", () => {
  const config = configFor({ environment: "outdoor", plantsAlreadyOutside: true });
  assert.equal(config.backyardMove, config.transplant);
  assert.ok(!milestoneLabels(config).includes("Move Outside"));
});

test("outdoor grow that will move plants out later keeps the move-outside step", () => {
  const config = configFor({ environment: "outdoor", plantsAlreadyOutside: false });
  assert.ok(config.backyardMove > config.transplant, "move date should be after transplant");
  assert.ok(milestoneLabels(config).includes("Move Outside"));
});

test("indoor grow never gets a move-outside step", () => {
  const config = configFor({ environment: "indoor" });
  assert.equal(config.backyardMove, config.transplant);
  assert.ok(!milestoneLabels(config).includes("Move Outside"));
});

test("plants-already-outside overrides a stray AI move date", () => {
  // Even if the AI invents a future backyardMove, an already-placed grow collapses it.
  const config = configFor(
    { environment: "outdoor", plantsAlreadyOutside: true },
    { backyardMove: "2026-07-28" },
  );
  assert.equal(config.backyardMove, config.transplant);
  assert.ok(!milestoneLabels(config).includes("Move Outside"));
});
