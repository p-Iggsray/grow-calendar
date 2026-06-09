// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { loadRawGrow, loadRawGrows } from "./grows.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail, getThreatsForPhase, PHASES } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { growLocation, strainSummary } from "../src/lib/growProfile.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { ensureGrowLogSchema } from "./growLog.js";
import { firstGrowId } from "./perDayScope.js";
import { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, PER_USER_DAILY_CAP } from "./limits.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView, VALID_GROW_PHASES, VALID_CONFIG_DATE_KEYS } from "./mj-logic.js";
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

async function readCheckoffsInRange(env, userId, growId, startDate, endDate) {
  const rows = await env.DB.prepare(
    "SELECT date, task_index FROM task_checkoffs WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ? ORDER BY date, task_index",
  ).bind(userId, growId, startDate, endDate).all();
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
// 4 MB to accommodate base64-encoded photos (~1.5 MB compressed image ≈ 2 MB base64)
const MAX_MJ_REQUEST_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_B64_LEN = 3_000_000; // ~2.25 MB actual after decode

const MAX_HISTORY_ROWS = 40;
const MAX_CONTEXT_MESSAGES = 20;

export { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, PER_USER_DAILY_CAP };

function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// Increment the per-user daily counter and return the new value, so a cap can
// be enforced atomically (reserve-before-call) rather than racily.
async function bumpUserUsage(env, userId, today) {
  const row = await env.DB.prepare(
    "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(userId, today).first();
  return Number(row?.count ?? 1);
}

// Increment the global per-model counter (shared across all users).
async function bumpModelUsage(env, model, today) {
  await env.DB.prepare(
    "INSERT INTO mj_model_usage (model, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(model, date) DO UPDATE SET count = count + 1",
  ).bind(model, today).run();
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

// Lazily add grow_id column + index so existing deployments migrate automatically.
async function ensureMjThreadSchema(env) {
  try {
    await env.DB.prepare("ALTER TABLE mj_conversations ADD COLUMN grow_id TEXT").run();
  } catch { /* column already exists — normal */ }
  try {
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_mj_conv_user_grow ON mj_conversations(user_id, grow_id, id DESC)"
    ).run();
  } catch { /* index already exists */ }
}

// growId = null → general thread (grow_id IS NULL); string → grow-specific thread
async function loadHistory(env, userId, limit, growId) {
  const rows = await env.DB.prepare(
    growId
      ? "SELECT role, content, actions FROM mj_conversations WHERE user_id = ? AND grow_id = ? ORDER BY id DESC LIMIT ?"
      : "SELECT role, content, actions FROM mj_conversations WHERE user_id = ? AND grow_id IS NULL ORDER BY id DESC LIMIT ?",
  ).bind(...(growId ? [userId, growId, limit] : [userId, limit])).all();
  return (rows.results ?? []).reverse().map(r => ({
    role: r.role,
    content: r.content,
    actions: r.actions ? JSON.parse(r.actions) : undefined,
  }));
}

async function saveConversation(env, userId, growId, userContent, assistantContent, actions) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, grow_id, role, content) VALUES (?, ?, 'user', ?)",
    ).bind(userId, growId ?? null, userContent),
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, grow_id, role, content, actions) VALUES (?, ?, 'assistant', ?, ?)",
    ).bind(userId, growId ?? null, assistantContent, actions.length > 0 ? JSON.stringify(actions) : null),
  ]);
}

// ─── Context builders ─────────────────────────────────────────────────────────

async function buildGrowLogContext(env, userId, growId) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const res = await env.DB.prepare(
    `SELECT date, water_gal, feed, temp_high, temp_low, humidity
     FROM grow_log
     WHERE user_id = ? AND grow_id = ? AND date >= ?
     ORDER BY date DESC`
  ).bind(userId, growId, cutoffStr).all();

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

async function buildStatsContext(env, userId, growId) {
  try {
    const [logRow, checkoffRow] = await Promise.all([
      env.DB.prepare(`
        SELECT
          ROUND(COALESCE(SUM(water_gal), 0), 2) AS total_water,
          COUNT(CASE WHEN feed IS NOT NULL AND feed != '' THEN 1 END) AS feed_days,
          COUNT(*) AS log_days
        FROM grow_log WHERE user_id = ? AND grow_id = ?
      `).bind(userId, growId).first(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS done
        FROM task_checkoffs WHERE user_id = ? AND grow_id = ?
      `).bind(userId, growId).first(),
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

export async function getMjHistory(request, env, user) {
  await ensureMjThreadSchema(env);
  const growId = new URL(request.url).searchParams.get("growId") || null;
  const history = await loadHistory(env, user.id, MAX_HISTORY_ROWS, growId);
  return json({ history });
}

export async function deleteMjHistory(request, env, user) {
  await ensureMjThreadSchema(env);
  const growId = new URL(request.url).searchParams.get("growId") || null;
  if (growId) {
    await env.DB.prepare("DELETE FROM mj_conversations WHERE user_id = ? AND grow_id = ?")
      .bind(user.id, growId).run();
  } else {
    await env.DB.prepare("DELETE FROM mj_conversations WHERE user_id = ? AND grow_id IS NULL")
      .bind(user.id).run();
  }
  return json({ ok: true });
}

export async function postMj(request, env, user) {
  const parsed = await safeJsonBounded(request, MAX_MJ_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;

  const userContent = typeof body?.message === "string" ? body.message.trim() : "";
  const hasImage = body?.imageData?.data && typeof body.imageData.data === "string";
  if (!userContent && !hasImage) return error(400, "message or imageData required");
  if (userContent.length > MAX_MSG_LEN) return error(400, "message too long");

  // Validate image if provided.
  let imageData = null;
  if (hasImage) {
    const { data, mimeType } = body.imageData;
    if (typeof mimeType !== "string" || !mimeType.startsWith("image/"))
      return error(400, "imageData.mimeType must be an image/* type");
    if (data.length > MAX_IMAGE_B64_LEN)
      return error(413, "image too large — please use a smaller photo");
    imageData = { data, mimeType };
  }

  const contextDate =
    typeof body?.contextDate === "string" && DATE_RE.test(body.contextDate)
      ? body.contextDate : null;

  const activeGrowId =
    typeof body?.activeGrowId === "string" && body.activeGrowId.length > 0
      ? body.activeGrowId : null;

  // threadGrowId scopes the conversation history (null = general thread).
  const threadGrowId =
    typeof body?.threadGrowId === "string" && body.threadGrowId.length > 0
      ? body.threadGrowId : null;

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "MJ is not configured yet");

  const today = todayInET();

  // Fail fast (no increment) so a capped user doesn't trigger context-building
  // work. The shared global flash ceiling is enforced here too — previously it
  // relied entirely on Google returning 429.
  if (user.role !== "admin") {
    const [flashGlobal, userCount] = await Promise.all([
      readMjModelUsage(env, today, GEMINI_MODEL),
      readMjUsageForUser(env, user.id, today),
    ]);
    if (flashGlobal >= GEMINI_DAILY_LIMIT) {
      return error(429, "MJ has reached today's shared limit. Try again after midnight ET.");
    }
    if (userCount >= PER_USER_DAILY_CAP) {
      return error(429, `You've used all ${PER_USER_DAILY_CAP} MJ messages for today. Resets at midnight ET.`);
    }
  }

  await ensureMjThreadSchema(env);
  const history = await loadHistory(env, user.id, MAX_CONTEXT_MESSAGES - 1, threadGrowId);
  const contextMessages = history.map(m => ({
    role: m.role,
    content: m.content.slice(0, MAX_MSG_LEN),
  }));
  const currentMsg = { role: "user", content: userContent };
  if (imageData) {
    currentMsg.imageParts = [{ inlineData: { mimeType: imageData.mimeType, data: imageData.data } }];
  }
  const messages = [...contextMessages, currentMsg];

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

  // Per-day data is grow-scoped; fall back to the user's first grow when the
  // request didn't carry an explicit active grow.
  const dayGrowId = activeGrowId ?? await firstGrowId(env, user.id);

  // Load all rich context in parallel.
  const [grows, growLogContext, weatherContext, statsContext] = await Promise.all([
    loadRawGrows(env, user.id).catch(() => []),
    buildGrowLogContext(env, user.id, dayGrowId),
    buildWeatherContext(env),
    buildStatsContext(env, user.id, dayGrowId),
  ]);

  const supplyContext  = buildSupplyContext(raw.survey);
  const growsContext   = buildGrowsContext(grows, activeGrowId);

  // Per-grow profile (location + plant counts) so MJ tailors advice without
  // a tool call. Replaces the old hardcoded location in the persona.
  const profileParts = [
    growLocation(raw.survey) ? `Location: ${growLocation(raw.survey)}` : "",
    strainSummary(raw.survey, raw.generatedPlan) ? `Plants: ${strainSummary(raw.survey, raw.generatedPlan)}` : "",
  ].filter(Boolean);
  const growProfile = profileParts.length ? `Active grow profile — ${profileParts.join(" · ")}.` : "";

  // Assemble system prompt segments.
  const planText  = buildPlanText(config, overrides, raw.generatedPlan, phaseOverrides);
  const baseBlock = [MJ_PERSONA, "", planText, "", supplyContext].filter(s => s !== "").join("\n");

  const dynamicParts = [
    growProfile,
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

  // Reserve the per-user slot atomically right before the (expensive) model
  // call so concurrent requests can't all slip past the cap, and so a failed
  // call still counts against abuse rather than being free to retry.
  if (user.role !== "admin") {
    const reserved = await bumpUserUsage(env, user.id, today);
    if (reserved > PER_USER_DAILY_CAP) {
      return error(429, `You've used all ${PER_USER_DAILY_CAP} MJ messages for today. Resets at midnight ET.`);
    }
  }

  const modelsToTry = user.role === "admin" ? [GEMINI_PRO_MODEL, GEMINI_MODEL] : [GEMINI_MODEL];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const actions = [];
      const executeToolUse = (name, input) =>
        executeTool(name, input, env, user.id, config, overrides, raw.generatedPlan, phaseOverrides, actions, activeGrowId, raw);

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

        await bumpModelUsage(env, modelUsed, today);
        await saveConversation(env, user.id, threadGrowId, userContent, reply, actions);
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

async function executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions, growId, rawGrow) {
  // Per-day reads/writes are grow-scoped; fall back to the user's first grow
  // when no active grow was supplied. (Grow-editing tools below keep using the
  // raw `growId` so their "no active grow" guards still apply.)
  const dayGrowId = growId ?? await firstGrowId(env, userId);
  try {
    if (name === "get_grow_info") {
      if (!growId || !rawGrow) return { error: "No active grow selected. Tap a grow in the Plan tab first." };
      const strains =
        rawGrow.generatedPlan?.strains?.map(s => s.name).filter(Boolean) ??
        rawGrow.survey?.strains?.map(s => s.name).filter(Boolean) ?? [];
      const phasesWithOverrides = Object.keys(rawGrow.phaseOverrides ?? {});
      return {
        displayName: rawGrow.displayName,
        status: rawGrow.status,
        strains,
        location: rawGrow.survey?.location ?? null,
        configDates: rawGrow.config ?? {},
        phasesWithOverrides,
        growId,
      };
    }

    if (name === "update_grow_info") {
      if (!growId) return { error: "No active grow selected." };
      const fields = [];
      const binds = [];
      if (typeof input.display_name === "string" && input.display_name.trim()) {
        fields.push("display_name = ?");
        binds.push(input.display_name.trim().slice(0, 100));
      }
      if (["active", "harvested", "abandoned"].includes(input.status)) {
        fields.push("status = ?");
        binds.push(input.status);
      }
      if (fields.length === 0) return { error: "No valid fields to update." };
      fields.push("updated_at = ?");
      binds.push(new Date().toISOString(), growId, userId);
      await env.DB.prepare(
        `UPDATE grows SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`
      ).bind(...binds).run();
      const parts = [];
      if (input.display_name) parts.push(`renamed to "${input.display_name.trim()}"`);
      if (input.status) parts.push(`status → ${input.status}`);
      actions.push({ type: "update_grow_info", summary: `Grow ${parts.join(", ")}`, undoPayload: null });
      return { ok: true };
    }

    if (name === "update_grow_dates") {
      if (!growId || !rawGrow?.config) return { error: "No active grow or config found." };
      const patches = input?.patches;
      if (!patches || typeof patches !== "object" || Array.isArray(patches)) {
        return { error: "patches must be an object mapping config key → YYYY-MM-DD date string." };
      }
      const updated = {};
      for (const [key, val] of Object.entries(patches)) {
        if (!VALID_CONFIG_DATE_KEYS.has(key)) return { error: `Unknown config key: "${key}"` };
        if (typeof val !== "string" || !DATE_RE.test(val)) return { error: `${key}: value must be YYYY-MM-DD` };
        updated[key] = val;
      }
      const newConfig = { ...rawGrow.config, ...updated };
      await env.DB.prepare(
        "UPDATE grows SET config = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(newConfig), new Date().toISOString(), growId, userId).run();
      const changeList = Object.entries(updated)
        .map(([k, v]) => `${k}: ${rawGrow.config[k] ?? "none"} → ${v}`)
        .join(", ");
      actions.push({ type: "update_grow_dates", summary: `Updated: ${changeList}`, undoPayload: null });
      return { ok: true, updated };
    }

    if (name === "update_phase_tasks") {
      if (!growId) return { error: "No active grow selected." };
      const phase = input?.phase;
      if (typeof phase !== "string" || !VALID_GROW_PHASES.has(phase)) {
        return { error: `Invalid phase "${phase}". Valid: ${[...VALID_GROW_PHASES].join(", ")}` };
      }
      const tasks = input?.tasks ?? null;
      const phaseRow = await env.DB.prepare(
        "SELECT phase_overrides FROM grows WHERE id = ? AND user_id = ?"
      ).bind(growId, userId).first();
      if (!phaseRow) return { error: "Grow not found." };
      let currentOverrides = {};
      try { currentOverrides = phaseRow.phase_overrides ? JSON.parse(phaseRow.phase_overrides) : {}; } catch { /* start clean */ }
      if (tasks === null || (Array.isArray(tasks) && tasks.length === 0)) {
        delete currentOverrides[phase];
      } else if (Array.isArray(tasks)) {
        const cleaned = tasks.map(t => String(t).trim()).filter(Boolean);
        currentOverrides[phase] = { ...(currentOverrides[phase] ?? {}), tasks: cleaned };
      } else {
        return { error: "tasks must be an array of strings or null to clear." };
      }
      await env.DB.prepare(
        "UPDATE grows SET phase_overrides = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(currentOverrides), new Date().toISOString(), growId, userId).run();
      const summary = tasks?.length
        ? `Updated ${phase} tasks (${tasks.length} task${tasks.length === 1 ? "" : "s"})`
        : `Cleared ${phase} task overrides — defaults restored`;
      actions.push({ type: "update_phase_tasks", summary, undoPayload: null });
      return { ok: true, phase, taskCount: tasks?.length ?? 0 };
    }

    if (name === "get_week") {
      const startDate = input?.start_date;
      if (typeof startDate !== "string" || !DATE_RE.test(startDate)) {
        return { error: "start_date must be YYYY-MM-DD" };
      }
      const startDt = parseDate(startDate);
      const endDt = new Date(startDt);
      endDt.setDate(endDt.getDate() + 6);
      const endDate = dateToYmd(endDt);
      const checkoffMap = await readCheckoffsInRange(env, userId, dayGrowId, startDate, endDate);
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
        const userNote = await readNote(env, userId, dayGrowId, date);
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

      await ensureGrowLogSchema(env);
      const res = await env.DB.prepare(
        `SELECT date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health
         FROM grow_log
         WHERE user_id = ? AND grow_id = ? AND date >= ? AND date <= ?
         ORDER BY date DESC`
      ).bind(userId, dayGrowId, startDate, endDate).all();

      function tryParseArr(s) {
        if (!s) return [];
        try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
      }

      const entries = (res.results ?? []).map(r => ({
        date:         r.date,
        water_gal:    r.water_gal ?? null,
        temp_high:    r.temp_high ?? null,
        temp_low:     r.temp_low  ?? null,
        humidity:     r.humidity  ?? null,
        feed:         r.feed      ?? null,
        water_plants: tryParseArr(r.water_plants),
        training:     tryParseArr(r.training),
        plant_health: tryParseArr(r.plant_health),
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

      await ensureGrowLogSchema(env);
      await env.DB.prepare(`
        INSERT INTO grow_log (user_id, grow_id, date, water_gal, feed, temp_high, temp_low, humidity, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, grow_id, date) DO UPDATE SET
          water_gal  = COALESCE(excluded.water_gal,  grow_log.water_gal),
          feed       = COALESCE(excluded.feed,       grow_log.feed),
          temp_high  = COALESCE(excluded.temp_high,  grow_log.temp_high),
          temp_low   = COALESCE(excluded.temp_low,   grow_log.temp_low),
          humidity   = COALESCE(excluded.humidity,   grow_log.humidity),
          updated_at = excluded.updated_at
      `).bind(userId, dayGrowId, date, water_gal, feed, temp_high, temp_low, humidity).run();

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
      const checked = await readCheckoffs(env, userId, dayGrowId, date);
      const userNote = await readNote(env, userId, dayGrowId, date);
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
      const current = await readCheckoffs(env, userId, dayGrowId, date);
      const next = mergeChecked(current, inRange, input.done);
      await writeCheckoffs(env, userId, dayGrowId, date, next);
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
      const existing = await readNote(env, userId, dayGrowId, date);
      const note = appendNoteText(existing, input.text);
      if (note.length > MAX_NOTE_LEN) return { error: "note would exceed the maximum length" };
      await writeNote(env, userId, dayGrowId, date, note);
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
      await writeNote(env, userId, dayGrowId, date, text);
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

  const growId = new URL(request.url).searchParams.get("growId") || await firstGrowId(env, user.id);

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
    const current = await readCheckoffs(env, user.id, growId, date);
    const next = mergeChecked(current, inRange, done);
    await writeCheckoffs(env, user.id, growId, date, next);
    return json({ ok: true, checked: next });
  }

  if (type === "undo_append_note") {
    const { originalNote } = body;
    if (typeof originalNote !== "string") return error(400, "invalid undo payload");
    if (originalNote.length > MAX_NOTE_LEN) return error(400, "original note too long");
    await writeNote(env, user.id, growId, date, originalNote);
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
