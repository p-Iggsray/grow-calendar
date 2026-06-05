import { test } from "node:test";
import assert from "node:assert/strict";
import { toGeminiContents, buildGeminiBody, parseGeminiResponse } from "../worker/providers/gemini.js";

const tools = [
  { name: "get_day", description: "d", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
];
const systemSegments = [{ text: "persona+plan", cache: true }, { text: "Today is 2026-05-27.", cache: false }];

test("toGeminiContents maps roles assistant->model and wraps text parts", () => {
  const out = toGeminiContents([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]);
  assert.deepEqual(out, [
    { role: "user", parts: [{ text: "hi" }] },
    { role: "model", parts: [{ text: "yo" }] },
  ]);
});

test("buildGeminiBody shapes systemInstruction and functionDeclarations", () => {
  const body = buildGeminiBody({ systemSegments, tools, contents: toGeminiContents([{ role: "user", content: "hi" }]) });
  assert.deepEqual(body.systemInstruction.parts, [{ text: "persona+plan" }, { text: "Today is 2026-05-27." }]);
  assert.equal(body.tools[0].functionDeclarations[0].name, "get_day");
  assert.deepEqual(body.tools[0].functionDeclarations[0].parameters, tools[0].parameters);
  assert.equal(body.generationConfig.thinkingConfig, undefined);
});

test("parseGeminiResponse extracts text and functionCalls", () => {
  const data = { candidates: [{ content: { role: "model", parts: [
    { text: "ok" },
    { functionCall: { name: "get_day", args: { date: "2026-06-01" } } },
  ] } }] };
  const { text, functionCalls } = parseGeminiResponse(data);
  assert.equal(text, "ok");
  assert.deepEqual(functionCalls, [{ name: "get_day", args: { date: "2026-06-01" } }]);
});

test("parseGeminiResponse handles text-only response", () => {
  const data = { candidates: [{ content: { role: "model", parts: [{ text: "hello" }] } }] };
  const { text, functionCalls } = parseGeminiResponse(data);
  assert.equal(text, "hello");
  assert.deepEqual(functionCalls, []);
});
