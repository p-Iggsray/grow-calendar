import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverMjLimit, MJ_DAILY_LIMIT } from "../worker/mj.js";

test("MJ_DAILY_LIMIT is 30", () => {
  assert.equal(MJ_DAILY_LIMIT, 30);
});

test("isOverMjLimit is true at or above the limit", () => {
  assert.equal(isOverMjLimit(0, 30), false);
  assert.equal(isOverMjLimit(29, 30), false);
  assert.equal(isOverMjLimit(30, 30), true);
  assert.equal(isOverMjLimit(31, 30), true);
});
