import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isReplayable, entryKey, put, drop, trim, bytes,
  MAX_ENTRIES,
} from "../src/lib/outbox.js";

const entry = (path, body = "{}", at = 1) => ({
  key: entryKey("PUT", path), path, method: "PUT", body, at,
});

// ── What may be queued ─────────────────────────────────────────────────────

test("a day's note and a day's log can wait for a signal", () => {
  assert.ok(isReplayable("PUT", "/api/notes/2026-09-01"));
  assert.ok(isReplayable("PUT", "/api/notes/2026-09-01?growId=g1"));
  assert.ok(isReplayable("PUT", "/api/grow-log/2026-09-01?growId=g1"));
  assert.ok(isReplayable("PUT", "/api/strain-library"));
  assert.ok(isReplayable("PUT", "/api/strain-library/photos"));
});

test("creates never wait, because replaying one invents a second thing", () => {
  // A new plant or space is a POST whose id the server hands back. Queue it and
  // a replay makes a duplicate, and anything written against the first id has
  // nowhere to land.
  assert.equal(isReplayable("POST", "/api/grows"), false);
  assert.equal(isReplayable("POST", "/api/grows/g1/plants"), false);
  assert.equal(isReplayable("POST", "/api/grows/g1/photos"), false);
  assert.equal(isReplayable("PATCH", "/api/grows/g1/plants/p1"), false);
  assert.equal(isReplayable("DELETE", "/api/strain-library"), false);
});

test("a path that only looks like one of ours does not slip through", () => {
  assert.equal(isReplayable("PUT", "/api/notes/not-a-date"), false);
  assert.equal(isReplayable("PUT", "/api/notes/2026-09-01/extra"), false);
  assert.equal(isReplayable("PUT", "/api/strain-libraryX"), false);
  assert.equal(isReplayable("PUT", "/evil/api/notes/2026-09-01"), false);
});

// ── Collapsing ─────────────────────────────────────────────────────────────

test("editing the same day twice queues one write, not two", () => {
  // The note autosaves 800ms after each pause. Ten minutes of writing in a
  // tent must not become a hundred queued requests.
  let q = [];
  q = put(q, entry("/api/notes/2026-09-01", '{"body":"first"}'));
  q = put(q, entry("/api/notes/2026-09-01", '{"body":"first and second"}'));
  q = put(q, entry("/api/notes/2026-09-01", '{"body":"the whole thing"}'));
  assert.equal(q.length, 1);
  assert.equal(q[0].body, '{"body":"the whole thing"}');
});

test("the same date in two spaces is two destinations", () => {
  let q = [];
  q = put(q, entry("/api/notes/2026-09-01?growId=g1"));
  q = put(q, entry("/api/notes/2026-09-01?growId=g2"));
  assert.equal(q.length, 2);
});

test("a replacement keeps its place in the line", () => {
  // Order matters between destinations. A note edited twice must not overtake
  // a log entry written between the two edits.
  let q = [];
  q = put(q, entry("/api/notes/2026-09-01", "note v1"));
  q = put(q, entry("/api/grow-log/2026-09-01", "log"));
  q = put(q, entry("/api/notes/2026-09-01", "note v2"));
  assert.deepEqual(q.map((e) => e.path), ["/api/notes/2026-09-01", "/api/grow-log/2026-09-01"]);
  assert.equal(q[0].body, "note v2");
});

test("delivering one leaves the rest alone", () => {
  let q = [];
  q = put(q, entry("/api/notes/2026-09-01"));
  q = put(q, entry("/api/notes/2026-09-02"));
  q = drop(q, entryKey("PUT", "/api/notes/2026-09-01"));
  assert.deepEqual(q.map((e) => e.path), ["/api/notes/2026-09-02"]);
});

test("dropping something that is not there is not an error", () => {
  const q = [entry("/api/notes/2026-09-01")];
  assert.deepEqual(drop(q, "PUT /api/notes/1999-01-01"), q);
});

// ── Bounds ─────────────────────────────────────────────────────────────────

test("a long dead zone cannot fill storage", () => {
  const many = [];
  for (let i = 0; i < MAX_ENTRIES + 40; i++) {
    many.push(entry(`/api/notes/2026-09-${String((i % 28) + 1).padStart(2, "0")}`, "x", i));
  }
  const { queue, dropped } = trim(many);
  assert.equal(queue.length, MAX_ENTRIES);
  assert.equal(dropped, 40);
});

test("the oldest go first, because the newest is what you just wrote", () => {
  const q = [entry("/a", "x", 1), entry("/b", "x", 2), entry("/c", "x", 3)];
  const { queue } = trim(q, { maxEntries: 2 });
  assert.deepEqual(queue.map((e) => e.at), [2, 3]);
});

test("one enormous entry is kept rather than dropped to nothing", () => {
  // Better to hold a single note that is over budget than to silently discard
  // the thing the grower just wrote.
  const huge = entry("/api/notes/2026-09-01", "x".repeat(5_000_000));
  const { queue } = trim([huge], { maxBytes: 1000 });
  assert.equal(queue.length, 1);
});

test("a byte budget drops oldest until it fits", () => {
  const q = [
    entry("/a", "x".repeat(600), 1),
    entry("/b", "x".repeat(600), 2),
    entry("/c", "x".repeat(600), 3),
  ];
  const { queue } = trim(q, { maxEntries: 99, maxBytes: 1500 });
  assert.ok(queue.length < 3);
  assert.equal(queue[queue.length - 1].at, 3);
  assert.ok(bytes(queue) <= 1500);
});

test("bytes counts the bodies, which is what actually costs", () => {
  assert.ok(bytes([entry("/a", "x".repeat(1000))]) > 1000);
  assert.equal(bytes([]), 0);
});
