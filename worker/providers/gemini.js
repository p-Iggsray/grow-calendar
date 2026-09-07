import { ProviderError } from "./errors.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// When CF_AI_GATEWAY_URL is set (e.g. https://gateway.ai.cloudflare.com/v1/{account}/{name})
// route through the gateway instead of calling Google directly.
function geminiBase(gatewayBase) {
  return gatewayBase
    ? `${gatewayBase}/google-ai-studio/v1beta/models`
    : GEMINI_BASE;
}

export function toGeminiContents(messages) {
  return messages.map(m => {
    const parts = m.content ? [{ text: m.content }] : [];
    if (m.imageParts) parts.push(...m.imageParts);
    if (parts.length === 0) parts.push({ text: "" });
    return { role: m.role === "assistant" ? "model" : "user", parts };
  });
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
    // Let Gemini 2.5 use its default reasoning budget - this is what makes
    // the model thoughtful rather than reflexive. Lower temperature keeps
    // grow advice consistent and grounded.
    generationConfig: { temperature: 0.5 },
  };
}

/**
 * One question, one JSON answer, no tools and no streaming.
 *
 * The chat path is a tool loop because a conversation goes back and forth.
 * Reading a journal entry does not: there is one piece of text, one shape of
 * answer, and nothing to negotiate. Gemini is held to the schema by the API
 * itself, and temperature sits at zero because this is extraction, not advice
 * - the same sentence read twice should come back the same way.
 *
 * Returns the parsed object, or null when the model answered with something
 * that is not the object we asked for. Null is a real answer here: it means
 * nothing was found, which is exactly what an entry with no numbers in it
 * should produce.
 */
export async function askGeminiForJson({ apiKey, model, instruction, text, schema, gatewayBase, userId }) {
  const body = {
    systemInstruction: { parts: [{ text: instruction }] },
    contents: [{ role: "user", parts: [{ text }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: "application/json",
      responseSchema: schema,
    },
  };
  let res;
  try {
    res = await fetch(`${geminiBase(gatewayBase)}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        ...(userId ? { "cf-aig-metadata": JSON.stringify({ userId: String(userId) }) } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("unreachable");
  }
  if (!res.ok) {
    throw new ProviderError(res.status === 429 ? "rate_limited" : "upstream", res.status);
  }
  let data;
  try { data = await res.json(); } catch { throw new ProviderError("upstream"); }
  const out = parseGeminiResponse(data).text;
  if (!out) return null;
  try {
    const parsed = JSON.parse(out);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function parseGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  // Do NOT trim here - trimming per streaming chunk strips leading/trailing spaces
  // at word boundaries, causing adjacent words to be joined together in the output.
  // The final accumulated text is trimmed once in streamGeminiCall.
  const text = parts.filter(p => typeof p.text === "string").map(p => p.text).join("");
  const functionCalls = parts
    .filter(p => p.functionCall)
    .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { text, functionCalls, parts };
}

// Makes a streaming request to :streamGenerateContent?alt=sse.
// Calls onChunk(textDelta) in real-time for text parts - but ONLY if no
// function calls have been seen yet in this response. Gemini never mixes
// text and function calls in the same turn, so this is always safe.
// Returns the full { text, functionCalls, parts } for the caller to use.
async function streamGeminiCall({ apiKey, model, body, onChunk, gatewayBase, userId }) {
  const base = geminiBase(gatewayBase);
  const headers = { "x-goog-api-key": apiKey, "content-type": "application/json" };
  if (userId != null) headers["cf-aig-metadata"] = JSON.stringify({ user_id: String(userId) });

  let res;
  try {
    res = await fetch(`${base}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch {
    throw new ProviderError("unreachable");
  }

  if (res.status === 429) throw new ProviderError("quota", `429 ${(await res.text().catch(() => "")).slice(0, 160)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("gemini stream error", res.status, detail);
    throw new ProviderError("upstream", `${res.status} ${String(detail).slice(0, 160)}`);
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

  return { text: fullText.trim(), functionCalls, parts: allParts };
}

// onChunk is forwarded to streaming tool-call iterations too, but Gemini
// never emits text on the same turn as function calls, so it's a no-op there.
export async function runGemini({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations, onChunk, gatewayBase, userId }) {
  const contents = toGeminiContents(messages);
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let text, functionCalls, parts;
    try {
      const body = buildGeminiBody({ systemSegments, tools, contents });
      ({ text, functionCalls, parts } = await streamGeminiCall({ apiKey, model, body, onChunk, gatewayBase, userId }));
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
