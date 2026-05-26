import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const golden = JSON.parse(
  readFileSync(new URL("./golden-plan.json", import.meta.url), "utf8"),
);

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

test("refactored generator with default config matches the golden snapshot", () => {
  const config = parseConfig(DEFAULT_CONFIG);
  const regenerated = golden.map(({ date }) => {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date, phase: getPhase(dt, config), detail: getDetail(dt, config, {}) };
  });

  // Empty overrides make getDetail return the generated base unchanged (early
  // return in applyDayOverride), so no extra keys are introduced on either side.
  for (let i = 0; i < golden.length; i++) {
    assert.deepEqual(
      regenerated[i],
      JSON.parse(JSON.stringify(golden[i])),
      `mismatch on ${golden[i].date}`,
    );
  }
  assert.equal(regenerated.length, golden.length);
});
