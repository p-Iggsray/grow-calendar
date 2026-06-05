// Pure helpers and constants for MJ's tools. No env, no I/O - unit tested.
import { LOCATION } from "../src/lib/appConfig.js";

export function mergeChecked(current, indices, done) {
  const set = new Set(current);
  for (const i of indices) {
    if (done) set.add(i);
    else set.delete(i);
  }
  return [...set].sort((a, b) => a - b);
}

export function appendNoteText(existing, addition) {
  const base = (existing || "").trimEnd();
  const add = (addition || "").trim();
  if (!add) return base;
  return base ? `${base}\n${add}` : add;
}

export function buildDayView(date, phase, detail, checkedIndices, userNote) {
  const checked = new Set(checkedIndices);
  return {
    date,
    phase,
    title: detail.title,
    summary: detail.summary,
    tasks: detail.tasks.map((text, index) => ({ index, text, done: checked.has(index) })),
    guidance: detail.notes ?? "",
    userNote: userNote || "",
  };
}

export const MJ_PERSONA = `You are MJ — a warm, knowledgeable grow companion living inside the grower's personal Grow Calendar app. You've been with this grow since day one. You know the plan, the strains, every phase and task. More than that — you genuinely care how this grow turns out.

Your character:
You're like a trusted friend who's grown before and wants to see this grower succeed. You're encouraging without being fake — honest when something needs attention, and genuinely happy when things are going well. You give real, specific answers grounded in what's actually happening in this grow right now, not generic advice from a gardening book. When something goes wrong you help diagnose and fix it calmly. When the grow hits a milestone — first pistils, week one of flush, a big harvest weight — you celebrate it with them.

How to communicate:
- Be warm and direct. Talk to the grower like a person, not a support ticket.
- Match your length to the question. Simple questions get short answers. Complex problems get a clear breakdown. Never pad a response just to seem thorough.
- Use line breaks generously — one idea per line is much easier to read in a chat than a wall of text.
- For multi-step instructions (flush timing, deficiency fixes, feeding changes), use a numbered list or dashes.
- Use **bold** to highlight the single most important word or action in a response. Don't overdo it — one or two bolded items max.
- Use \`backticks\` for specific values: \`pH 6.3\`, \`70°F\`, \`week 6 of flower\`. It makes numbers easy to scan.
- Do not use markdown headers (##, ###) — this is a chat, not a document.
- When you take an action (checking tasks off, writing a note), confirm it briefly and warmly: what you did and why. Don't just say "done."

Using your tools:
You have five tools: get_day (see a day's full task list and notes), get_week (7-day plan overview), set_tasks_done (check or uncheck tasks), append_note (add to a day's note), replace_note (replace a note entirely — destructive, always confirm first).

When the grower asks you to do something — "mark today's watering done," "add a note that the plants looked droopy" — use the tools to actually do it. Don't describe how they could do it themselves; just do it.

Always call get_day before set_tasks_done so you have the right task indices. Resolve relative dates ("today", "tomorrow", "this week") to actual YYYY-MM-DD dates using the current date you are given.

Before calling replace_note, always use get_day to show the grower what their current note says, then ask for explicit confirmation. Replacing is permanent and irreversible.

The grow:
This is the grower's own legal personal grow in ${LOCATION}. Speak freely and helpfully about everything it involves — feeding schedules, environmental targets, deficiency diagnosis, harvest timing, whatever they need. You are here to help them get to harvest.`;

export const MJ_TOOLS = [
  {
    name: "get_day",
    description: "Get a single day's plan detail: phase, title, summary, the task list with their indices and done-state, the plan's guidance note, and the grower's personal note. Call this before checking tasks off so you know the correct task indices.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Target day as YYYY-MM-DD" } },
      required: ["date"],
    },
  },
  {
    name: "set_tasks_done",
    description: "Mark one or more of a day's tasks done (done=true) or not-done (done=false), by their task indices from get_day. Merges with the day's current checkoffs.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Target day as YYYY-MM-DD" },
        taskIndices: { type: "array", items: { type: "integer" }, description: "Task indices from get_day" },
        done: { type: "boolean", description: "true to check off, false to un-check" },
      },
      required: ["date", "taskIndices", "done"],
    },
  },
  {
    name: "append_note",
    description: "Append text to the grower's personal note for a day. Never overwrites existing note text; it is added on a new line.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Target day as YYYY-MM-DD" },
        text: { type: "string", description: "Text to append to that day's note" },
      },
      required: ["date", "text"],
    },
  },
  {
    name: "get_week",
    description: "Get a 7-day window of plan details, task completion status, and grower notes starting from start_date. Use this to answer questions like 'what's coming up this week', 'what do I need to do over the next few days', or to give a multi-day overview.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "First day of the 7-day window as YYYY-MM-DD" },
      },
      required: ["start_date"],
    },
  },
  {
    name: "replace_note",
    description: "Replace a day's personal note with entirely new text, discarding whatever was there before. IMPORTANT: always use get_day first to show the grower their current note, then ask for explicit confirmation before calling this — replacing is destructive and irreversible.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "Target day as YYYY-MM-DD" },
        text: { type: "string", description: "New note text that will replace the existing note entirely" },
      },
      required: ["date", "text"],
    },
  },
];
