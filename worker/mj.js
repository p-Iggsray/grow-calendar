import { json, error } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Model-selection seam. v1: all users route to Claude with the shared key.
// A2 will route non-admin users to a free Gemini model (env.GEMINI_API_KEY)
// and enforce a per-user daily cap (mj_usage table).
function pickModel(user, env) {
  return { model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY };
}

export async function postMj(request, env, user) {
  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return error(400, "messages must be a non-empty array");
  }

  const { model, apiKey } = pickModel(user, env);
  if (!apiKey) return error(503, "MJ is not configured yet");

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

  const raw = await loadRawPlan(env, user.id);
  const config = parseConfig(raw.config);
  const overrides = raw.overrides;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const system = [
    { type: "text", text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Today's date is ${today}.` },
  ];

  const actions = [];
  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = "";

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    let data;
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, tools: MJ_TOOLS, messages: apiMessages }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("anthropic error", res.status, detail);
        return error(502, "the AI service returned an error");
      }
      data = await res.json();
    } catch {
      return error(502, "could not reach the AI service");
    }

    const content = Array.isArray(data.content) ? data.content : [];
    finalText = content.filter(b => b.type === "text").map(b => b.text).join("").trim();

    if (data.stop_reason !== "tool_use") {
      return json({ reply: finalText || "(no response)", actions });
    }

    apiMessages.push({ role: "assistant", content });
    const toolResults = [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const result = await executeTool(b, env, user.id, config, overrides, actions);
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
    }
    apiMessages.push({ role: "user", content: toolResults });
  }

  return json({ reply: finalText || "I stopped after several steps - could you rephrase?", actions });
}

async function executeTool(block, env, userId, config, overrides, actions) {
  const { name, input } = block;
  try {
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    // Cheap season-validity guard; the full day detail (task generation) is computed
    // lazily only by the tools that actually need the task list.
    const phase = getPhase(dt, config);
    if (!phase) return { error: `no plan for ${date} (outside the grow season)` };

    if (name === "get_day") {
      const detail = getDetail(dt, config, overrides);
      const checked = await readCheckoffs(env, userId, date);
      const userNote = await readNote(env, userId, date);
      return buildDayView(date, phase, detail, checked, userNote);
    }

    if (name === "set_tasks_done") {
      const indices = Array.isArray(input?.taskIndices)
        ? input.taskIndices.map(Number).filter(Number.isInteger) : null;
      if (!indices) return { error: "taskIndices must be an array of integers" };
      if (typeof input?.done !== "boolean") return { error: "done must be a boolean" };
      const detail = getDetail(dt, config, overrides);
      const inRange = indices.filter(i => i >= 0 && i < detail.tasks.length);
      const ignored = indices.filter(i => i < 0 || i >= detail.tasks.length);
      const current = await readCheckoffs(env, userId, date);
      const next = mergeChecked(current, inRange, input.done);
      await writeCheckoffs(env, userId, date, next);
      actions.push({ type: "set_tasks_done", date, summary: describeChecked(detail, inRange, input.done) });
      return { date, checked: next, ignored };
    }

    if (name === "append_note") {
      if (typeof input?.text !== "string" || input.text.trim() === "") {
        return { error: "text must be a non-empty string" };
      }
      const existing = await readNote(env, userId, date);
      const note = appendNoteText(existing, input.text);
      if (note.length > MAX_NOTE_LEN) return { error: "note would exceed the maximum length" };
      await writeNote(env, userId, date, note);
      actions.push({ type: "append_note", date, summary: `Added to ${date} note` });
      return { date, note };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    console.error("tool execution error", name, err);
    return { error: "tool failed to execute" };
  }
}

function describeChecked(detail, indices, done) {
  const verb = done ? "Marked done" : "Un-checked";
  if (indices.length === 1) {
    const t = detail.tasks[indices[0]] || "";
    return `${verb}: ${t.slice(0, 60)}`;
  }
  return `${verb} ${indices.length} tasks`;
}
