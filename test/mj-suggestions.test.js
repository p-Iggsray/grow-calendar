import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestions } from "../src/lib/mjSuggestions.js";

const TODAY = new Date(2026, 5, 3); // June 3 2026

test("with remaining tasks, slot 1 mentions the count and 'today'", () => {
  const s = buildSuggestions({
    detail: { tasks: ["a", "b", "c"] }, checked: [0],
    threats: [], contextDate: null, today: TODAY,
  });
  assert.ok(s[0].includes("2 remaining tasks"), s[0]);
  assert.ok(s[0].includes("today"), s[0]);
});

test("with all tasks done, slot 1 shows 'checked off' prompt", () => {
  const s = buildSuggestions({
    detail: { tasks: ["a", "b"] }, checked: [0, 1],
    threats: [], contextDate: null, today: TODAY,
  });
  assert.ok(s[0].includes("checked off"), s[0]);
});

test("with no detail, slot 1 falls back to generic prompt", () => {
  const s = buildSuggestions({
    detail: null, checked: [], threats: [], contextDate: null, today: TODAY,
  });
  assert.ok(s[0].includes("today"), s[0]);
});

test("with active threats, slot 2 names the first threat", () => {
  const s = buildSuggestions({
    detail: null, checked: [],
    threats: [{ id: "heat", title: "Heat Stress", icon: "🌡", desc: "..." }],
    contextDate: null, today: TODAY,
  });
  assert.ok(s[1].includes("Heat Stress"), s[1]);
});

test("with no threats, slot 2 is week-ahead prompt", () => {
  const s = buildSuggestions({
    detail: null, checked: [], threats: [], contextDate: null, today: TODAY,
  });
  assert.ok(s[1].includes("this week"), s[1]);
});

test("for today, slot 3 is a note prompt", () => {
  const s = buildSuggestions({
    detail: null, checked: [], threats: [], contextDate: null, today: TODAY,
  });
  assert.ok(s[2].includes("Add a note"), s[2]);
});

test("for a non-today contextDate, uses the short date label and watering prompt", () => {
  const s = buildSuggestions({
    detail: { tasks: ["a"] }, checked: [],
    threats: [], contextDate: "2026-06-10", today: TODAY,
  });
  assert.ok(s[0].includes("Jun 10"), s[0]);
  assert.ok(s[2].includes("Jun 10"), s[2]);
  assert.ok(s[2].includes("watering"), s[2]);
});

test("always returns exactly 3 suggestions", () => {
  const s = buildSuggestions({
    detail: { tasks: ["a", "b", "c", "d"] }, checked: [0, 1],
    threats: [{ id: "t", title: "Rust Fungus", icon: "🍂", desc: "" }],
    contextDate: "2026-07-01", today: TODAY,
  });
  assert.equal(s.length, 3);
});
