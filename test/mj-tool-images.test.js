import { test } from "node:test";
import assert from "node:assert/strict";
import { runGemini } from "../worker/providers/gemini.js";

// Gemini 2.5 cannot see an image nested inside a functionResponse: that field
// is JSON. Images have to ride in the SAME turn as sibling parts. This is the
// whole mechanism behind MJ looking at stored photographs, so it is tested at
// the wire, by reading what actually gets sent.

const enc = new TextEncoder();
function sse(frames) {
  let i = 0;
  return { ok: true, status: 200, body: { getReader: () => ({
    async read() {
      if (i >= frames.length) return { done: true, value: undefined };
      return { done: false, value: enc.encode(frames[i++]) };
    },
  }) } };
}
const text = (t) => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`]);
const call = (name) => sse([`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ functionCall: { name, args: {} } }] } }] })}\n\n`]);

const base = {
  apiKey: "k", model: "gemini-2.5-flash", systemSegments: [{ text: "s" }], tools: [],
  messages: [{ role: "user", content: "how do they look?" }], maxIterations: 4,
};

test("images a tool shows are sent as siblings of the function response", async () => {
  const sent = [];
  let n = 0;
  globalThis.fetch = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    return ++n === 1 ? call("get_photos") : text("They have filled in nicely.");
  };

  await runGemini({
    ...base,
    executeToolUse: async (name, input, shown) => {
      shown.push({ mimeType: "image/jpeg", data: "AAAA" });
      shown.push({ mimeType: "image/jpeg", data: "BBBB" });
      return { photos: [{ id: "a" }, { id: "b" }], showing: 2 };
    },
  });

  // The second request carries the tool result turn.
  const turn = sent[1].contents.at(-1);
  assert.equal(turn.role, "user");
  const kinds = turn.parts.map((p) => (p.functionResponse ? "functionResponse" : p.inlineData ? "inlineData" : "other"));
  assert.deepEqual(kinds, ["functionResponse", "inlineData", "inlineData"]);
  // The JSON result stays clean: no base64 smuggled into it, where 2.5 would
  // read it as a meaningless string and pay for the tokens anyway.
  assert.doesNotMatch(JSON.stringify(turn.parts[0]), /AAAA/);
  assert.equal(turn.parts[1].inlineData.data, "AAAA");
  assert.equal(turn.parts[2].inlineData.mimeType, "image/jpeg");
});

test("a tool that shows nothing sends no image parts", async () => {
  const sent = [];
  let n = 0;
  globalThis.fetch = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    return ++n === 1 ? call("get_day") : text("Nothing logged.");
  };
  await runGemini({ ...base, executeToolUse: async () => ({ date: "2026-09-01" }) });
  const turn = sent[1].contents.at(-1);
  assert.equal(turn.parts.length, 1);
  assert.ok(turn.parts[0].functionResponse);
});

test("a malformed image is dropped rather than sent as a broken part", async () => {
  const sent = [];
  let n = 0;
  globalThis.fetch = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    return ++n === 1 ? call("get_photos") : text("ok");
  };
  await runGemini({
    ...base,
    executeToolUse: async (name, input, shown) => {
      shown.push({ mimeType: "image/jpeg" });      // no data
      shown.push({ data: "CCCC" });                 // no mime type
      shown.push(null);
      shown.push({ mimeType: "image/png", data: "DDDD" });
      return { ok: true };
    },
  });
  const parts = sent[1].contents.at(-1).parts;
  const images = parts.filter((p) => p.inlineData);
  assert.equal(images.length, 1, "only the complete one travels");
  assert.equal(images[0].inlineData.data, "DDDD");
});

test("images from one turn do not leak into the next request's system prompt", async () => {
  const sent = [];
  let n = 0;
  globalThis.fetch = async (_url, opts) => {
    sent.push(JSON.parse(opts.body));
    return ++n === 1 ? call("get_photos") : text("done");
  };
  await runGemini({
    ...base,
    executeToolUse: async (name, input, shown) => { shown.push({ mimeType: "image/jpeg", data: "EEEE" }); return {}; },
  });
  // The cacheable prefix has to stay byte-identical across iterations.
  assert.deepEqual(sent[0].systemInstruction, sent[1].systemInstruction);
});
