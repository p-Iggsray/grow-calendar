// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail, getThreatsForPhase } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";
import { runGemini } from "./providers/gemini.js";
import { ProviderError } from "./providers/errors.js";
import { logError } from "./log.js";

const MAX_MSG_LEN = 4000;

function dateToYmd(dt) {
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function readCheckoffsInRange(env, userId, startDate, endDate) {
  const rows = await env.DB.prepare(
    "SELECT date, task_index FROM task_checkoffs WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date, task_index",
  ).bind(userId, startDate, endDate).all();
  const map = new Map();
  for (const r of rows.results ?? []) {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date).push(r.task_index);
  }
  return map;
}
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_PRO_MODEL = "gemini-2.5-pro";
// Max request body: one user message + contextDate field + JSON envelope.
const MAX_MJ_REQUEST_BYTES = MAX_MSG_LEN * 1.5 + 512;

// Number of conversation rows fetched for UI display.
const MAX_HISTORY_ROWS = 40;
// Number of messages passed to the AI as context (must be even so the window
// starts on a user turn after prepending the new user message).
const MAX_CONTEXT_MESSAGES = 20;

// Displayed ceilings for the usage bar.
// Flash: documented free-tier RPD for gemini-2.5-flash.
// Pro:   documented free-tier RPD for gemini-2.5-pro.
export const GEMINI_DAILY_LIMIT = 1500;
export const GEMINI_PRO_DAILY_LIMIT = 25;

// Per-user daily cap. Non-admin users are blocked once they hit this.
export const PER_USER_DAILY_CAP = 30;

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// Bumps both the per-user cap table and the per-model global table atomically.
async function bumpMjUsage(env, userId, today, model) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1",
    ).bind(userId, today),
    env.DB.prepare(
      "INSERT INTO mj_model_usage (model, date, count) VALUES (?, ?, 1) " +
      "ON CONFLICT(model, date) DO UPDATE SET count = count + 1",
    ).bind(model, today),
  ]);
}

// Global call count for one model today (for the usage bar display).
async function readMjModelUsage(env, today, model) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM mj_model_usage WHERE model = ? AND date = ?",
  ).bind(model, today).first();
  return Number(row?.count ?? 0);
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
  const [proCount, flashCount, userCount] = await Promise.all([
    readMjModelUsage(env, today, GEMINI_PRO_MODEL),
    readMjModelUsage(env, today, GEMINI_MODEL),
    readMjUsageForUser(env, user.id, today),
  ]);
  const userLimit = user.role === "admin" ? null : PER_USER_DAILY_CAP;
  return json({ date: today, proCount, proLimit: GEMINI_PRO_DAILY_LIMIT, flashCount, flashLimit: GEMINI_DAILY_LIMIT, userCount, userLimit });
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
  // --- Validate and gate before opening the stream ---
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

  // Per-user daily cap check. Bump happens inside the stream (on success) so
  // failed/quota-blocked calls don't count against the user's daily allowance.
  if (user.role !== "admin") {
    const userCount = await readMjUsageForUser(env, user.id, today);
    if (userCount >= PER_USER_DAILY_CAP) {
      return error(429, `You've used all ${PER_USER_DAILY_CAP} MJ messages for today. Resets at midnight ET.`);
    }
  }

  // Load everything needed before opening the stream so startup errors
  // become normal JSON 5xx responses rather than corrupt SSE frames.
  const history = await loadHistory(env, user.id, MAX_CONTEXT_MESSAGES - 1);
  const contextMessages = history.map(m => ({
    role: m.role,
    content: m.content.slice(0, MAX_MSG_LEN),
  }));
  const messages = [...contextMessages, { role: "user", content: userContent }];

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

  // Admin gets Pro first; falls back to Flash when free-tier quota is exhausted.
  const modelsToTry = user.role === "admin" ? [GEMINI_PRO_MODEL, GEMINI_MODEL] : [GEMINI_MODEL];

  // --- SSE stream ---
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const actions = [];
      const executeToolUse = (name, input) =>
        executeTool(name, input, env, user.id, config, overrides, actions);

      let reply = null;
      let modelUsed = null;
      try {
        for (const model of modelsToTry) {
          actions.length = 0;
          let quotaHit = false;
          try {
            ({ reply } = await runGemini({
              apiKey, model, systemSegments, tools: MJ_TOOLS, messages,
              executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
              onChunk: (delta) => send({ delta }),
            }));
            modelUsed = model;
          } catch (e) {
            if (e instanceof ProviderError && e.kind === "quota") {
              quotaHit = true;
            } else if (e instanceof ProviderError && e.kind === "unreachable") {
              send({ error: "Could not reach the AI service" });
              return;
            } else {
              logError("mj-provider", { kind: e?.kind, message: String(e?.message ?? e) });
              send({ error: "The AI service returned an error" });
              return;
            }
          }
          if (!quotaHit) break;
        }

        if (reply === null || modelUsed === null) {
          send({ error: "MJ has hit today's limit, please try again later" });
          return;
        }

        // Bump usage for the model that actually answered.
        await bumpMjUsage(env, user.id, today, modelUsed);
        await saveConversation(env, user.id, userContent, reply, actions);
        const [proCount, flashCount, userCount] = await Promise.all([
          readMjModelUsage(env, today, GEMINI_PRO_MODEL),
          readMjModelUsage(env, today, GEMINI_MODEL),
          readMjUsageForUser(env, user.id, today),
        ]);
        const userLimit = user.role === "admin" ? null : PER_USER_DAILY_CAP;
        send({ done: true, actions, usage: { date: today, proCount, proLimit: GEMINI_PRO_DAILY_LIMIT, flashCount, flashLimit: GEMINI_DAILY_LIMIT, userCount, userLimit } });
      } catch (e) {
        logError("mj-stream", { message: String(e?.message ?? e) });
        send({ error: "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      // Prevent nginx/CDN from buffering the stream before it reaches the client.
      "x-accel-buffering": "no",
    },
  });
}

async function executeTool(name, input, env, userId, config, overrides, actions) {
  try {
    // get_week uses start_date (not date) — handle before the shared date validation.
    if (name === "get_week") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const startDt = parseDate(startDate);
      const endDt = new Date(startDt);
      endDt.setDate(endDt.getDate() + 6);
      const endDate = dateToYmd(endDt);
      const checkoffMap = await readCheckoffsInRange(env, userId, startDate, endDate);
      const days = [];
      for (let i = 0; i < 7; i++) {
        const dt = new Date(startDt);
        dt.setDate(startDt.getDate() + i);
        const date = dateToYmd(dt);
        const phase = getPhase(dt, config);
        if (!phase) {
          days.push({ date, outside_season: true });
          continue;
        }
        const detail = getDetail(dt, config, overrides);
        const checked = checkoffMap.get(date) ?? [];
        const userNote = await readNote(env, userId, date);
        const threats = getThreatsForPhase(phase);
        const dayView = buildDayView(date, phase, detail, checked, userNote);
        if (threats.length > 0) dayView.threats = threats.map(t => t.title);
        days.push(dayView);
      }
      return { start_date: startDate, end_date: endDate, days };
    }

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
      actions.push({
        type: "set_tasks_done", date,
        summary: describeChecked(detail, inRange, input.done),
        undoPayload: { type: "set_tasks_done", date, taskIndices: inRange, done: !input.done },
      });
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
      actions.push({
        type: "append_note", date,
        summary: `Added to ${date} note`,
        undoPayload: { type: "undo_append_note", date, originalNote: existing ?? "" },
      });
      return { date, note };
    }

    if (name === "replace_note") {
      if (typeof input?.text !== "string") {
        return { error: "text must be a string" };
      }
      const text = input.text.trim();
      if (text.length > MAX_NOTE_LEN) return { error: "note text exceeds maximum length" };
      await writeNote(env, userId, date, text);
      actions.push({ type: "replace_note", date, summary: `Replaced ${date} note` });
      return { date, note: text };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    logError("mj-tool", { tool: name, message: String(err?.message ?? err) });
    return { error: "tool failed to execute" };
  }
}

export async function postMjUndo(request, env, user) {
  const parsed = await safeJsonBounded(request, 4096);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  const { type, date } = body ?? {};

  if (typeof date !== "string" || !DATE_RE.test(date)) return error(400, "date must be YYYY-MM-DD");

  if (type === "set_tasks_done") {
    const { taskIndices, done } = body;
    if (!Array.isArray(taskIndices) || typeof done !== "boolean") return error(400, "invalid undo payload");
    const raw = await loadRawPlan(env, user.id);
    const config = parseConfig(raw.config);
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return error(400, `no plan for ${date}`);
    const detail = getDetail(dt, config, raw.overrides);
    const inRange = taskIndices.map(Number).filter(i => Number.isInteger(i) && i >= 0 && i < detail.tasks.length);
    const current = await readCheckoffs(env, user.id, date);
    const next = mergeChecked(current, inRange, done);
    await writeCheckoffs(env, user.id, date, next);
    return json({ ok: true, checked: next });
  }

  if (type === "undo_append_note") {
    const { originalNote } = body;
    if (typeof originalNote !== "string") return error(400, "invalid undo payload");
    if (originalNote.length > MAX_NOTE_LEN) return error(400, "original note too long");
    await writeNote(env, user.id, date, originalNote);
    return json({ ok: true });
  }

  return error(400, "unknown undo type");
}

function describeChecked(detail, indices, done) {
  const verb = done ? "Marked done" : "Un-checked";
  if (indices.length === 1) {
    const t = detail.tasks[indices[0]] || "";
    return `${verb}: ${t.slice(0, 60)}`;
  }
  return `${verb} ${indices.length} tasks`;
}
