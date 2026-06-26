import { test } from "node:test";
import assert from "node:assert/strict";
import { createGrowEvent, deleteGrowEvent } from "../worker/grows.js";

// Fake D1 backed by a mutable store of one grow's event_rules JSON string.
function fakeEnv(store) {
  return {
    DB: {
      prepare(sql) {
        // Use a closure variable so bind() and run() share the same args regardless
        // of which object `this` refers to (arrow vs regular function contexts differ).
        let _args;
        return {
          _sql: sql,
          bind(...args) { _args = args; return this; },
          first: async () => (store.exists ? { event_rules: store.value } : null),
          run: async () => {
            // UPDATE grows SET event_rules = ? ...
            store.value = _args[0];
            return { meta: { changes: 1 } };
          },
        };
      },
    },
  };
}

function req(body) {
  return new Request("http://x/api/grows/g1/events", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

test("createGrowEvent assigns id + createdAt and persists", async () => {
  const store = { exists: true, value: null };
  const env = fakeEnv(store);
  const res = await createGrowEvent(req({ label: "Neem", task: "Spray neem", window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" } }), env, { id: 1 }, "g1");
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.match(data.rule.id, /^evt_/);
  assert.ok(data.rule.createdAt);
  assert.equal(JSON.parse(store.value).length, 1);
});

test("createGrowEvent rejects an invalid rule with 400", async () => {
  const store = { exists: true, value: null };
  const res = await createGrowEvent(req({ task: "" }), fakeEnv(store), { id: 1 }, "g1");
  assert.equal(res.status, 400);
});

test("deleteGrowEvent removes by id", async () => {
  const store = { exists: true, value: JSON.stringify([{ id: "evt_x", task: "Spray", cadence: { type: "everyDay" }, window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, createdAt: "2026-06-26T00:00:00.000Z" }]) };
  const res = await deleteGrowEvent(fakeEnv(store), { id: 1 }, "g1", "evt_x");
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(store.value), []);
});
