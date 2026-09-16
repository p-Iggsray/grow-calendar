// @ts-check
// The main POST /mj chat handler: request validation, quota enforcement,
// context assembly, and the SSE stream around the Gemini tool-calling loop.
import { error, safeJsonBounded } from "../util.js";
import { loadRawGrow, loadRawGrows } from "../grows.js";
import { loadStageTimeline } from "../stages.js";
import { parseDate } from "../../src/lib/dates-core.js";
import { buildTimelineText } from "../../src/lib/timelineText.js";
import { getLifecyclePhase, dryProgress, cureProgress, dryGuide } from "../../src/lib/lifecycle.js";
import { cropOf } from "../../src/lib/crops.js";
import { growLocation, strainSummary } from "../../src/lib/growProfile.js";
import { firstGrowId } from "../perDayScope.js";
import { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, RESERVED_FOR_OTHERS } from "../limits.js";
import { MJ_TOOLS, MJ_WRITE_TOOLS, buildSystemSegments } from "../mj-logic.js";
import { runGemini } from "../providers/gemini.js";
import { ProviderError } from "../providers/errors.js";
import { logError } from "../log.js";
import {
  MAX_MSG_LEN, MAX_TOOL_ITERATIONS, DATE_RE, GEMINI_MODEL, GEMINI_PRO_MODEL,
  MAX_MJ_REQUEST_BYTES, MAX_IMAGE_B64_LEN, MAX_CONTEXT_MESSAGES,
} from "./constants.js";
import { todayInET, bumpUserUsage, bumpModelUsage, readMjModelUsage, readMjUsageForUser, dailyRequestBudget } from "./usage.js";
import { ensureMjThreadSchema, loadHistory, saveConversation } from "./history.js";
import { buildGrowLogContext, buildWeatherContext, buildStatsContext, buildGrowsContext, buildEnvContext, buildRosterContext } from "./context.js";
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
  // work. Everything here counts REQUESTS to Google, not messages: one message
  // is a tool loop that can make several, and the quota is spent in requests.
  const isAdmin = user.role === "admin";
  const budget = dailyRequestBudget(user);
  // An admin cannot spend the last of the day. Before this they bypassed every
  // check, which was harmless against 1500 requests a day and is not against
  // 250: one long afternoon would leave the app dead for everyone else.
  const globalCeiling = isAdmin ? GEMINI_DAILY_LIMIT - RESERVED_FOR_OTHERS : GEMINI_DAILY_LIMIT;
  {
    const [flashGlobal, userSpent] = await Promise.all([
      readMjModelUsage(env, today, GEMINI_MODEL),
      readMjUsageForUser(env, user.id, today),
    ]);
    // Headroom for a whole turn, because a turn cannot be stopped half way
    // through once it has started making requests.
    if (flashGlobal + MAX_TOOL_ITERATIONS > globalCeiling) {
      return error(429, isAdmin
        ? `MJ is near today's shared limit, and the last ${RESERVED_FOR_OTHERS} requests are held back for everyone else. Resets at midnight ET.`
        : "MJ has reached today's shared limit. Try again after midnight ET.");
    }
    if (userSpent >= budget) {
      return error(429, `You've used your ${budget} MJ requests for today. Resets at midnight ET.`);
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

  // Load the active grow.
  const raw = activeGrowId ? await loadRawGrow(env, user.id, activeGrowId) : null;
  if (!raw || raw.needsSetup) return error(400, "Complete your grow setup before using MJ.");

  // Per-day data is grow-scoped; fall back to the user's first grow when the
  // request didn't carry an explicit active grow.
  const dayGrowId = activeGrowId ?? await firstGrowId(env, user.id);

  // The grow's real history: the source every stage label and day number in
  // MJ's context is read from.
  const timeline = await loadStageTimeline(env, user.id, dayGrowId);

  // Load all rich context in parallel.
  const [grows, growLogContext, weatherContext, statsContext, envContext] = await Promise.all([
    loadRawGrows(env, user.id).catch(() => []),
    buildGrowLogContext(env, user.id, dayGrowId),
    buildWeatherContext(env, raw.survey),
    buildStatsContext(env, user.id, dayGrowId),
    buildEnvContext(env, user.id, dayGrowId),
  ]);

  // Archived spaces are not what the grower is working in, so MJ is not told
  // about them and cannot act on one by mistake.
  const growsContext   = buildGrowsContext(grows.filter(g => !g.archivedAt), activeGrowId);

  // Per-grow profile (location + plant counts) so MJ tailors advice without
  // a tool call. Replaces the old hardcoded location in the persona.
  const profileParts = [
    growLocation(raw.survey) ? `Location: ${growLocation(raw.survey)}` : "",
    strainSummary(raw.survey) ? `Plants: ${strainSummary(raw.survey)}` : "",
  ].filter(Boolean);
  const growProfile = profileParts.length ? `Active grow profile - ${profileParts.join(" · ")}.` : "";

  // Tell MJ which post-harvest phase the grow is in so advice matches reality
  // (the calendar is hidden once drying/curing starts).
  let lifecycleContext = "";
  const crop = cropOf(raw.survey);
  const lcPhase = getLifecyclePhase(raw.lifecycle);
  if (lcPhase === "drying") {
    const p = dryProgress(raw.lifecycle, parseDate(today), crop);
    const g = dryGuide(crop);
    lifecycleContext = `LIFECYCLE: This grow is DRYING${p ? ` (day ${p.dayNum}, target ~${p.target} days; ${g.ideal})` : ""}. The calendar is finished; help with drying and when to ${cropOf(crop) === "mushrooms" ? "jar them with desiccant" : "move to jars and cure"}.`;
  } else if (lcPhase === "curing") {
    const p = cureProgress(raw.lifecycle, parseDate(today));
    lifecycleContext = `LIFECYCLE: This grow is CURING${p ? ` (day ${p.dayNum}; min 2 weeks, great at 4+)` : ""} in jars at ~62% RH. Help with burping cadence and when it's well cured.`;
  } else if (lcPhase === "done") {
    lifecycleContext = "LIFECYCLE: This grow is COMPLETE (harvested, dried, and cured). Help with storage, review, or planning the next grow.";
  }

  // Assemble the system prompt. Order is load-bearing: see buildSystemSegments.
  // The timeline of recorded stage changes belongs down here with the rest of
  // what changes, not up with the persona - it moves every time the grower
  // records anything, and up there it broke the cacheable prefix each time.
  const timelineText = buildTimelineText(timeline.events, timeline.firstDate, today);
  const rosterContext = buildRosterContext(raw.survey);

  const systemSegments = buildSystemSegments({
    survey: raw.survey,
    volatile: [
      timelineText,
      growProfile,
      rosterContext,
      lifecycleContext,
      envContext,
      growsContext,
      growLogContext,
      weatherContext,
      statsContext,
      `Today's date is ${today}.`,
      contextDate ? `The grower currently has ${contextDate} open in the app.` : "",
    ],
  });

  // Reserve one request atomically right before the (expensive) model call so
  // concurrent messages can't all slip past the cap. The reservation is
  // corrected to what the turn actually cost once it is over, including back
  // down to nothing when it never reached Google at all.
  const reserved = await bumpUserUsage(env, user.id, today, 1);
  if (reserved > budget) {
    await bumpUserUsage(env, user.id, today, -1);
    return error(429, `You've used your ${budget} MJ requests for today. Resets at midnight ET.`);
  }

  const modelsToTry = user.role === "admin" ? [GEMINI_PRO_MODEL, GEMINI_MODEL] : [GEMINI_MODEL];

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const actions = [];
      // Whether this attempt has already changed the database. Set BEFORE the
      // tool runs, not after it records itself: the point is to know a write
      // was attempted even if it failed part way, because that is exactly the
      // case where redoing it is worst.
      let wrote = false;
      // `shown` is where a tool puts images it wants MJ to look at. They reach
      // the model as sibling parts of the tool response and stay in this turn
      // only: her written observations are what gets saved, not the pictures
      // she formed them from.
      const executeToolUse = (name, input, shown) => {
        if (MJ_WRITE_TOOLS.has(name)) wrote = true;
        return executeTool(name, input, env, user.id, timeline, actions, activeGrowId, raw, shown);
      };

      let reply = null;
      let modelUsed = null;
      let lastErr = null;
      // Every round trip this turn makes. Owned here so the count survives a
      // failure: requests made before something went wrong still went to
      // Google and still count against the quota.
      //
      // Split by model, because Pro and Flash have very different daily
      // ceilings and a turn can touch both. Charging Pro's attempts to Flash
      // would leave the tighter of the two limits under-counted, which is the
      // one that matters.
      const usage = { requests: 0 };
      const spent = new Map();
      try {
        for (const model of modelsToTry) {
          let tryNext = false;
          const before = usage.requests;
          try {
            ({ reply } = await runGemini({
              apiKey, model, systemSegments, tools: MJ_TOOLS, messages,
              executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
              onChunk: (delta) => send({ delta }),
              gatewayBase: env.CF_AI_GATEWAY_URL ?? null,
              userId: user.id,
              usage,
            }));
            modelUsed = model;
          } catch (e) {
            lastErr = e;
            logError("mj-fallback", { from: model, kind: e?.kind, detail: e?.detail, wrote, message: String(e?.message ?? e) });
            // A second model would start the whole turn again, tools and all.
            // That is free when the turn only read things and wrong the moment
            // it wrote one: the note is already appended, the plant already
            // added. Stop here and report it rather than doing it twice.
            //
            // An unreachable service is not worth a second model either: the
            // first one never got off the machine.
            if (wrote || (e instanceof ProviderError && e.kind === "unreachable")) break;
            actions.length = 0;
            tryNext = true;
          } finally {
            // Runs on every way out of this attempt, break included, so no
            // path can leave requests uncounted.
            spent.set(model, (spent.get(model) ?? 0) + (usage.requests - before));
          }
          if (!tryNext) break;
        }

        // Whatever reached Google counts, whether or not it produced an
        // answer. One request was reserved up front, so the grower is charged
        // the difference: a six-step turn costs five more, and a turn that
        // never got off the machine gives its reservation back.
        for (const [model, n] of spent) {
          if (n > 0) await bumpModelUsage(env, model, today, n).catch(() => {});
        }
        await bumpUserUsage(env, user.id, today, usage.requests - 1).catch(() => {});

        if (reply === null || modelUsed === null) {
          // No separate release here: the reconciliation above already charged
          // exactly what was spent, which for a service outage is nothing.
          // A turn that wrote before it failed leaves real changes behind. Say
          // so, because "try again" is the wrong advice when half of it landed.
          if (wrote) {
            const detail = user.role === "admin" && lastErr?.detail ? ` [${lastErr.detail}]` : "";
            const said = "I lost the connection part way through. What I had already saved is saved, listed below, so check it before asking me again.";
            // Record the turn even though it failed. The changes are real, and
            // an action nobody can see is an action nobody can undo.
            await saveConversation(env, user.id, threadGrowId, userContent, said, actions).catch(() => {});
            send({ error: `${said}${detail}`, actions });
            return;
          }
          // Only call it a "limit" when Gemini actually returned a quota (429).
          // Other failures (bad/expired API key → 403, rejected model → 400,
          // gateway errors) were previously masked as a daily-limit message.
          if (lastErr instanceof ProviderError && lastErr.kind === "quota") {
            send({ error: "MJ has hit today's limit, please try again later" });
          } else if (lastErr instanceof ProviderError && lastErr.kind === "unreachable") {
            send({ error: "Could not reach the AI service" });
          } else {
            const detail = user.role === "admin" && lastErr?.detail ? ` [${lastErr.detail}]` : "";
            send({ error: `MJ is having trouble reaching the AI service right now. Please try again in a bit.${detail}` });
          }
          return;
        }

        await saveConversation(env, user.id, threadGrowId, userContent, reply, actions);
        const [proCount, flashCount, userCount] = await Promise.all([
          readMjModelUsage(env, today, GEMINI_PRO_MODEL),
          readMjModelUsage(env, today, GEMINI_MODEL),
          readMjUsageForUser(env, user.id, today),
        ]);
        send({ done: true, actions, modelUsed, usage: {
          date: today, unit: "requests",
          proCount, proLimit: GEMINI_PRO_DAILY_LIMIT,
          flashCount, flashLimit: GEMINI_DAILY_LIMIT,
          userCount, userLimit: budget,
        } });
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
