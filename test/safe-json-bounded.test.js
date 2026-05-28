import { test } from "node:test";
import assert from "node:assert/strict";
import { safeJsonBounded } from "../worker/util.js";

function mockRequest({ body = "", contentLength }) {
  const headers = new Map();
  if (contentLength !== undefined) headers.set("content-length", String(contentLength));
  return {
    headers: { get: k => headers.get(k.toLowerCase()) ?? null },
    text: async () => body,
  };
}

test("rejects via content-length before reading the body", async () => {
  const r = await safeJsonBounded(mockRequest({ contentLength: 10_000 }), 1024);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("rejects via actual body length when content-length is missing", async () => {
  const body = "x".repeat(2048);
  const r = await safeJsonBounded(mockRequest({ body }), 1024);
  assert.equal(r.ok, false);
  assert.equal(r.status, 413);
});

test("returns parsed JSON when within limit", async () => {
  const r = await safeJsonBounded(mockRequest({ body: '{"a":1}', contentLength: 7 }), 1024);
  assert.equal(r.ok, true);
  assert.deepEqual(r.data, { a: 1 });
});

test("returns 400 on invalid JSON", async () => {
  const r = await safeJsonBounded(mockRequest({ body: "not json", contentLength: 8 }), 1024);
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("empty body parses to null without erroring", async () => {
  const r = await safeJsonBounded(mockRequest({ body: "", contentLength: 0 }), 1024);
  assert.equal(r.ok, true);
  assert.equal(r.data, null);
});
