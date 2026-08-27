import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSuggestions } from "../src/lib/mjSuggestions.js";

const TODAY = new Date(2026, 5, 3); // June 3 2026

test("always returns exactly three suggestions", () => {
  const s = buildSuggestions({ contextDate: null, today: TODAY, phaseLabel: "Early Veg" });
  assert.equal(s.length, 3);
  for (const x of s) assert.equal(typeof x, "string");
});

test("slot 1 is phase-aware when a phase label exists", () => {
  const s = buildSuggestions({ contextDate: null, today: TODAY, phaseLabel: "Early Veg" });
  assert.ok(s[0].includes("early veg"), s[0]);
});

test("slot 1 falls back to a generic check-in off season", () => {
  const s = buildSuggestions({ contextDate: null, today: TODAY, phaseLabel: null });
  assert.ok(s[0].includes("How is my grow"), s[0]);
});

test("viewing today offers a journal summary; a past day asks about that day", () => {
  const today = buildSuggestions({ contextDate: "2026-06-03", today: TODAY, phaseLabel: null });
  assert.ok(today[2].includes("Summarize"), today[2]);

  const past = buildSuggestions({ contextDate: "2026-05-12", today: TODAY, phaseLabel: null });
  assert.ok(past[2].includes("May 12"), past[2]);
});

test("no task or threat language appears in any slot", () => {
  const s = buildSuggestions({ contextDate: "2026-05-12", today: TODAY, phaseLabel: "Flower" });
  for (const x of s) {
    assert.ok(!/task/i.test(x), x);
    assert.ok(!/threat/i.test(x), x);
  }
});
