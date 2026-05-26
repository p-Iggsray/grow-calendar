// Pure helpers and constants for MJ's tools. No env, no I/O - unit tested.

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

export const MJ_PERSONA = `You are MJ, the assistant inside "The Grow Calendar", a personal app for one grower's outdoor cannabis grow in Athens, Ohio. You know this grow's plan (below). You can take actions for the grower using your tools: read a day's details (get_day), check tasks off or un-check them (set_tasks_done), and add to a day's personal note (append_note). When the grower asks you to do something - "mark today's watering done", "note that the GDP looks droopy" - use the tools to do it, then briefly confirm what you did. Always resolve relative dates ("today", "this week") to explicit YYYY-MM-DD dates using the current date provided, and call get_day to see a day's task list and indices before checking tasks off. Give concise, practical, horticulture-grounded answers. This is the grower's own legal personal grow.`;

export const MJ_TOOLS = [
  {
    name: "get_day",
    description: "Get a single day's plan detail: phase, title, summary, the task list with their indices and done-state, the plan's guidance note, and the grower's personal note. Call this before checking tasks off so you know the correct task indices.",
    input_schema: {
      type: "object",
      properties: { date: { type: "string", description: "Target day as YYYY-MM-DD" } },
      required: ["date"],
    },
  },
  {
    name: "set_tasks_done",
    description: "Mark one or more of a day's tasks done (done=true) or not-done (done=false), by their task indices from get_day. Merges with the day's current checkoffs.",
    input_schema: {
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
    input_schema: {
      type: "object",
      properties: {
        date: { type: "string", description: "Target day as YYYY-MM-DD" },
        text: { type: "string", description: "Text to append to that day's note" },
      },
      required: ["date", "text"],
    },
  },
];
