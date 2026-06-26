import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEventRule } from "../worker/eventRulesValidate.js";

function valid(extra) {
  return { id: "evt_1", label: "Neem", task: "Spray neem", enabled: true, createdAt: "2026-06-26T00:00:00.000Z",
    window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" }, ...extra };
}

test("a well-formed range/everyDay rule is valid", () => {
  assert.equal(validateEventRule(valid()), null);
});

test("missing task is rejected", () => {
  assert.match(validateEventRule(valid({ task: "" })), /task/);
});

test("over-long task is rejected", () => {
  assert.match(validateEventRule(valid({ task: "x".repeat(201) })), /task/);
});

test("unknown window type is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "bogus" } })), /window/);
});

test("unknown milestone anchor is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "milestone", anchor: "nope", offsetStart: 0, offsetEnd: 1 } })), /anchor/);
});

test("invalid phase in phase window is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "phase", phases: ["not_a_phase"] } })), /phase/);
});

test("everyNDays with non-positive n is rejected", () => {
  assert.match(validateEventRule(valid({ cadence: { type: "everyNDays", n: 0 } })), /n/);
});

test("dates cadence needs no window", () => {
  assert.equal(validateEventRule({ task: "Spray", cadence: { type: "dates", dates: ["2026-06-30"] } }), null);
});

test("bad weekday key is rejected", () => {
  assert.match(validateEventRule(valid({ cadence: { type: "weekdays", days: ["funday"] } })), /days/);
});
