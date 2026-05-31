import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, PER_USER_DAILY_CAP, GEMINI_PRO_MODEL } from "../worker/mj.js";

test("GEMINI_DAILY_LIMIT matches the documented Gemini Flash free-tier RPD", () => {
  assert.equal(GEMINI_DAILY_LIMIT, 1500);
});

test("PER_USER_DAILY_CAP is a positive integer below the global daily limit", () => {
  assert.ok(Number.isInteger(PER_USER_DAILY_CAP));
  assert.ok(PER_USER_DAILY_CAP > 0);
  assert.ok(PER_USER_DAILY_CAP < GEMINI_DAILY_LIMIT);
});

test("GEMINI_PRO_DAILY_LIMIT is a positive integer well below the flash limit", () => {
  assert.ok(Number.isInteger(GEMINI_PRO_DAILY_LIMIT));
  assert.ok(GEMINI_PRO_DAILY_LIMIT > 0);
  assert.ok(GEMINI_PRO_DAILY_LIMIT < GEMINI_DAILY_LIMIT);
});

test("GEMINI_PRO_MODEL is a non-empty string distinct from the flash model", () => {
  assert.ok(typeof GEMINI_PRO_MODEL === "string" && GEMINI_PRO_MODEL.length > 0);
  assert.ok(GEMINI_PRO_MODEL.includes("pro"), "expected model name to contain 'pro'");
});
