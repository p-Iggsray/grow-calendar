import { test } from "node:test";
import assert from "node:assert/strict";
import { GEMINI_CONNECT_TIMEOUT_MS, GEMINI_IDLE_TIMEOUT_MS } from "../worker/mj/constants.js";
import { MJ_WRITE_TOOLS, MJ_TOOLS } from "../worker/mj-logic.js";

test("the deadlines are real numbers, and silence mid-stream is given longer than a dead connection", () => {
  assert.ok(Number.isFinite(GEMINI_CONNECT_TIMEOUT_MS) && GEMINI_CONNECT_TIMEOUT_MS > 0);
  assert.ok(Number.isFinite(GEMINI_IDLE_TIMEOUT_MS) && GEMINI_IDLE_TIMEOUT_MS > 0);
  assert.ok(GEMINI_IDLE_TIMEOUT_MS > GEMINI_CONNECT_TIMEOUT_MS,
    "a model already answering deserves more patience than one that never picked up");
});

test("every write tool is a real tool", () => {
  const names = new Set(MJ_TOOLS.map((t) => t.name));
  for (const w of MJ_WRITE_TOOLS) assert.ok(names.has(w), `${w} is not in MJ_TOOLS`);
});

test("every tool that is not a declared write is a read", () => {
  // The list this guards is the one that decides whether a failed turn may be
  // retried on another model. A writing tool missing from it gets replayed.
  const reads = MJ_TOOLS.map((t) => t.name).filter((n) => !MJ_WRITE_TOOLS.has(n));
  assert.deepEqual(reads.sort(), [
    "get_day", "get_environment", "get_grow_info", "get_grow_log", "get_photo",
    "get_photos", "get_plant_log", "get_week", "search_journal",
  ]);
});

test("every tool whose name announces a change is declared a write", () => {
  const changing = MJ_TOOLS
    .map((t) => t.name)
    .filter((n) => /^(add|update|delete|log|append|replace|lifecycle)/.test(n));
  for (const n of changing) {
    assert.ok(MJ_WRITE_TOOLS.has(n), `${n} looks like a write but is not declared one`);
  }
});

// ── A cut stream is not a short answer ─────────────────────────────────────
import { runGemini } from "../worker/providers/gemini.js";
import { ProviderError } from "../worker/providers/errors.js";

function sseResponse(chunks, { failAfter = null } = {}) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader() {
        return {
          async read() {
            if (failAfter != null && i === failAfter) throw new Error("connection reset");
            if (i >= chunks.length) return { done: true, value: undefined };
            return { done: false, value: new TextEncoder().encode(chunks[i++]) };
          },
        };
      },
    },
  };
}

const say = (text) => `data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] })}\n\n`;

test("a complete stream comes back as the whole answer", async () => {
  globalThis.fetch = async () => sseResponse([say("Your plants "), say("look fine.")]);
  const out = await runGemini({
    apiKey: "k", model: "m", systemSegments: [{ text: "s" }], tools: [], messages: [{ role: "user", content: "hi" }],
    executeToolUse: async () => ({}), maxIterations: 4,
  });
  assert.equal(out.reply, "Your plants look fine.");
});

test("a stream that dies mid-answer throws rather than returning half a reply", async () => {
  globalThis.fetch = async () => sseResponse([say("Your plants look ")], { failAfter: 1 });
  await assert.rejects(
    () => runGemini({
      apiKey: "k", model: "m", systemSegments: [{ text: "s" }], tools: [], messages: [{ role: "user", content: "hi" }],
      executeToolUse: async () => ({}), maxIterations: 4,
    }),
    (e) => {
      assert.ok(e instanceof ProviderError, `expected ProviderError, got ${e?.constructor?.name}`);
      assert.equal(e.kind, "unreachable");
      return true;
    },
  );
});

test("a 429 is reported as a quota, not as an outage", async () => {
  globalThis.fetch = async () => ({ ok: false, status: 429, text: async () => "rate limited" });
  await assert.rejects(
    () => runGemini({
      apiKey: "k", model: "m", systemSegments: [{ text: "s" }], tools: [], messages: [{ role: "user", content: "hi" }],
      executeToolUse: async () => ({}), maxIterations: 4,
    }),
    (e) => e instanceof ProviderError && e.kind === "quota",
  );
});
