import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

test("parseConfig produces local Date objects matching the legacy D values", () => {
  const cfg = parseConfig(DEFAULT_CONFIG);
  assert.deepEqual(cfg.start, new Date(2026, 4, 21));
  assert.deepEqual(cfg.transplant, new Date(2026, 4, 24));
  assert.deepEqual(cfg.feedStart, new Date(2026, 5, 21));
  assert.deepEqual(cfg.backyardMove, new Date(2026, 6, 28));
  assert.deepEqual(cfg.hazeHarvest, new Date(2026, 9, 18));
});

test("DEFAULT_CONFIG keys are ISO date strings", () => {
  for (const v of Object.values(DEFAULT_CONFIG)) {
    assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
  }
});
