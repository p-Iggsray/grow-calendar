import { ProviderError } from "./errors.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1024;

// runConversation contract:
//   ({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) -> { reply }
// systemSegments: [{ text, cache }]; tools: [{ name, description, parameters }];
// messages: [{ role: "user"|"assistant", content }]; executeToolUse(name, input) -> result object.
export async function runAnthropic({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) {
  const system = systemSegments.map(s => ({
    type: "text",
    text: s.text,
    ...(s.cache ? { cache_control: { type: "ephemeral" } } : {}),
  }));
  const anthropicTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let data;
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, tools: anthropicTools, messages: apiMessages }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("anthropic error", res.status, detail);
        throw new ProviderError("upstream");
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unreachable");
    }

    const content = Array.isArray(data.content) ? data.content : [];
    finalText = content.filter(b => b.type === "text").map(b => b.text).join("").trim();

    if (data.stop_reason !== "tool_use") return { reply: finalText || "(no response)" };

    apiMessages.push({ role: "assistant", content });
    const toolResults = [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const result = await executeToolUse(b.name, b.input);
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
    }
    apiMessages.push({ role: "user", content: toolResults });
  }
  return { reply: finalText || "I stopped after several steps - could you rephrase?" };
}
