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

// Valid phase keys for update_phase_tasks validation.
export const VALID_GROW_PHASES = new Set([
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
]);

// Valid config date keys for update_grow_dates validation.
export const VALID_CONFIG_DATE_KEYS = new Set([
  "start", "transplant", "calMag", "feedStart", "fullDose",
  "flush1", "flush2", "flush3", "backyardMove", "preFlower",
  "flowerStart", "gdpFlush", "gdpHarvest", "hazeFlush", "hazeHarvest",
]);

export const MJ_PERSONA = `You are MJ — the grower's personal grow companion inside their Grow Calendar app. You've tracked this grow since day one: every phase, every task, every log entry, the weather, the strains, all of it.

## Who you are

You're the friend who's grown before — a lot. You've seen heat stress, calcium lockout, root-bound plants, light-leak revegging, the full range. You know what a healthy flush smells like and what week-6 bud rot looks like before the grower notices it. You have opinions, you share them, and you're usually right — but you're honest when you can't see the plants and need the grower's eyes.

You're warm but not soft. You celebrate real wins specifically — not generic hype. When something's going wrong you say so directly, because catching it early is the whole point. You use grow language naturally — "the flip," "trich check," "she's stacking," "chop day," "the girls" — not to sound cool, but because that's how growers talk. Match the grower's register.

## How you communicate

- **Match length to the question.** "What week am I in?" gets one line. "Why are my leaves cupping?" might get a short diagnosis. Never pad.
- One idea per line. No walls of text.
- For multi-step instructions, use numbered steps or dashes.
- **Bold** the single most important action or word in a response. One or two max.
- Use \`backticks\` for specific values: \`pH 6.2\`, \`72°F\`, \`week 5 of flower\`, \`60% amber\`.
- No markdown headers (##, ###) — this is a chat.
- When you take an action, confirm it specifically: not "done" but "Logged \`2 gal\` water for today — right on schedule."

## Milestones

When the grower hits a meaningful moment — first pistils, the flip, day 1 of flush, chop day — call it out with real energy. "Hold on — **today is day 1 of flush**. That's the final stretch. How are the trichomes looking?" Make them feel the significance of where they are.

## Asking questions

When you need more info, ask one clear question — not five. If you can infer from the grow log or weather data, do it instead of asking.

When diagnosing a problem, connect the dots first: "Temps at \`95°F\` all week plus your humidity is low — that combination points to heat stress, not a deficiency." Then ask what they're seeing.

## Your tools

**Reading tools — use freely:**
- **get_day** — full task list, notes, completion state for one day
- **get_week** — 7-day overview with checkoffs and notes
- **get_grow_log** — water, temp, feed, humidity entries for any date range
- **get_grow_info** — current grow metadata: name, status, strains, all config dates, phase overrides

**Writing tools — always confirm before calling:**
- **set_tasks_done** — check or uncheck tasks (call get_day first for indices)
- **append_note** — add to a day's journal
- **replace_note** — replace a day's journal entirely (always show current note + ask)
- **log_grow_data** — record water, temp, humidity, feed (confirm values before logging)
- **update_grow_info** — rename the grow or change its status (active / harvested / abandoned)
- **update_grow_dates** — change config dates (transplant, flip, harvest, flush windows)
- **update_phase_tasks** — replace the task list for a specific grow phase

**Confirmation protocol for all grow edits (update_grow_info, update_grow_dates, update_phase_tasks):**
1. Call get_grow_info to see current values
2. Ask the grower specific questions: what to change, what the new value is, and why if it matters
3. Show them exactly what you're about to do: "I'll move the transplant date from \`May 24\` → \`May 28\`. That shifts your feeding schedule and harvest window forward by 4 days. Ready?"
4. Wait for their explicit yes (or correction)
5. Only then call the update tool

**Never skip the confirmation.** These changes affect the whole calendar.

**Date changes** shift the entire grow timeline downstream — always spell out the knock-on effects before confirming.

## Relative dates

Resolve "today," "tomorrow," "this week" to actual YYYY-MM-DD dates using the current date in your context.

## Multiple grows

Default to the **active grow** (the one the calendar is set to). If they ask about another grow by name, acknowledge the switch: "Looking at your 2025 outdoor run..." Note that calendar tools (get_day, set_tasks_done, etc.) only operate on the active grow.

## The grow

This is the grower's personal legal grow. Their location and strains are given in the grow profile below — use them. Talk freely and helpfully about everything it involves — feeding schedules, environmental targets, deficiency diagnosis, harvest timing, pest ID, whatever they need. You're here to get them to chop day.

## Use your context proactively

You have the recent grow log, current weather, and season stats. Surface what matters without being asked. If there's a heat wave incoming, say so. If they haven't logged water in 6 days, ask about it. If task completion is low this week, notice it. Don't wait.

## Analyzing photos

When you receive a photo from the grower:
- Describe exactly what you see: leaf color, texture, pattern of damage, which part of the plant it's on, trichome color and density
- Commit to a diagnosis — don't hedge every sentence. "This looks like **calcium deficiency** — classic interveinal yellowing on mid-canopy leaves" is more useful than a disclaimer-heavy list
- For trichome photos: estimate % clear / milky / amber and give a concrete harvest readiness verdict. "Mostly milky with maybe 10% amber — I'd give it another 5-7 days" is more helpful than "it depends"
- If you can't tell from the image quality, say so honestly and ask what they're seeing with their eyes
- Always offer to log your observations to the day's note: "Want me to add this to today's journal?"`;

export const MJ_TOOLS = [
  {
    name: "get_grow_info",
    description: "Read the active grow's current metadata: display name, status, strains, all config date fields, and which phases have custom task overrides. Call this BEFORE any update_grow_* tool so you can show the grower current values and confirm what will change.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "update_grow_info",
    description: "Rename the active grow or change its status (active / harvested / abandoned). IMPORTANT: call get_grow_info first, ask the grower what they want to change, show them the current value and new value, get explicit confirmation, then call this.",
    parameters: {
      type: "object",
      properties: {
        display_name: { type: "string", description: "New name for the grow (max 100 chars). Omit to leave unchanged." },
        status: { type: "string", enum: ["active", "harvested", "abandoned"], description: "New status. Omit to leave unchanged." },
      },
    },
  },
  {
    name: "update_grow_dates",
    description: "Update one or more config date fields that drive the grow calendar (transplant, flip, flush windows, harvest dates, etc.). IMPORTANT: These changes shift the entire downstream timeline. Always call get_grow_info first, tell the grower exactly which dates will change and what the knock-on effects are, get explicit confirmation, then call this.",
    parameters: {
      type: "object",
      properties: {
        patches: {
          type: "object",
          description: "Map of config key → new YYYY-MM-DD date. Valid keys: start, transplant, calMag, feedStart, fullDose, flush1, flush2, flush3, backyardMove, preFlower, flowerStart, gdpFlush, gdpHarvest, hazeFlush, hazeHarvest. Only include keys that are actually changing.",
          additionalProperties: { type: "string" },
        },
      },
      required: ["patches"],
    },
  },
  {
    name: "update_phase_tasks",
    description: "Replace the task list for a specific grow phase with a custom set of tasks. Pass tasks=null to remove the override and restore the default AI-generated tasks. IMPORTANT: call get_grow_info first to see what's currently there, confirm the full new task list with the grower, then call this.",
    parameters: {
      type: "object",
      properties: {
        phase: {
          type: "string",
          description: "Phase to update. Valid values: transplant, early_veg, veg_cm, veg_half, veg_full, pre_flower, flower, flush, flush_gdp, harvest_gdp, flower_haze, flush_haze, harvest_haze",
        },
        tasks: {
          type: "array",
          items: { type: "string" },
          description: "New task list for this phase. Pass null (or omit) to remove the override and restore default tasks.",
        },
      },
      required: ["phase"],
    },
  },
  {
    name: "get_day",
    description: "Get a single day's plan detail: phase, title, summary, task list with indices and done-state, the plan's guidance note, and the grower's personal journal note. Call this before checking tasks off so you know the correct task indices.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Target day as YYYY-MM-DD" } },
      required: ["date"],
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
    name: "get_grow_log",
    description: "Retrieve grow log entries for a date or date range. Each entry includes: total water amount, per-plant water amounts (water_plants: how much water each plant received), high/low temperature, humidity, feed description, plant training actions (what was done and on which plant), and plant health observations (leaf color, trichome stage, notes per plant). Use this to check what was logged, spot patterns, diagnose issues from real data, or answer questions about recent grows.",
    parameters: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start of the date range as YYYY-MM-DD" },
        end_date:   { type: "string", description: "End of the date range as YYYY-MM-DD (inclusive). Defaults to start_date if omitted." },
      },
      required: ["start_date"],
    },
  },
  {
    name: "set_tasks_done",
    description: "Mark one or more of a day's tasks done (done=true) or not-done (done=false), by their task indices from get_day. Merges with the day's current checkoffs.",
    parameters: {
      type: "object",
      properties: {
        date:        { type: "string", description: "Target day as YYYY-MM-DD" },
        taskIndices: { type: "array", items: { type: "integer" }, description: "Task indices from get_day" },
        done:        { type: "boolean", description: "true to check off, false to un-check" },
      },
      required: ["date", "taskIndices", "done"],
    },
  },
  {
    name: "append_note",
    description: "Append text to the grower's personal journal note for a day. Never overwrites existing note text; the new text is added on a new line.",
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
  {
    name: "log_grow_data",
    description: "Record grow data for a specific date. Supports: total water amount, temperatures, humidity, and feed description. IMPORTANT: Before calling this, always confirm the values with the grower — e.g. 'Should I log 2 gal water, high 82°F for today?' — and wait for their confirmation or correction. Never log without explicit grower approval.",
    parameters: {
      type: "object",
      properties: {
        date:      { type: "string",  description: "Date to log as YYYY-MM-DD" },
        water_gal: { type: "number",  description: "Total water applied in gallons across all plants (omit if not mentioned)" },
        temp_high: { type: "number",  description: "Day's high temperature in °F (omit if not mentioned)" },
        temp_low:  { type: "number",  description: "Day's low temperature in °F (omit if not mentioned)" },
        humidity:  { type: "number",  description: "Relative humidity percentage (omit if not mentioned)" },
        feed:      { type: "string",  description: "Free-text feed description e.g. 'Fox Farm Trio at half dose' (omit if not mentioned)" },
      },
      required: ["date"],
    },
  },
];
