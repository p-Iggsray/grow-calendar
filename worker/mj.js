import { json, error } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";
import { runAnthropic } from "./providers/anthropic.js";
import { ProviderError } from "./providers/errors.js";

const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Provider routing. Task 4 sends non-admins to Gemini; for now everyone uses Claude.
export function pickModel(user, env) {
  return { provider: "anthropic", model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY };
}

export async function postMj(request, env, user) {
  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return error(400, "messages must be a non-empty array");
  }

  const { provider, model, apiKey } = pickModel(user, env);
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
  const systemSegments = [
    { text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache: true },
    { text: `Today's date is ${today}.`, cache: false },
  ];

  const actions = [];
  const executeToolUse = (name, input) => executeTool(name, input, env, user.id, config, overrides, actions);

  const run = runAnthropic; // Task 4 selects between providers
  try {
    const { reply } = await run({
      apiKey, model, systemSegments, tools: MJ_TOOLS, messages, executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
    });
    return json({ reply, actions });
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "quota") {
      return error(429, "MJ has hit today's limit, please try again later");
    }
    if (e instanceof ProviderError && e.kind === "unreachable") {
      return error(502, "could not reach the AI service");
    }
    console.error("MJ provider error", e);
    return error(502, "the AI service returned an error");
  }
}

async function executeTool(name, input, env, userId, config, overrides, actions) {
  try {
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
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
