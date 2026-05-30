// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";
import { runGemini } from "./providers/gemini.js";
import { ProviderError } from "./providers/errors.js";
import { logError } from "./log.js";

const MAX_MSG_LEN = 4000;
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GEMINI_MODEL = "gemini-2.5-flash";
// Max request body: one user message + contextDate field + JSON envelope.
const MAX_MJ_REQUEST_BYTES = MAX_MSG_LEN * 1.5 + 512;

// Number of conversation rows fetched for UI display.
const MAX_HISTORY_ROWS = 40;
// Number of messages passed to the AI as context (must be even so the window
// starts on a user turn after prepending the new user message).
const MAX_CONTEXT_MESSAGES = 20;

// Displayed ceiling for the usage bar. Matches the documented Gemini API free
// tier daily request limit for gemini-2.5-flash. Bump if Google changes it.
export const GEMINI_DAILY_LIMIT = 1500;

// Per-user daily cap. Non-admin users are blocked once they hit this.
export const PER_USER_DAILY_CAP = 30;

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

async function bumpMjUsage(env, userId, today) {
  await env.DB.prepare(
    "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1",
  ).bind(userId, today).run();
}

async function readMjUsageTotal(env, today) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(SUM(count), 0) AS total FROM mj_usage WHERE date = ?",
  ).bind(today).first();
  return Number(row?.total ?? 0);
}

async function readMjUsageForUser(env, userId, today) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM mj_usage WHERE user_id = ? AND date = ?",
  ).bind(userId, today).first();
  return Number(row?.count ?? 0);
}

async function loadHistory(env, userId, limit) {
  const rows = await env.DB.prepare(
    "SELECT role, content, actions FROM mj_conversations WHERE user_id = ? ORDER BY id DESC LIMIT ?",
  ).bind(userId, limit).all();
  // Rows come back newest-first; reverse so oldest is first.
  return (rows.results ?? []).reverse().map(r => ({
    role: r.role,
    content: r.content,
    actions: r.actions ? JSON.parse(r.actions) : undefined,
  }));
}

async function saveConversation(env, userId, userContent, assistantContent, actions) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, role, content) VALUES (?, 'user', ?)",
    ).bind(userId, userContent),
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, role, content, actions) VALUES (?, 'assistant', ?, ?)",
    ).bind(userId, assistantContent, actions.length > 0 ? JSON.stringify(actions) : null),
  ]);
}

export async function getMjUsage(env, user) {
  const today = todayInET();
  const [count, userCount] = await Promise.all([
    readMjUsageTotal(env, today),
    readMjUsageForUser(env, user.id, today),
  ]);
  return json({ date: today, count, limit: GEMINI_DAILY_LIMIT, userCount, userLimit: PER_USER_DAILY_CAP });
}

export async function getMjHistory(env, user) {
  const history = await loadHistory(env, user.id, MAX_HISTORY_ROWS);
  return json({ history });
}

export async function deleteMjHistory(env, user) {
  await env.DB.prepare("DELETE FROM mj_conversations WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true });
}

export async function postMj(request, env, user) {
  const parsed = await safeJsonBounded(request, MAX_MJ_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  const userContent = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userContent) return error(400, "message must be a non-empty string");
  if (userContent.length > MAX_MSG_LEN) return error(400, "message too long");

  const contextDate =
    typeof body?.contextDate === "string" && DATE_RE.test(body.contextDate)
      ? body.contextDate : null;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "MJ is not configured yet");

  const today = todayInET();

  // Per-user daily cap: check before bumping so we don't charge a blocked call.
  if (user.role !== "admin") {
    const userCount = await readMjUsageForUser(env, user.id, today);
    if (userCount >= PER_USER_DAILY_CAP) {
      return error(429, `You've used all ${PER_USER_DAILY_CAP} MJ messages for today. Resets at midnight ET.`);
    }
  }

  await bumpMjUsage(env, user.id, today);

  // Build AI context from persisted history (most recent MAX_CONTEXT_MESSAGES - 1
  // messages) plus the new user message at the end.
  const history = await loadHistory(env, user.id, MAX_CONTEXT_MESSAGES - 1);
  const contextMessages = history.map(m => ({
    role: m.role,
    content: m.content.slice(0, MAX_MSG_LEN),
  }));
  const messages = [...contextMessages, { role: "user", content: userContent }];

  // Last message must be from user (history could end on assistant).
  // The messages array always ends with the new user message so this is guaranteed.

  const raw = await loadRawPlan(env, user.id);
  const config = parseConfig(raw.config);
  const overrides = raw.overrides;

  const systemSegments = [
    { text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache: true },
    { text: `Today's date is ${today}.`, cache: false },
  ];
  if (contextDate) {
    systemSegments.push({ text: `The grower currently has ${contextDate} open in the app.`, cache: false });
  }

  const actions = [];
  const executeToolUse = (name, input) => executeTool(name, input, env, user.id, config, overrides, actions);

  try {
    const { reply } = await runGemini({
      apiKey, model: GEMINI_MODEL, systemSegments, tools: MJ_TOOLS, messages, executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
    });
    await saveConversation(env, user.id, userContent, reply, actions);
    const [count, userCount] = await Promise.all([
      readMjUsageTotal(env, today),
      readMjUsageForUser(env, user.id, today),
    ]);
    return json({ reply, actions, usage: { date: today, count, limit: GEMINI_DAILY_LIMIT, userCount, userLimit: PER_USER_DAILY_CAP } });
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "quota") {
      return error(429, "MJ has hit today's limit, please try again later");
    }
    if (e instanceof ProviderError && e.kind === "unreachable") {
      return error(502, "could not reach the AI service");
    }
    logError("mj-provider", { kind: e?.kind, message: String(e?.message ?? e) });
    return error(502, "the AI service returned an error");
  }
}

async function executeTool(name, input, env, userId, config, overrides, actions) {
  try {
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    // Validate the date via a cheap season check; full day detail is computed
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
    logError("mj-tool", { tool: name, message: String(err?.message ?? err) });
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
