import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatsContext } from "../worker/mj/context.js";

// MJ's persona forbids converting the grower's own measure. The season total
// is STORED in gallons whatever it was poured in, so reading it straight out
// told a litre grower about gallons, which is the one thing she is told never
// to do.
function env({ totalWater, logDays, feedDays, waterRows }) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return /SUM\(water_gal\)/.test(sql)
              ? { total_water: totalWater, log_days: logDays, feed_days: feedDays }
              : null;
          },
          async all() {
            return { results: (waterRows ?? []).map((r) => ({ water_plants: JSON.stringify(r) })) };
          },
        };
      },
    },
  };
}

test("a grow logged in litres hears its total in litres", async () => {
  // 3 L into each of three plants on one day is 9 L, stored as 2.3775 gal.
  const out = await buildStatsContext(env({
    totalWater: 2.3775, logDays: 1, feedDays: 0,
    waterRows: [[{ plant: "A", amount: 3, unit: "l", gal: 0.7925 }]],
  }), 1, "g1");
  assert.match(out, /Total water logged: 9 L/);
  assert.doesNotMatch(out, /gal/);
});

test("a grow logged in gallons still hears gallons", async () => {
  const out = await buildStatsContext(env({
    totalWater: 12.5, logDays: 6, feedDays: 2,
    waterRows: [[{ plant: "A", amount: 2.5, unit: "gal", gal: 2.5 }]],
  }), 1, "g1");
  assert.match(out, /Total water logged: 12.5 gal over 6 days/);
  assert.match(out, /Feed days recorded: 2/);
});

test("mixed units read out in the coarsest one actually used", async () => {
  const out = await buildStatsContext(env({
    totalWater: 1.1321, logDays: 2, feedDays: 0,
    waterRows: [
      [{ plant: "A", amount: 500, unit: "ml", gal: 0.1321 }],
      [{ plant: "A", amount: 1, unit: "gal", gal: 1 }],
    ],
  }), 1, "g1");
  assert.match(out, /Total water logged: 1.13 gal/);
});

test("a grow that has never logged water is not told it poured zero gallons", async () => {
  const out = await buildStatsContext(env({ totalWater: 0, logDays: 4, feedDays: 1, waterRows: [] }), 1, "g1");
  assert.doesNotMatch(out, /gal/);
  assert.match(out, /Days with a log entry: 4/);
  assert.match(out, /Feed days recorded: 1/);
});

test("a database that throws costs MJ the block, not the reply", async () => {
  const boom = { DB: { prepare() { throw new Error("no such table"); } } };
  assert.equal(await buildStatsContext(boom, 1, "g1"), "");
});
