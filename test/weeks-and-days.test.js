import { test } from "node:test";
import assert from "node:assert/strict";
import { weeksAndDays } from "../src/lib/dates-core.js";

// How long a phase has been running, said the way a grower counts it.

test("under a week is just days", () => {
  assert.equal(weeksAndDays(0), "0 days");
  assert.equal(weeksAndDays(1), "1 day");
  assert.equal(weeksAndDays(6), "6 days");
});

test("a whole number of weeks does not trail a zero", () => {
  assert.equal(weeksAndDays(7), "1 week");
  assert.equal(weeksAndDays(14), "2 weeks");
  assert.equal(weeksAndDays(63), "9 weeks");
});

test("weeks and days read together", () => {
  assert.equal(weeksAndDays(8), "1 week and 1 day");
  assert.equal(weeksAndDays(9), "1 week and 2 days");
  assert.equal(weeksAndDays(24), "3 weeks and 3 days");
});

test("a long cure still reads sensibly", () => {
  assert.equal(weeksAndDays(90), "12 weeks and 6 days");
});

test("junk and negatives give nothing rather than nonsense", () => {
  assert.equal(weeksAndDays(-1), "");
  assert.equal(weeksAndDays(null), "");
  assert.equal(weeksAndDays(undefined), "");
  assert.equal(weeksAndDays("nope"), "");
});

test("a numeric string is still a number of days", () => {
  assert.equal(weeksAndDays("24"), "3 weeks and 3 days");
});
