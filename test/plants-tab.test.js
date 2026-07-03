import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtDateKey, daysAgo, relDayLabel, plantHistoryStats } from "../src/components/PlantsTab/constants.js";

const D = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };

test("fmtDateKey: friendly short date, tolerant of junk", () => {
  assert.equal(fmtDateKey("2026-06-10"), "Jun 10");
  assert.equal(fmtDateKey("2026-12-01"), "Dec 1");
  assert.equal(fmtDateKey("junk"), "junk");
  assert.equal(fmtDateKey(""), "");
});

test("daysAgo / relDayLabel: relative day math", () => {
  const today = D("2026-07-03");
  assert.equal(daysAgo("2026-07-03", today), 0);
  assert.equal(daysAgo("2026-07-01", today), 2);
  assert.equal(relDayLabel("2026-07-03", today), "today");
  assert.equal(relDayLabel("2026-07-02", today), "yesterday");
  assert.equal(relDayLabel("2026-06-28", today), "5d ago");
  assert.equal(relDayLabel("2026-07-05", today), "in 2d");
  assert.equal(relDayLabel("junk", today), "");
});

test("plantHistoryStats: stage days, height trend, and latest health", () => {
  const today = D("2026-07-03");
  const entries = [
    { date: "2026-07-02", kind: "measurement", height: 24, height_unit: "in" },
    { date: "2026-07-01", kind: "health", health: "thriving" },
    { date: "2026-06-28", kind: "stage", body: "Stage" },
    { date: "2026-06-25", kind: "measurement", height: 21.5, height_unit: "in" },
    { date: "2026-06-20", kind: "health", health: "stressed" },
  ];
  const s = plantHistoryStats(entries, today);
  assert.equal(s.stageDays, 5);            // stage change 5 days ago
  assert.equal(s.height.height, 24);       // latest measurement
  assert.equal(s.heightDelta, 2.5);        // growth since the previous one
  assert.equal(s.lastHealth, "thriving");  // newest health wins
});

test("plantHistoryStats: empty history degrades to nulls", () => {
  const s = plantHistoryStats([], D("2026-07-03"));
  assert.equal(s.stageDays, null);
  assert.equal(s.height, null);
  assert.equal(s.heightDelta, null);
  assert.equal(s.lastHealth, null);
});
