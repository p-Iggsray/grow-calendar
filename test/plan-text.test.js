import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanText } from "../src/lib/planText.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

test("buildPlanText contains the key schedule dates and threats", () => {
  const text = buildPlanText(parseConfig(DEFAULT_CONFIG), {});
  // transplant, feeding start, the three flush days, GDP harvest, Haze harvest
  for (const iso of ["2026-05-24", "2026-06-21", "2026-06-24", "2026-07-24", "2026-08-24", "2026-09-27", "2026-10-18"]) {
    assert.ok(text.includes(iso), `expected ${iso} in plan text`);
  }
  assert.ok(text.includes("THREATS"), "expected a threats section");
});
