import { json, error } from "./util.js";
import { currentUser } from "./auth.js";
import { GROW_CONTEXT } from "./growContext.js";

const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const PERSONA = `You are the grow assistant inside "The Grow Calendar", a personal app for one grower's outdoor cannabis grow. Answer as a calm, practical horticultural assistant who knows THIS grow (the plan is below). Give concise, actionable advice grounded in the plan's dates and dosing. When a diagnosis needs more detail (symptoms, timing, what the leaves look like), ask one brief clarifying question. This is the grower's own legal personal grow; keep guidance practical and safety-conscious about heat, frost, mold, and pests.`;

export async function postChat(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }

  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return error(400, "messages must be a non-empty array");
  }

  if (!env.ANTHROPIC_API_KEY) {
    return error(503, "chat is not configured yet");
  }

  // Normalize: keep the last MAX_MESSAGES, coerce roles to user/assistant,
  // require string content, cap length, drop empties.
  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: typeof m?.content === "string" ? m.content.slice(0, MAX_MSG_LEN) : "",
    }))
    .filter(m => m.content !== "");

  // The length === 0 check must stay first: it short-circuits the array access
  // so the .role read never runs on an empty array. Do not reorder.
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return error(400, "the last message must be from the user");
  }

  // The grower's saved notes, read from D1.
  const notesResult = await env.DB.prepare(
    "SELECT date, body FROM day_notes WHERE user_id = ? ORDER BY date",
  ).bind(user.id).all();
  const noteRows = notesResult.results || [];
  const notesText = noteRows.length
    ? noteRows.map(r => `${r.date}: ${r.body}`).join("\n")
    : "(none yet)";

  const today = new Date().toISOString().slice(0, 10);
  const dynamic = `Today's date is ${today}.\n\nThe grower's saved daily notes:\n${notesText}`;

  const payload = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Static block first (cacheable prefix), volatile block second (never cached).
    system: [
      { type: "text", text: `${PERSONA}\n\n${GROW_CONTEXT}`, cache_control: { type: "ephemeral" } },
      { type: "text", text: dynamic },
    ],
    messages,
  };

  let res;
  try {
    res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch {
    return error(502, "could not reach the AI service");
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("anthropic error", res.status, detail);
    return error(502, "the AI service returned an error");
  }

  const data = await res.json();
  const reply = Array.isArray(data.content)
    ? data.content.filter(b => b.type === "text").map(b => b.text).join("").trim()
    : "";

  return json({ reply: reply || "(no response)" });
}
