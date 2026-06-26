import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../worker/mj/tools.js";

// Fake D1 backed by a mutable store. Uses a closure variable for bind args
// so the arrow-function run() can access them without a `this` binding issue.
function fakeEnv(store) {
  return {
    DB: {
      prepare(sql) {
        let _args;
        return {
          _sql: sql,
          bind(...args) { _args = args; return this; },
          first: async () => (/event_rules/.test(sql) || /SELECT \* FROM grows/.test(sql)) ? { event_rules: store.value } : null,
          run: async () => {
            if (/UPDATE grows SET event_rules/.test(sql)) store.value = _args[0];
            return { meta: { changes: 1 } };
          },
          all: async () => ({ results: [] }),
        };
      },
    },
  };
}

const baseArgs = (env) => ["create_event_rule",
  { label: "Neem", task: "Spray neem", window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" } },
  env, 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []];

test("create_event_rule validates and stores a rule", async () => {
  const store = { value: null };
  const res = await executeTool(...baseArgs(fakeEnv(store)));
  assert.ok(res.rule);
  assert.match(res.rule.id, /^evt_/);
  assert.equal(JSON.parse(store.value).length, 1);
});

test("create_event_rule rejects an invalid rule", async () => {
  const store = { value: null };
  const res = await executeTool("create_event_rule", { task: "" }, fakeEnv(store), 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []);
  assert.ok(res.error);
});

test("delete_event_rule removes by id", async () => {
  const store = { value: JSON.stringify([{ id: "evt_x", task: "Spray", cadence: { type: "everyDay" }, window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, createdAt: "2026-06-26T00:00:00.000Z" }]) };
  const res = await executeTool("delete_event_rule", { id: "evt_x" }, fakeEnv(store), 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []);
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(store.value), []);
});
