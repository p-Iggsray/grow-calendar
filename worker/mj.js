// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { loadRawGrow, loadRawGrows } from "./grows.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail, getThreatsForPhase, PHASES } from "../src/lib/growData.js";
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

const MAX_TOOL_ITERATIONS = 8;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_PRO_MODEL = "gemini-2.5-pro";
const MAX_MJ_REQUEST_BYTES = MAX_MSG_LEN * 1.5 + 512;

const MAX_HISTORY_ROWS = 40;
const MAX_CONTEXT_MESSAGES = 20;

export const GEMINI_DAILY_LIMIT = 1500;
export const GEMINI_PRO_DAILY_LIMIT = 25;
export const PER_USER_DAILY_CAP = 50;

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

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

// ─── Context builders ─────────────────────────────────────────────────────────

async function buildGrowLogContext(env, userId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const res = await env.DB.prepare(
    `SELECT date, water_gal, feed, temp_high, temp_low, humidity
     FROM grow_log
     WHERE user_id = ? AND date >= ?
     ORDER BY date DESC`
  ).bind(userId, cutoffStr).all();

  const rows = res.results ?? [];
  if (rows.length === 0) return "RECENT GROW LOG (last 14 days): No entries recorded yet.";

  const lines = ["RECENT GROW LOG (last 14 days):"];
  for (const r of rows) {
    const parts = [];
    if (r.water_gal != null) parts.push(`${r.water_gal} gal water`);
    if (r.temp_high != null || r.temp_low != null) {
      parts.push(`temp ${r.temp_high ?? "?"}°/${r.temp_low ?? "?"}°F`);
    }
    if (r.humidity != null) parts.push(`${r.humidity}% RH`);
    if (r.feed) parts.push(`feed: ${r.feed}`);
    lines.push(`  ${r.date}: ${parts.length > 0 ? parts.join(", ") : "(no fields logged)"}`);
  }
  return lines.join("\n");
}

async function buildWeatherContext(env) {
  try {
    // Read from cache directly — avoid importing getWeather which returns a Response.
    const row = await env.DB.prepare(
      "SELECT value, updated_at FROM weather_cache WHERE key LIKE 'weather:hourly:%' LIMIT 1"
    ).first();
    const alertRow = await env.DB.prepare(
      "SELECT value FROM weather_cache WHERE key LIKE 'weather:alerts:%' LIMIT 1"
    ).first();

    const lines = ["CURRENT WEATHER (Athens, OH):"];
    if (row?.value) {
      try {
        const { periods, highLow } = JSON.parse(row.value);
        if (highLow?.high != null || highLow?.low != null) {
          lines.push(`  Forecast today: High ${highLow.high ?? "?"}°F, Low ${highLow.low ?? "?"}°F`);
        }
        const current = periods?.[0];
        if (current) {
          lines.push(`  Now: ${current.temp}°F — ${current.shortForecast}`);
        }
        const next = periods?.slice(1, 4);
        if (next?.length) {
          const nexts = next.map(p => `${p.temp}°F (${p.shortForecast})`).join(" → ");
          lines.push(`  Next ${next.length}h: ${nexts}`);
        }
      } catch { /* corrupt cache */ }
    }
    if (alertRow?.value) {
      try {
        const alerts = JSON.parse(alertRow.value);
        if (alerts.length > 0) {
          lines.push(`  ⚠ ACTIVE ALERTS:`);
          for (const a of alerts.slice(0, 3)) {
            lines.push(`    - ${a.event}: ${a.headline || a.severity}`);
          }
        }
      } catch { /* corrupt cache */ }
    }
    if (lines.length === 1) lines.push("  (no recent weather data — cache may be cold)");
    return lines.join("\n");
  } catch {
    return "CURRENT WEATHER: unavailable";
  }
}

async function buildStatsContext(env, userId) {
  try {
    const [logRow, checkoffRow] = await Promise.all([
      env.DB.prepare(`
        SELECT
          ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
          COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days,
          COUNT(*) AS log_days
        FROM grow_log WHERE user_id = ?
      `).bind(userId).first(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done
        FROM task_checkoffs WHERE user_id = ?
      `).bind(userId).first(),
    ]);

    const lines = ["SEASON STATS:"];
    if (logRow) {
      lines.push(`  Total water logged: ${logRow.total_water ?? 0} gal over ${logRow.log_days ?? 0} days`);
      lines.push(`  Feed days recorded: ${logRow.feed_days ?? 0}`);
    }
    if (checkoffRow && Number(checkoffRow.total) > 0) {
      const total = Number(checkoffRow.total);
      const done  = Number(checkoffRow.done ?? 0);
      const pct   = Math.round((done / total) * 100);
      lines.push(`  Tasks completed: ${done}/${total} (${pct}%)`);
    }
    return lines.join("\n");
  } catch {
    return "";
  }
}

function buildSupplyContext(survey) {
  if (!survey?.supplies) return "";
  const LABELS = {
    soil: "potting mix", perlite: "perlite", containers: "containers/pots",
    calmag: "Cal-Mag", veg_nutes: "veg nutrients", bloom_nutes: "bloom nutrients",
    bloom_boost: "bloom booster", ph_kit: "pH kit", tds_meter: "TDS/EC meter",
    support: "stakes/trellis", ties: "plant ties", watering: "watering can/irrigation",
    loupe: "jeweler's loupe", humidity: "hygrometer", drying: "drying space",
    jars: "mason jars", neem: "pest preventative",
  };
  const have = [];
  const need = [];
  for (const [id, status] of Object.entries(survey.supplies)) {
    const label = LABELS[id] || id;
    if (status === "have") have.push(label);
    else if (status === "need_to_order") need.push(label);
  }
  if (have.length === 0 && need.length === 0) return "";
  const lines = ["GROWER'S SUPPLIES:"];
  if (have.length > 0) lines.push(`  On hand: ${have.join(", ")}`);
  if (need.length > 0) lines.push(`  Still need to order: ${need.join(", ")}`);
  return lines.join("\n");
}

function buildGrowsContext(grows, activeGrowId) {
  if (!grows || grows.length <= 1) return "";
  const lines = ["ALL GROWER'S GROWS:"];
  for (const g of grows) {
    const isActive = g.id === activeGrowId;
    const strains = g.generatedPlan?.strains?.map(s => s.name).filter(Boolean).join(" × ")
      || g.survey?.strains?.map(s => s.name).filter(Boolean).join(" × ")
      || "";
    const statusLabel = g.status === "active" ? "active" : g.status;
    lines.push(`  - "${g.displayName}" [${statusLabel}]${strains ? ` — ${strains}` : ""}${isActive ? " ← ACTIVE GROW (calendar context)" : ""}`);
  }
  lines.push("When asked about a specific grow other than the active one, acknowledge which one you're discussing.");
  return lines.join("\n");
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
  const parsed = await safeJsonBounded(request, MAX_MJ_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  const userContent = typeof body?.message === "string" ? body.message.trim() : "";
  if (!userContent) return error(400, "message must be a non-empty string");
  if (userContent.length > MAX_MSG_LEN) return error(400, "message too long");

  const contextDate =
    typeof body?.contextDate === "string" && DATE_RE.test(body.contextDate)
      ? body.contextDate : null;

  const activeGrowId =
    typeof body?.activeGrowId === "string" && body.activeGrowId.length > 0
      ? body.activeGrowId : null;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "MJ is not configured yet");

  const today = todayInET();

  if (user.role !== "admin") {
    const userCount = await readMjUsageForUser(env, user.id, today);
    if (userCount >= PER_USER_DAILY_CAP) {
      return error(429, `You've used all ${PER_USER_DAILY_CAP} MJ messages for today. Resets at midnight ET.`);
    }
  }

  const history = await loadHistory(env, user.id, MAX_CONTEXT_MESSAGES - 1);
  const contextMessages = history.map(m => ({
    role: m.role,
    content: m.content.slice(0, MAX_MSG_LEN),
  }));
  const messages = [...contextMessages, { role: "user", content: userContent }];

  // Load the active grow — prefer the grows table, fall back to plan_config.
  let raw;
  if (activeGrowId) {
    raw = await loadRawGrow(env, user.id, activeGrowId);
  }
  if (!raw) {
    raw = await loadRawPlan(env, user.id);
  }
  if (raw.needsSetup) return error(400, "Complete your grow setup before using MJ.");

  const config = parseConfig(raw.config);
  const overrides = raw.overrides;
  const phaseOverrides = raw.phaseOverrides;

  // Load all rich context in parallel.
  const [grows, growLogContext, weatherContext, statsContext] = await Promise.all([
    loadRawGrows(env, user.id).catch(() => []),
    buildGrowLogContext(env, user.id),
    buildWeatherContext(env),
    buildStatsContext(env, user.id),
  ]);

  const supplyContext  = buildSupplyContext(raw.survey);
  const growsContext   = buildGrowsContext(grows, activeGrowId);

  // Assemble system prompt segments.
  const planText  = buildPlanText(config, overrides, raw.generatedPlan, phaseOverrides);
  const baseBlock = [MJ_PERSONA, "", planText, "", supplyContext].filter(s => s !== "").join("\n");

  const dynamicParts = [
    growsContext,
    growLogContext,
    weatherContext,
    statsContext,
    `Today's date is ${today}.`,
    contextDate ? `The grower currently has ${contextDate} open in the app.` : "",
  ].filter(Boolean).join("\n\n");

  const systemSegments = [
    { text: baseBlock,     cache: false },
    { text: dynamicParts,  cache: false },
  ];

  const modelsToTry = user.role === "admin" ? [GEMINI_PRO_MODEL, GEMINI_MODEL] : [GEMINI_MODEL];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const actions = [];
      const executeToolUse = (name, input) =>
        executeTool(name, input, env, user.id, config, overrides, raw.generatedPlan, phaseOverrides, actions);

      let reply = null;
      let modelUsed = null;
      try {
        for (const model of modelsToTry) {
          actions.length = 0;
          let tryNext = false;
          try {
            ({ reply } = await runGemini({
              apiKey, model, systemSegments, tools: MJ_TOOLS, messages,
              executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
              onChunk: (delta) => send({ delta }),
              gatewayBase: env.CF_AI_GATEWAY_URL ?? null,
              userId: user.id,
            }));
            modelUsed = model;
          } catch (e) {
            if (e instanceof ProviderError && e.kind === "unreachable") {
              send({ error: "Could not reach the AI service" });
              return;
            }
            tryNext = true;
            logError("mj-fallback", { from: model, kind: e?.kind, message: String(e?.message ?? e) });
          }
          if (!tryNext) break;
        }

        if (reply === null || modelUsed === null) {
          send({ error: "MJ has hit today's limit, please try again later" });
          return;
        }

        await bumpMjUsage(env, user.id, today, modelUsed);
        await saveConversation(env, user.id, userContent, reply, actions);
        const [proCount, flashCount, userCount] = await Promise.all([
          readMjModelUsage(env, today, GEMINI_PRO_MODEL),
          readMjModelUsage(env, today, GEMINI_MODEL),
          readMjUsageForUser(env, user.id, today),
        ]);
        const userLimit = user.role === "admin" ? null : PER_USER_DAILY_CAP;
        send({ done: true, actions, modelUsed, usage: { date: today, proCount, proLimit: GEMINI_PRO_DAILY_LIMIT, flashCount, flashLimit: GEMINI_DAILY_LIMIT, userCount, userLimit } });
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
      "x-accel-buffering": "no",
    },
  });
}

async function executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions) {
  try {
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
        const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides);
        const checked = checkoffMap.get(date) ?? [];
        const userNote = await readNote(env, userId, date);
        const threats = getThreatsForPhase(phase, generatedPlan);
        const dayView = buildDayView(date, phase, detail, checked, userNote);
        if (threats.length > 0) dayView.threats = threats.map(t => t.title);
        days.push(dayView);
      }
      return { start_date: startDate, end_date: endDate, days };
    }

    if (name === "get_grow_log") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const endDate = typeof input?.end_date === "string" && DATE_RE.test(input.end_date)
        ? input.end_date : startDate;

      const res = await env.DB.prepare(
        `SELECT date, water_gal, feed, temp_high, temp_low, humidity
         FROM grow_log
         WHERE user_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC`
      ).bind(userId, startDate, endDate).all();

      const entries = (res.results ?? []).map(r => ({
        date:      r.date,
        water_gal: r.water_gal ?? null,
        temp_high: r.temp_high ?? null,
        temp_low:  r.temp_low  ?? null,
        humidity:  r.humidity  ?? null,
        feed:      r.feed      ?? null,
      }));
      return { start_date: startDate, end_date: endDate, entries };
    }

    if (name === "log_grow_data") {
      const date = input?.date;
      if (typeof date !== "string" || !DATE_RE.test(date)) {
        return { error: "date must be YYYY-MM-DD" };
      }

      function toNum(v) {
        if (v === null || v === undefined) return null;
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : null;
      }
      function toStr(v) {
        if (!v || typeof v !== "string") return null;
        return v.trim().slice(0, 500) || null;
      }

      const water_gal = toNum(input.water_gal);
      const temp_high = toNum(input.temp_high);
      const temp_low  = toNum(input.temp_low);
      const humidity  = toNum(input.humidity);
      const feed      = toStr(input.feed);

      await env.DB.prepare(`
        INSERT INTO grow_log (user_id, date, water_gal, feed, temp_high, temp_low, humidity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, date) DO UPDATE SET
          water_gal  = COALESCE(excluded.water_gal,  grow_log.water_gal),
          feed       = COALESCE(excluded.feed,       grow_log.feed),
          temp_high  = COALESCE(excluded.temp_high,  grow_log.temp_high),
          temp_low   = COALESCE(excluded.temp_low,   grow_log.temp_low),
          humidity   = COALESCE(excluded.humidity,   grow_log.humidity),
          updated_at = excluded.updated_at
      `).bind(userId, date, water_gal, feed, temp_high, temp_low, humidity).run();

      actions.push({
        type: "log_grow_data",
        date,
        summary: buildLogSummary(date, water_gal, temp_high, temp_low, humidity, feed),
        undoPayload: null, // grow log writes are not undoable via the undo system
      });

      return {
        ok: true,
        date,
        logged: { water_gal, temp_high, temp_low, humidity, feed },
      };
    }

    // All remaining tools require a date + season check
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return { error: `no plan for ${date} (outside the grow season)` };

    if (name === "get_day") {
      const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides);
      const checked = await readCheckoffs(env, userId, date);
      const userNote = await readNote(env, userId, date);
      const phaseInfo = PHASES[phase] ?? {};
      return { ...buildDayView(date, phase, detail, checked, userNote), phaseLabel: phaseInfo.label ?? phase };
    }

    if (name === "set_tasks_done") {
      const indices = Array.isArray(input?.taskIndices)
        ? input.taskIndices.map(Number).filter(Number.isInteger) : null;
      if (!indices) return { error: "taskIndices must be an array of integers" };
      if (typeof input?.done !== "boolean") return { error: "done must be a boolean" };
      const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides);
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
    if (raw.needsSetup) return error(400, "no plan configured");
    const config = parseConfig(raw.config);
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return error(400, `no plan for ${date}`);
    const detail = getDetail(dt, config, raw.overrides, raw.generatedPlan, raw.phaseOverrides);
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

function buildLogSummary(date, water_gal, temp_high, temp_low, humidity, feed) {
  const parts = [];
  if (water_gal != null) parts.push(`${water_gal} gal water`);
  if (temp_high != null || temp_low != null) parts.push(`temp ${temp_high ?? "?"}°/${temp_low ?? "?"}°F`);
  if (humidity != null) parts.push(`${humidity}% RH`);
  if (feed) parts.push(`fed: ${feed.slice(0, 40)}`);
  return `Logged ${date}: ${parts.join(", ") || "(no fields)"}`;
}
