import { ProviderError } from "./errors.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function toGeminiContents(messages) {
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export function buildGeminiBody({ systemSegments, tools, contents }) {
  return {
    systemInstruction: { parts: systemSegments.map(s => ({ text: s.text })) },
    contents,
    tools: [{
      functionDeclarations: tools.map(t => ({
        name: t.name, description: t.description, parameters: t.parameters,
      })),
    }],
    // thinkingBudget 0 keeps tool calls fast and quota-frugal on Flash.
    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
  };
}

export function parseGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => typeof p.text === "string").map(p => p.text).join("").trim();
  const functionCalls = parts
    .filter(p => p.functionCall)
    .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { text, functionCalls, parts };
}

// Makes a streaming request to :streamGenerateContent?alt=sse.
// Calls onChunk(textDelta) in real-time for text parts — but ONLY if no
// function calls have been seen yet in this response. Gemini never mixes
// text and function calls in the same turn, so this is always safe.
// Returns the full { text, functionCalls, parts } for the caller to use.
async function streamGeminiCall({ apiKey, model, body, onChunk }) {
  let res;
  try {
    res = await fetch(`${GEMINI_BASE}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("unreachable");
  }

  if (res.status === 429) throw new ProviderError("quota");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("gemini stream error", res.status, detail);
    throw new ProviderError("upstream");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";
  const functionCalls = [];
  const allParts = [];

  function processLine(line) {
    if (!line.startsWith("data: ")) return;
    const json = line.slice(6).trim();
    if (!json || json === "[DONE]") return;
    let chunk;
    try { chunk = JSON.parse(json); } catch { return; }

    const { text, functionCalls: fcs, parts } = parseGeminiResponse(chunk);
    if (fcs.length) functionCalls.push(...fcs);
    if (parts.length) allParts.push(...parts);
    if (text) {
      fullText += text;
      // Forward real-time only while no function calls have appeared.
      if (!functionCalls.length && onChunk) onChunk(text);
    }
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) processLine(line);
  }
  if (buf) processLine(buf);

  return { text: fullText, functionCalls, parts: allParts };
}

// onChunk is forwarded to streaming tool-call iterations too, but Gemini
// never emits text on the same turn as function calls, so it's a no-op there.
export async function runGemini({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations, onChunk }) {
  const contents = toGeminiContents(messages);
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let text, functionCalls, parts;
    try {
      const body = buildGeminiBody({ systemSegments, tools, contents });
      ({ text, functionCalls, parts } = await streamGeminiCall({ apiKey, model, body, onChunk }));
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unreachable");
    }

    if (text) finalText = text;
    if (functionCalls.length === 0) return { reply: finalText || "(no response)" };

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      const result = await executeToolUse(fc.name, fc.args);
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return { reply: finalText || "I stopped after several steps - could you rephrase?" };
}
