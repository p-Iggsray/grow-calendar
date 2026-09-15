import { test } from "node:test";
import assert from "node:assert/strict";
import { runGemini } from "../worker/providers/gemini.js";
import { ProviderError } from "../worker/providers/errors.js";
import { bumpModelUsage } from "../worker/mj/usage.js";
import { MAX_TOOL_ITERATIONS, GEMINI_RETRY_AFTER_MS } from "../worker/mj/constants.js";

// One chat message is a tool loop, and every iteration of it is a whole
// request to Google. The quota counts requests; the app counted messages.

const enc = new TextEncoder();
function sse(frames) {
  let i = 0;
  return {
    ok: true, status: 200,
    body: { getReader: () => ({
      async read() {
        if (i >= frames.length) return { done: true, value: undefined };
        return { done: false, value: enc.encode(frames[i++]) };
      },
    }) },
  };
}
const text = (t) => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`]);
const call = (name) => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args: {} } }] } }] })}\n\n`]);

const base = {
  apiKey: "k", model: "gemini-2.5-flash", systemSegments: [{ text: "s" }], tools: [],
  messages: [{ role: "user", content: "hi" }], maxIterations: MAX_TOOL_ITERATIONS,
};

test("a one-shot answer counts one request", async () => {
  globalThis.fetch = async () => text("Looks good.");
  const usage = { requests: 0 };
  await runGemini({ ...base, executeToolUse: async () => ({}), usage });
  assert.equal(usage.requests, 1);
});

test("a four-tool answer counts five requests, not one", async () => {
  let n = 0;
  globalThis.fetch = async () => (++n <= 4 ? call("get_day") : text("Here is your week."));
  const usage = { requests: 0 };
  const out = await runGemini({ ...base, executeToolUse: async () => ({ ok: true }), usage });
  assert.equal(out.reply, "Here is your week.");
  assert.equal(usage.requests, 5);
});

test("requests made before a failure are still counted", async () => {
  let n = 0;
  globalThis.fetch = async () => {
    if (++n <= 3) return call("get_day");
    return { ok: false, status: 500, text: async () => "boom" };
  };
  const usage = { requests: 0 };
  await assert.rejects(() => runGemini({ ...base, executeToolUse: async () => ({}), usage }));
  // Three tool round trips plus the one that failed: all four reached Google.
  assert.equal(usage.requests, 4);
});

test("a 429 is retried once, and the retry is counted", async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1
    ? { ok: false, status: 429, text: async () => "per-minute limit" }
    : text("Back again."));
  const usage = { requests: 0 };
  const started = Date.now();
  const out = await runGemini({ ...base, executeToolUse: async () => ({}), usage });
  assert.equal(out.reply, "Back again.");
  assert.equal(usage.requests, 2);
  assert.ok(Date.now() - started >= GEMINI_RETRY_AFTER_MS - 50, "it should have waited before retrying");
});

test("a second 429 is taken at its word", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "limit" });
  const usage = { requests: 0 };
  await assert.rejects(
    () => runGemini({ ...base, executeToolUse: async () => ({}), usage }),
    (e) => e instanceof ProviderError && e.kind === "quota",
  );
  assert.equal(usage.requests, 2, "the original and one retry, and no more");
});

test("the loop stops at the ceiling rather than running away", async () => {
  globalThis.fetch = async () => call("get_day");
  const usage = { requests: 0 };
  const out = await runGemini({ ...base, executeToolUse: async () => ({}), usage });
  assert.equal(usage.requests, MAX_TOOL_ITERATIONS);
  assert.match(out.reply, /stopped after several steps/);
});

test("the ceiling leaves headroom under a ten-per-minute limit", () => {
  assert.ok(MAX_TOOL_ITERATIONS < 10, `${MAX_TOOL_ITERATIONS} requests in seconds would trip the per-minute limit alone`);
});

test("bumpModelUsage adds the number of requests, not one", async () => {
  const bound = [];
  const env = { DB: { prepare(sql) {
    return { bind(...a) { bound.push({ sql, a }); return this; }, async run() { return {}; } };
  } } };
  await bumpModelUsage(env, "gemini-2.5-flash", "2026-09-15", 7);
  assert.deepEqual(bound[0].a, ["gemini-2.5-flash", "2026-09-15", 7, 7]);
});

test("bumpModelUsage writes nothing when nothing was spent", async () => {
  let called = false;
  const env = { DB: { prepare() { called = true; return { bind() { return this; }, async run() {} }; } } };
  await bumpModelUsage(env, "m", "2026-09-15", 0);
  // A count that is not a number is not a reason to charge a phantom request.
  await bumpModelUsage(env, "m", "2026-09-15", NaN);
  await bumpModelUsage(env, "m", "2026-09-15", -3);
  assert.equal(called, false);
});

test("bumpModelUsage defaults to one for any older caller", async () => {
  const bound = [];
  const env = { DB: { prepare() {
    return { bind(...a) { bound.push(a); return this; }, async run() {} };
  } } };
  await bumpModelUsage(env, "m", "2026-09-15");
  assert.deepEqual(bound[0], ["m", "2026-09-15", 1, 1]);
});
