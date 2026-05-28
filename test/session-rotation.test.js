import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldRotate, SESSION_ROTATE_AFTER_MS } from "../worker/auth.js";

test("does not rotate a brand-new session", () => {
  const now = Date.now();
  const created = new Date(now).toISOString();
  assert.equal(shouldRotate(created, now), false);
});

test("does not rotate just before the threshold", () => {
  const now = Date.now();
  const created = new Date(now - SESSION_ROTATE_AFTER_MS + 60_000).toISOString();
  assert.equal(shouldRotate(created, now), false);
});

test("rotates exactly at the threshold", () => {
  const now = Date.now();
  const created = new Date(now - SESSION_ROTATE_AFTER_MS).toISOString();
  assert.equal(shouldRotate(created, now), true);
});

test("rotates beyond the threshold", () => {
  const now = Date.now();
  const created = new Date(now - SESSION_ROTATE_AFTER_MS - 60_000).toISOString();
  assert.equal(shouldRotate(created, now), true);
});

test("ignores invalid created_at", () => {
  assert.equal(shouldRotate("not-a-date", Date.now()), false);
  assert.equal(shouldRotate(null, Date.now()), false);
  assert.equal(shouldRotate(undefined, Date.now()), false);
});
