import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_DAILY_LIMIT } from "../worker/mj.js";

test("GEMINI_DAILY_LIMIT matches the documented Gemini Flash free-tier RPD", () => {
  assert.equal(GEMINI_DAILY_LIMIT, 1500);
});
