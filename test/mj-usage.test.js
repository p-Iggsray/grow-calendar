import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GEMINI_DAILY_LIMIT, GEMINI_RPM_LIMIT, GEMINI_PRO_DAILY_LIMIT, GEMINI_PRO_MODEL,
  PER_USER_DAILY_REQUESTS, ADMIN_DAILY_REQUESTS, RESERVED_FOR_OTHERS,
} from "../worker/mj.js";
import { MAX_TOOL_ITERATIONS } from "../worker/mj/constants.js";

test("GEMINI_DAILY_LIMIT matches this project's real free-tier quota", () => {
  // Read off the Cloud Console quotas page for this project, not from
  // documentation: published free-tier figures disagree with each other. It
  // was 1500 here for a long time, which was six times the truth.
  assert.equal(GEMINI_DAILY_LIMIT, 250);
  assert.equal(GEMINI_RPM_LIMIT, 10);
});

test("no single grower can spend most of the day", () => {
  for (const n of [PER_USER_DAILY_REQUESTS, ADMIN_DAILY_REQUESTS]) {
    assert.ok(Number.isInteger(n) && n > 0);
    assert.ok(n < GEMINI_DAILY_LIMIT, `${n} is not a cap against ${GEMINI_DAILY_LIMIT}`);
  }
  // The owner gets more headroom than anyone else, and still not all of it.
  assert.ok(ADMIN_DAILY_REQUESTS > PER_USER_DAILY_REQUESTS);
  assert.ok(PER_USER_DAILY_REQUESTS <= GEMINI_DAILY_LIMIT / 3,
    "one ordinary user should not be able to take a third of the day");
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

test("an admin cannot spend the requests held back for everyone else", () => {
  assert.ok(RESERVED_FOR_OTHERS > 0);
  assert.ok(ADMIN_DAILY_REQUESTS <= GEMINI_DAILY_LIMIT - RESERVED_FOR_OTHERS,
    "the owner's budget must fit inside what is left after the reserve");
  // And the reserve has to be worth having: enough for at least one real
  // conversation by somebody else.
  assert.ok(RESERVED_FOR_OTHERS >= MAX_TOOL_ITERATIONS * 2);
});

test("a whole turn fits inside the per-minute allowance with room to spare", () => {
  assert.ok(MAX_TOOL_ITERATIONS < GEMINI_RPM_LIMIT,
    "one question must not be able to consume a whole minute's requests");
  assert.ok(GEMINI_RPM_LIMIT - MAX_TOOL_ITERATIONS >= 4,
    "leave headroom so a deep question does not stall the next one");
});

test("the day divides into a sensible number of conversations", () => {
  // A typical question is about three requests. If this ever implies fewer
  // than fifty conversations a day, the ceiling has moved and MJ is starving.
  assert.ok(GEMINI_DAILY_LIMIT / 3 >= 50);
});
