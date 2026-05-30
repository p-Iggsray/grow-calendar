import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_DAILY_LIMIT, PER_USER_DAILY_CAP } from "../worker/mj.js";

test("GEMINI_DAILY_LIMIT matches the documented Gemini Flash free-tier RPD", () => {
  assert.equal(GEMINI_DAILY_LIMIT, 1500);
});

test("PER_USER_DAILY_CAP is a positive integer below the global daily limit", () => {
  assert.ok(Number.isInteger(PER_USER_DAILY_CAP));
  assert.ok(PER_USER_DAILY_CAP > 0);
  assert.ok(PER_USER_DAILY_CAP < GEMINI_DAILY_LIMIT);
});
