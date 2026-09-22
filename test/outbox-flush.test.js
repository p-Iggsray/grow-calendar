import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { OUTBOX_KEY } from "../src/lib/outbox.js";

// A localStorage that behaves like the real one, including throwing when full.
let store = new Map();
let refuse = false;
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { if (refuse) throw new Error("quota"); store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
};
globalThis.window = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {} };
globalThis.CustomEvent = class { constructor(t) { this.type = t; } };

const { api, flushOutbox, outboxSize, onOutboxChange } = await import("../src/lib/api.js");

/** The tent: every request fails the way fetch fails with no network. */
function noSignal() { globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); }; }
/** Back in the house. */
function signal(status = 200) {
  const seen = [];
  globalThis.fetch = async (path, opts) => {
    seen.push(`${opts?.method || "GET"} ${path}`);
    return new Response("{}", { status, headers: { "content-type": "application/json" } });
  };
  return seen;
}

const queued = () => JSON.parse(store.get(OUTBOX_KEY) || "[]");

beforeEach(() => { store = new Map(); refuse = false; });

test("a note written with no signal is kept rather than lost", async () => {
  noSignal();
  const res = await api.putNote("2026-09-01", "Topped the tall one.", "g1");
  assert.deepEqual(res, { queued: true });
  assert.equal(queued().length, 1);
  assert.match(queued()[0].path, /^\/api\/notes\/2026-09-01\?growId=g1$/);
  assert.match(queued()[0].body, /Topped the tall one/);
});

test("reconnecting delivers it", async () => {
  noSignal();
  await api.putNote("2026-09-01", "Fed 0.8 gal.", "g1");
  assert.equal(outboxSize(), 1);

  const seen = signal();
  const out = await flushOutbox();
  assert.deepEqual(out, { sent: 1, refused: 0, left: 0 });
  assert.deepEqual(seen, ["PUT /api/notes/2026-09-01?growId=g1"]);
  assert.equal(outboxSize(), 0);
});

test("writes go out in the order they were written", async () => {
  noSignal();
  await api.putNote("2026-09-01", "first", "g1");
  await api.putGrowLog("2026-09-01", { water_gal: 0.8 }, "g1");
  await api.putNote("2026-09-02", "third", "g1");

  const seen = signal();
  await flushOutbox();
  assert.deepEqual(seen, [
    "PUT /api/notes/2026-09-01?growId=g1",
    "PUT /api/grow-log/2026-09-01?growId=g1",
    "PUT /api/notes/2026-09-02?growId=g1",
  ]);
});

test("ten minutes of typing is one write, not a hundred", async () => {
  noSignal();
  for (let i = 0; i < 100; i++) await api.putNote("2026-09-01", `draft ${i}`, "g1");
  assert.equal(outboxSize(), 1);

  const seen = signal();
  await flushOutbox();
  assert.equal(seen.length, 1);
  assert.equal(outboxSize(), 0);
});

test("the last version of the text is the one that lands", async () => {
  noSignal();
  await api.putNote("2026-09-01", "half a thought", "g1");
  await api.putNote("2026-09-01", "the finished entry", "g1");
  let body = null;
  globalThis.fetch = async (_p, opts) => { body = opts.body; return new Response("{}", { status: 200 }); };
  await flushOutbox();
  assert.match(body, /the finished entry/);
  assert.doesNotMatch(body, /half a thought/);
});

test("a create is not queued, it fails like it always did", async () => {
  noSignal();
  await assert.rejects(() => api.createGrow({ displayName: "New tent" }));
  assert.equal(outboxSize(), 0);
});

test("still no signal at flush time leaves everything queued", async () => {
  noSignal();
  await api.putNote("2026-09-01", "kept", "g1");
  const out = await flushOutbox();
  assert.deepEqual(out, { sent: 0, refused: 0, left: 1 });
  assert.equal(outboxSize(), 1);
});

test("one dead entry does not block the rest forever", async () => {
  // A write the server refuses outright will be refused every time. Holding it
  // would stop everything behind it from ever going out.
  noSignal();
  await api.putNote("2026-09-01", "bad", "g1");
  await api.putNote("2026-09-02", "good", "g1");

  let call = 0;
  globalThis.fetch = async () => {
    call++;
    return new Response("{}", { status: call === 1 ? 400 : 200 });
  };
  const out = await flushOutbox();
  assert.equal(out.refused, 1);
  assert.equal(out.sent, 1);
  assert.equal(outboxSize(), 0);
});

test("an ended session keeps the writing rather than discarding it", async () => {
  // Signing back in should deliver what was written, not throw it away.
  noSignal();
  await api.putNote("2026-09-01", "written before the session lapsed", "g1");
  signal(401);
  const out = await flushOutbox();
  assert.equal(out.sent, 0);
  assert.equal(outboxSize(), 1);
});

test("when storage refuses, the save fails rather than lying", async () => {
  // Claiming a write is safe when nothing recorded it is the one outcome
  // worse than failing.
  noSignal();
  refuse = true;
  await assert.rejects(() => api.putNote("2026-09-01", "nowhere to put this", "g1"));
});

test("the pending count is announced as it changes", async () => {
  const seen = [];
  const off = onOutboxChange((n) => seen.push(n));
  noSignal();
  await api.putNote("2026-09-01", "a", "g1");
  await api.putNote("2026-09-02", "b", "g1");
  signal();
  await flushOutbox();
  off();
  assert.equal(seen[0], 1);
  assert.equal(seen[1], 2);
  assert.equal(seen[seen.length - 1], 0);
});

test("a corrupt queue is ignored, not thrown over", async () => {
  store.set(OUTBOX_KEY, "{not json at all");
  assert.equal(outboxSize(), 0);
  store.set(OUTBOX_KEY, JSON.stringify([{ nonsense: true }, null]));
  assert.equal(outboxSize(), 0);
});

test("overlapping flushes do not send anything twice", async () => {
  noSignal();
  await api.putNote("2026-09-01", "once", "g1");
  const seen = signal();
  await Promise.all([flushOutbox(), flushOutbox(), flushOutbox()]);
  assert.equal(seen.length, 1);
});
