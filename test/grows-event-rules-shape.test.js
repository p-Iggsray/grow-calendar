import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRawGrow } from "../worker/grows.js";

// Minimal fake D1 returning one grow row with an event_rules JSON column.
function fakeEnv(row) {
  return {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          first: async () => row,
          all: async () => ({ results: [] }),
        };
      },
    },
  };
}

test("loadRawGrow parses event_rules into an array", async () => {
  const rules = [{ id: "evt_1", task: "Spray", cadence: { type: "everyDay" }, window: { type: "phase", phases: ["veg_full"] }, createdAt: "2026-06-26T00:00:00.000Z" }];
  const env = fakeEnv({ id: "g1", config: null, survey: null, generated_plan: null, phase_overrides: null, event_rules: JSON.stringify(rules), display_name: "G", status: "active" });
  const raw = await loadRawGrow(env, 1, "g1");
  assert.deepEqual(raw.eventRules, rules);
});

test("loadRawGrow defaults event_rules to an empty array", async () => {
  const env = fakeEnv({ id: "g1", config: null, survey: null, generated_plan: null, phase_overrides: null, event_rules: null, display_name: "G", status: "active" });
  const raw = await loadRawGrow(env, 1, "g1");
  assert.deepEqual(raw.eventRules, []);
});
