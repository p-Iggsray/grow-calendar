import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeedConfigJson } from "../worker/plan.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

test("buildSeedConfigJson serializes DEFAULT_CONFIG verbatim", () => {
  const json = buildSeedConfigJson();
  assert.deepEqual(JSON.parse(json), DEFAULT_CONFIG);
});
