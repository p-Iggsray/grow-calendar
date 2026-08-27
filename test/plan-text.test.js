import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanText } from "../src/lib/planText.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

test("buildPlanText contains milestones and the key schedule dates", () => {
  const text = buildPlanText(parseConfig(DEFAULT_CONFIG));
  // transplant, feeding start, the three flush days, GDP harvest, Haze harvest
  for (const iso of ["2026-05-24", "2026-06-21", "2026-06-24", "2026-07-24", "2026-08-24", "2026-09-27", "2026-10-18"]) {
    assert.ok(text.includes(iso), `expected ${iso} in plan text`);
  }
  assert.ok(text.includes("KEY DATES"), "expected a key-dates section");
  assert.ok(text.includes("Transplant"), "expected the transplant milestone");
});

test("buildPlanText carries no task or threat content", () => {
  const text = buildPlanText(parseConfig(DEFAULT_CONFIG));
  assert.ok(!/THREATS/i.test(text), "threats section should be gone");
  assert.ok(!/task/i.test(text), "task language should be gone");
});
