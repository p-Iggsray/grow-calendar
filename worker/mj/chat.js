// @ts-check
// The main POST /mj chat handler: request validation, quota enforcement,
// context assembly, and the SSE stream around the Gemini tool-calling loop.
import { error, safeJsonBounded } from "../util.js";
import { loadRawPlan } from "../plan.js";
import { loadRawGrow, loadRawGrows } from "../grows.js";
import { parseConfig, parseDate } from "../../src/lib/planConfig.js";
import { buildPlanText } from "../../src/lib/planText.js";
import { getLifecyclePhase, dryProgress, cureProgress } from "../../src/lib/lifecycle.js";
import { growLocation, strainSummary } from "../../src/lib/growProfile.js";
import { firstGrowId } from "../perDayScope.js";
import { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, PER_USER_DAILY_CAP } from "../limits.js";
import { MJ_PERSONA, MJ_TOOLS } from "../mj-logic.js";
import { runGemini } from "../providers/gemini.js";
import { ProviderError } from "../providers/errors.js";
import { logError } from "../log.js";
import {
  MAX_MSG_LEN, MAX_TOOL_ITERATIONS, DATE_RE, GEMINI_MODEL, GEMINI_PRO_MODEL,
  MAX_MJ_REQUEST_BYTES, MAX_IMAGE_B64_LEN, MAX_CONTEXT_MESSAGES,
} from "./constants.js";
import { todayInET, bumpUserUsage, bumpModelUsage, readMjModelUsage, readMjUsageForUser } from "./usage.js";
import { ensureMjThreadSchema, loadHistory, saveConversation } from "./history.js";
import { buildGrowLogContext, buildWeatherContext, buildStatsContext, buildSupplyContext, buildGrowsContext } from "./context.js";
import { executeTool } from "./tools.js";

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
      return error(413, "image too large - please use a smaller photo");
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
  // work. The shared global flash ceiling is enforced here too - previously it
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

  // Load the active grow - prefer the grows table, fall back to plan_config.
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
  const eventRules = raw.eventRules ?? [];

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
  const growProfile = profileParts.length ? `Active grow profile - ${profileParts.join(" · ")}.` : "";

  // Tell MJ which post-harvest phase the grow is in so advice matches reality
  // (the calendar is hidden once drying/curing starts).
  let lifecycleContext = "";
  const lcPhase = getLifecyclePhase(raw.lifecycle);
  if (lcPhase === "drying") {
    const p = dryProgress(raw.lifecycle, parseDate(today));
    lifecycleContext = `LIFECYCLE: This grow is DRYING${p ? ` (day ${p.dayNum}, target ~${p.target} days at ~60°F/60% RH)` : ""}. The calendar is finished; help with drying and when to move to jars/curing.`;
  } else if (lcPhase === "curing") {
    const p = cureProgress(raw.lifecycle, parseDate(today));
    lifecycleContext = `LIFECYCLE: This grow is CURING${p ? ` (day ${p.dayNum}; min 2 weeks, great at 4+)` : ""} in jars at ~62% RH. Help with burping cadence and when it's well cured.`;
  } else if (lcPhase === "done") {
    lifecycleContext = "LIFECYCLE: This grow is COMPLETE (harvested, dried, and cured). Help with storage, review, or planning the next grow.";
  }

  // Assemble system prompt segments.
  const planText  = buildPlanText(config, overrides, raw.generatedPlan, phaseOverrides, eventRules);
  const baseBlock = [MJ_PERSONA, "", planText, "", supplyContext].filter(s => s !== "").join("\n");

  const dynamicParts = [
    growProfile,
    lifecycleContext,
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
        executeTool(name, input, env, user.id, config, overrides, raw.generatedPlan, phaseOverrides, actions, activeGrowId, raw, eventRules);

      let reply = null;
      let modelUsed = null;
      let lastErr = null;
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
            lastErr = e;
            tryNext = true;
            logError("mj-fallback", { from: model, kind: e?.kind, detail: e?.detail, message: String(e?.message ?? e) });
          }
          if (!tryNext) break;
        }

        if (reply === null || modelUsed === null) {
          // The call never succeeded - release the reserved per-user slot so a
          // service outage doesn't burn the user's daily message quota.
          if (user.role !== "admin") {
            await env.DB.prepare(
              "UPDATE mj_usage SET count = count - 1 WHERE user_id = ? AND date = ? AND count > 0",
            ).bind(user.id, today).run();
          }
          // Only call it a "limit" when Gemini actually returned a quota (429).
          // Other failures (bad/expired API key → 403, rejected model → 400,
          // gateway errors) were previously masked as a daily-limit message.
          if (lastErr instanceof ProviderError && lastErr.kind === "quota") {
            send({ error: "MJ has hit today's limit, please try again later" });
          } else {
            const detail = user.role === "admin" && lastErr?.detail ? ` [${lastErr.detail}]` : "";
            send({ error: `MJ is having trouble reaching the AI service right now. Please try again in a bit.${detail}` });
          }
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
