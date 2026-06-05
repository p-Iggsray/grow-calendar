// @ts-check
import { error } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { runGemini } from "./providers/gemini.js";
import { ProviderError } from "./providers/errors.js";
import { logError } from "./log.js";

const REVIEW_MODEL = "gemini-2.5-pro";
const MAX_ITERATIONS = 14;

const VALID_PHASES = new Set([
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
]);

const REVIEW_PERSONA = `You are MJ, a master cannabis cultivation advisor performing an expert quality review of a freshly generated grow plan. Your goal is to maximize plan quality for this specific grower's conditions.

REVIEW PROCESS:
1. Call get_plan_data immediately to read the full plan, survey, and generated phases.
2. Identify 3-6 high-impact areas where the plan could be more specific or better tailored — consider the grower's exact strains (vigor, typical flower time), their environment (outdoor region, climate risks), medium, nutrients, and container size.
3. Ask 1-4 targeted clarifying questions ONE AT A TIME — wait for each answer before asking the next. Only ask about things the setup form didn't capture that would meaningfully change the plan, e.g.:
   - Daily sun hours at the grow spot in midsummer
   - Water source (tap, well, filtered RO) — affects nutrient burn risk and pH approach
   - Local summer temperature range (heat stress threshold)
   - Previous grow experience with these strains
   - Preferred training method (topping, LST, none)
4. After gathering answers (or if the plan needs no additional info), tell the grower SPECIFICALLY what you'll improve and in which phases. Then ask: "Shall I apply these improvements?" Wait for their confirmation before calling apply_phase_improvement.
5. Apply improvements phase by phase using apply_phase_improvement.
6. Call finish_review when all improvements are saved.

QUALITY STANDARDS:
- Tasks must be specific and actionable: "Water with 1 gal pH 6.3-6.5 plain water, watch for run-off appearing within 30 sec (indicates proper moisture)" beats "water the plant"
- Reference exact strain names in timing notes: "GDP typically shows pre-flowers by week 5 outdoors in your climate"
- Address local climate directly: heat-wave protocols, humidity windows, rain during harvest
- Nutrient references must use the grower's specific brand/products — never invent or substitute brands
- For outdoor grows, reference the specific location's season, pests, and typical weather patterns
- Container-lift moisture checks should name the container size: "A saturated 5-gal pot feels significantly heavier than a dry one"

RULES:
- Do NOT change config dates — only phase content (summary, tasks, notes, title)
- Keep questions short and focused — one question per message
- Improve at least 4-6 phases
- Be warm and coach-like. The grower trusts you with their season.`;

const REVIEW_TOOLS = [
  {
    name: "get_plan_data",
    description: "Read the grower's full plan: survey answers, all AI-generated phase details, config dates, strains, and any existing phase improvements. Call this first before asking questions or making improvements.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "apply_phase_improvement",
    description: "Save an expert-improved version of one grow phase as a phase override. Only call this AFTER the grower has confirmed they want improvements applied.",
    parameters: {
      type: "object",
      properties: {
        phase: {
          type: "string",
          description: "Phase key — one of: transplant, early_veg, veg_cm, veg_half, veg_full, pre_flower, flower, flush, flush_gdp, harvest_gdp, flower_haze, flush_haze, harvest_haze",
        },
        title: {
          type: "string",
          description: "Improved phase title (only include if changing it from the AI-generated title)",
        },
        summary: {
          type: "string",
          description: "Improved 1-3 sentence phase summary, specific to this grower's conditions",
        },
        tasks: {
          type: "array",
          items: { type: "string" },
          description: "Complete improved task list. Each task must be 1-3 sentences, actionable, and specific to this grower's strains, nutrients, and environment.",
        },
        notes: {
          type: "string",
          description: "Improved guidance note for the phase (omit if no improvement needed)",
        },
      },
      required: ["phase", "summary", "tasks"],
    },
  },
  {
    name: "finish_review",
    description: "Signal that the quality review is complete and all phase improvements have been saved. Call this only after all apply_phase_improvement calls are done.",
    parameters: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description: "1-2 sentence summary of what was reviewed and improved",
        },
        phasesImproved: {
          type: "number",
          description: "Number of phases that had improvements applied",
        },
      },
      required: ["summary"],
    },
  },
];

async function executeReviewTool(name, input, env, userId, rawPlan) {
  try {
    if (name === "get_plan_data") {
      let survey = null, config = null, generatedPlan = null, phaseOverrides = {};
      try { if (rawPlan.survey) survey = rawPlan.survey; } catch { /* swallow */ }
      try { if (rawPlan.config) config = rawPlan.config; } catch { /* swallow */ }
      try { if (rawPlan.generatedPlan) generatedPlan = rawPlan.generatedPlan; } catch { /* swallow */ }
      try { if (rawPlan.phaseOverrides) phaseOverrides = rawPlan.phaseOverrides; } catch { /* swallow */ }
      return { survey, config, generatedPlan, phaseOverrides };
    }

    if (name === "apply_phase_improvement") {
      const { phase, title, summary, tasks, notes } = input ?? {};
      if (!phase || typeof summary !== "string" || !Array.isArray(tasks)) {
        return { error: "phase, summary, and tasks are required" };
      }
      if (!VALID_PHASES.has(phase)) return { error: `unknown phase: ${phase}` };
      if (tasks.length === 0) return { error: "tasks array cannot be empty" };

      const row = await env.DB.prepare(
        "SELECT phase_overrides FROM plan_config WHERE user_id = ?"
      ).bind(userId).first();
      const existing = row?.phase_overrides
        ? JSON.parse(row.phase_overrides)
        : {};

      existing[phase] = {
        summary,
        tasks,
        ...(title ? { title } : {}),
        ...(notes ? { notes } : {}),
      };

      await env.DB.prepare(
        "UPDATE plan_config SET phase_overrides = ?, updated_at = ? WHERE user_id = ?"
      ).bind(JSON.stringify(existing), new Date().toISOString(), userId).run();

      return { ok: true, phase, tasksApplied: tasks.length };
    }

    if (name === "finish_review") {
      return {
        done: true,
        summary: input?.summary || "Review complete",
        phasesImproved: input?.phasesImproved ?? 0,
      };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    logError("mj-review-tool", { tool: name, message: String(err?.message ?? err) });
    return { error: "tool failed to execute" };
  }
}

export async function postMjReview(request, env, user) {
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const clientMessages = Array.isArray(body?.messages) ? body.messages : [];
  if (clientMessages.length === 0) return error(400, "messages array required");

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "MJ is not configured yet");

  const rawPlan = await loadRawPlan(env, user.id);
  if (rawPlan.needsSetup) {
    return error(400, "Complete your grow setup before running a plan review.");
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const systemSegments = [
    { text: REVIEW_PERSONA, cache: true },
    { text: `Today's date is ${today}.`, cache: false },
  ];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      const actions = [];
      try {
        const { reply } = await runGemini({
          apiKey,
          model: REVIEW_MODEL,
          systemSegments,
          tools: REVIEW_TOOLS,
          messages: clientMessages,
          executeToolUse: async (toolName, input) => {
            const result = await executeReviewTool(toolName, input, env, user.id, rawPlan);
            if (toolName === "apply_phase_improvement" && result.ok) {
              actions.push({
                type: "phase_improved",
                phase: input.phase,
                summary: `Improved ${input.phase.replace(/_/g, " ")} (${result.tasksApplied} tasks)`,
              });
            }
            if (toolName === "finish_review" && result.done) {
              actions.push({
                type: "review_complete",
                summary: result.summary,
                phasesImproved: result.phasesImproved ?? actions.filter(a => a.type === "phase_improved").length,
              });
            }
            return result;
          },
          maxIterations: MAX_ITERATIONS,
          onChunk: (delta) => send({ delta }),
          gatewayBase: env.CF_AI_GATEWAY_URL ?? null,
          userId: user.id,
        });

        send({ done: true, reply, actions });
      } catch (e) {
        if (e instanceof ProviderError) {
          const msg = e.kind === "quota"
            ? "AI quota reached. Please try again later."
            : "Could not reach the AI service.";
          send({ error: msg });
        } else {
          logError("mj-review-stream", { message: String(e?.message ?? e) });
          send({ error: "Something went wrong with the plan review." });
        }
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
