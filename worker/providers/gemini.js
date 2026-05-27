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

export async function runGemini({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) {
  const contents = toGeminiContents(messages);
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let data;
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(buildGeminiBody({ systemSegments, tools, contents })),
      });
      if (res.status === 429) throw new ProviderError("quota");
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("gemini error", res.status, detail);
        throw new ProviderError("upstream");
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unreachable");
    }

    const { text, functionCalls, parts } = parseGeminiResponse(data);
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
