import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG);
function day() { return new Date(2026, 5, 12); } // 2026-06-12, stable early-veg day
const DAY = "2026-06-12";

const rules = [{
  id: "evt_1", label: "Neem", task: "Spray neem to runoff", enabled: true,
  createdAt: "2026-06-26T00:00:00.000Z",
  window: { type: "range", from: "2026-06-01", to: "2026-06-30" },
  cadence: { type: "everyDay" },
}];

test("occurrence is appended after the generated tasks", () => {
  const base = getDetail(day(), config, {}, null, {});
  const withRule = getDetail(day(), config, {}, null, {}, rules);
  assert.equal(withRule.tasks.length, base.tasks.length + 1);
  assert.equal(withRule.tasks.at(-1), "Spray neem to runoff");
});

test("a day removedTasks override can skip a single occurrence by index", () => {
  const withRule = getDetail(day(), config, {}, null, {}, rules);
  const occIndex = withRule.tasks.length - 1;
  const skipped = getDetail(day(), config, { [DAY]: { removedTasks: [occIndex] } }, null, {}, rules);
  assert.equal(skipped.tasks.length, withRule.tasks.length - 1);
  assert.ok(!skipped.tasks.includes("Spray neem to runoff"));
});

test("omitting eventRules leaves the day unchanged (backward compatible)", () => {
  const base = getDetail(day(), config, {});
  const same = getDetail(day(), config, {}, null, {});
  assert.deepEqual(same, base);
});
