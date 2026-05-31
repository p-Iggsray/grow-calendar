import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

test("DEFAULT_CONFIG has all required date keys", () => {
  const required = [
    "start", "transplant", "calMag", "feedStart", "fullDose",
    "flush1", "flush2", "flush3", "backyardMove",
    "preFlower", "flowerStart",
    "gdpFlush", "gdpHarvest", "hazeFlush", "hazeHarvest",
  ];
  for (const key of required) {
    assert.ok(key in DEFAULT_CONFIG, `DEFAULT_CONFIG missing key: ${key}`);
    assert.match(DEFAULT_CONFIG[key], /^\d{4}-\d{2}-\d{2}$/, `${key} must be YYYY-MM-DD`);
  }
});
