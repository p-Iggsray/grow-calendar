import { ProviderError } from "./errors.js";
import { GEMINI_CONNECT_TIMEOUT_MS, GEMINI_IDLE_TIMEOUT_MS, GEMINI_RETRY_AFTER_MS } from "../mj/constants.js";

/**
 * A deadline that only runs while nothing is happening.
 *
 * `bump()` pushes it back, so a stream that is producing text is never cut off
 * for being long, and a stream that has gone quiet is cut off promptly.
 */
function idleDeadline(ms, onExpire) {
  let timer = null;
  const arm = () => { timer = setTimeout(onExpire, ms); };
  arm();
  return {
    bump(nextMs = ms) { clearTimeout(timer); timer = setTimeout(onExpire, nextMs); },
    clear() { clearTimeout(timer); },
  };
}

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
  const ctl = new AbortController();
  const deadline = idleDeadline(GEMINI_CONNECT_TIMEOUT_MS, () => ctl.abort());
  let res;
  try {
    res = await fetch(`${geminiBase(gatewayBase)}/${model}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
        // Same spelling as the streaming path, so one grower is one identity
        // in the gateway's metadata rather than two.
        ...(userId != null ? { "cf-aig-metadata": JSON.stringify({ user_id: String(userId) }) } : {}),
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    throw new ProviderError("unreachable");
  } finally {
    deadline.clear();
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
async function streamGeminiCall({ apiKey, model, body, onChunk, gatewayBase, userId, usage }) {
  if (usage) usage.requests += 1;
  const base = geminiBase(gatewayBase);
  const headers = { "x-goog-api-key": apiKey, "content-type": "application/json" };
  if (userId != null) headers["cf-aig-metadata"] = JSON.stringify({ user_id: String(userId) });

  // Without this a hung upstream holds the request open until the platform
  // kills it, and the grower watches a spinner that will never resolve.
  const ctl = new AbortController();
  let timedOut = false;
  const deadline = idleDeadline(GEMINI_CONNECT_TIMEOUT_MS, () => { timedOut = true; ctl.abort(); });

  let res;
  try {
    res = await fetch(`${base}/${model}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
  } catch {
    deadline.clear();
    throw new ProviderError("unreachable", timedOut ? `no response in ${GEMINI_CONNECT_TIMEOUT_MS}ms` : undefined);
  }

  if (res.status === 429) {
    deadline.clear();
    throw new ProviderError("quota", `429 ${(await res.text().catch(() => "")).slice(0, 160)}`);
  }
  if (!res.ok) {
    deadline.clear();
    const detail = await res.text().catch(() => "");
    console.error("gemini stream error", res.status, detail);
    throw new ProviderError("upstream", `${res.status} ${String(detail).slice(0, 160)}`);
  }

  // The response is open. From here the clock measures gaps between chunks.
  deadline.bump(GEMINI_IDLE_TIMEOUT_MS);

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

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      deadline.bump(GEMINI_IDLE_TIMEOUT_MS);
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) processLine(line);
    }
    if (buf) processLine(buf);
  } catch (e) {
    // A stream cut short mid-answer is not a partial answer worth keeping: the
    // tool calls it was about to make never arrived.
    throw new ProviderError("unreachable", timedOut ? `silent for ${GEMINI_IDLE_TIMEOUT_MS}ms` : String(e?.message ?? e).slice(0, 160));
  } finally {
    deadline.clear();
  }

  return { text: fullText.trim(), functionCalls, parts: allParts };
}

// onChunk is forwarded to streaming tool-call iterations too, but Gemini
// never emits text on the same turn as function calls, so it's a no-op there.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * One turn, however many round trips it takes.
 *
 * `usage` is a caller-owned `{ requests }` counter rather than a return value
 * on purpose: the caller needs the count whether this returns or throws, and a
 * turn that failed on its sixth request still made six requests against the
 * quota. Returning it would lose exactly the case that matters.
 */
export async function runGemini({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations, onChunk, gatewayBase, userId, usage }) {
  const contents = toGeminiContents(messages);
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let text, functionCalls, parts;
    const body = buildGeminiBody({ systemSegments, tools, contents });
    try {
      ({ text, functionCalls, parts } = await streamGeminiCall({ apiKey, model, body, onChunk, gatewayBase, userId, usage }));
    } catch (e) {
      // A quota refusal arrives before the response opens, so nothing has been
      // streamed to the grower and there is nothing to duplicate by trying
      // again. Give the per-minute window a moment to roll over, once.
      if (e instanceof ProviderError && e.kind === "quota") {
        await sleep(GEMINI_RETRY_AFTER_MS);
        try {
          ({ text, functionCalls, parts } = await streamGeminiCall({ apiKey, model, body, onChunk, gatewayBase, userId, usage }));
        } catch (again) {
          throw again instanceof ProviderError ? again : new ProviderError("unreachable");
        }
      } else if (e instanceof ProviderError) {
        throw e;
      } else {
        throw new ProviderError("unreachable");
      }
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
