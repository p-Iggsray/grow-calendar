import { test } from "node:test";
import assert from "node:assert/strict";
import { bumpUserUsage, dailyRequestBudget } from "../worker/mj/usage.js";
import { PER_USER_DAILY_REQUESTS, ADMIN_DAILY_REQUESTS } from "../worker/limits.js";

// A turn reserves one request before calling Google and corrects the figure
// afterwards to whatever it really cost. The correction is the part that can
// leak budget, so it is the part worth testing.
function ledger(start = 0) {
  const state = { count: start };
  return {
    state,
    DB: {
      prepare(sql) {
        return {
          bind(...a) { this.a = a; return this; },
          async first() {
            if (/INSERT INTO mj_usage/.test(sql)) {
              const delta = this.a[3];
              state.count = Math.max(0, state.count + delta);
              return { count: state.count };
            }
            return { count: state.count };
          },
          async run() { return {}; },
        };
      },
    },
  };
}

test("a one-request turn costs exactly one", async () => {
  const env = ledger();
  await bumpUserUsage(env, 1, "2026-09-15", 1);   // reserve
  await bumpUserUsage(env, 1, "2026-09-15", 0);   // 1 request made, 1 - 1 = 0
  assert.equal(env.state.count, 1);
});

test("a six-request turn costs six, not one", async () => {
  const env = ledger();
  await bumpUserUsage(env, 1, "2026-09-15", 1);
  await bumpUserUsage(env, 1, "2026-09-15", 6 - 1);
  assert.equal(env.state.count, 6);
});

test("a turn that never reached Google gives its reservation back", async () => {
  const env = ledger(4);
  await bumpUserUsage(env, 1, "2026-09-15", 1);
  assert.equal(env.state.count, 5);
  await bumpUserUsage(env, 1, "2026-09-15", 0 - 1);
  assert.equal(env.state.count, 4, "the reservation must be released, not kept");
});

test("a turn that failed on its third request is charged three", async () => {
  const env = ledger();
  await bumpUserUsage(env, 1, "2026-09-15", 1);
  await bumpUserUsage(env, 1, "2026-09-15", 3 - 1);
  assert.equal(env.state.count, 3, "requests that reached Google count even when the turn failed");
});

test("the count can never go negative", async () => {
  const env = ledger(0);
  await bumpUserUsage(env, 1, "2026-09-15", -5);
  assert.equal(env.state.count, 0);
});

test("a zero delta reads the count without moving it", async () => {
  const env = ledger(7);
  const n = await bumpUserUsage(env, 1, "2026-09-15", 0);
  assert.equal(n, 7);
  assert.equal(env.state.count, 7);
});

test("the owner gets a bigger budget than everyone else", () => {
  assert.equal(dailyRequestBudget({ role: "admin" }), ADMIN_DAILY_REQUESTS);
  assert.equal(dailyRequestBudget({ role: "member" }), PER_USER_DAILY_REQUESTS);
  assert.equal(dailyRequestBudget(null), PER_USER_DAILY_REQUESTS);
  assert.equal(dailyRequestBudget({}), PER_USER_DAILY_REQUESTS);
});

test("ten turns of average weight stay inside an ordinary budget", async () => {
  const env = ledger();
  for (let i = 0; i < 10; i++) {
    await bumpUserUsage(env, 1, "2026-09-15", 1);
    await bumpUserUsage(env, 1, "2026-09-15", 3 - 1);
  }
  assert.equal(env.state.count, 30);
  assert.ok(env.state.count < PER_USER_DAILY_REQUESTS);
});
