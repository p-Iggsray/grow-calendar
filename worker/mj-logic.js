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
- **create_event_rule**: add a recurring/timed event (spray, foliar feed) across the cycle
- **delete_event_rule**: remove a recurring event by id
- **add_plant** — add a plant to the Plants roster (call once per plant; e.g. 3× to add three plants)
- **update_plant** — edit a plant's name, type, photo/auto, flower weeks, or status (by plant id)
- **delete_plant** — remove a plant from the roster by id (confirm first — deletes its history)
- **update_grow_profile** — edit profile/setup fields: environment, medium, container type/size, location, experience, watering method, veg length, plants-already-outside, notes

When the grower asks to add, rename, remove, or change plants, just do it with these tools — never tell them you can't manage individual plants. The same goes for profile fields: if they want to change the medium, container, location, or any other setup detail, use update_grow_profile rather than saying you can't.

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
    description: "Read the active grow's current metadata: display name, status, strains, all config date fields, and which phases have custom task overrides. Call this BEFORE any update_grow_* tool so you can show the grower current values and confirm what will change. Also returns the active grow's recurring event rules (eventRules) with their ids.",
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
          description: "Config date fields to change. Each value is a YYYY-MM-DD date string. Only include the keys that are actually changing.",
          properties: {
            start:        { type: "string", description: "Season/hardening start (YYYY-MM-DD)" },
            transplant:   { type: "string", description: "Transplant day (YYYY-MM-DD)" },
            calMag:        { type: "string", description: "Cal-Mag start (YYYY-MM-DD)" },
            feedStart:    { type: "string", description: "Feeding start (YYYY-MM-DD)" },
            fullDose:     { type: "string", description: "Full-dose nutrients start (YYYY-MM-DD)" },
            flush1:       { type: "string", description: "Routine flush 1 (YYYY-MM-DD)" },
            flush2:       { type: "string", description: "Routine flush 2 (YYYY-MM-DD)" },
            flush3:       { type: "string", description: "Routine flush 3 (YYYY-MM-DD)" },
            backyardMove: { type: "string", description: "Move-outside date; set equal to transplant for no move step (YYYY-MM-DD)" },
            preFlower:    { type: "string", description: "Pre-flower transition (YYYY-MM-DD)" },
            flowerStart:  { type: "string", description: "Flower start (YYYY-MM-DD)" },
            gdpFlush:     { type: "string", description: "Primary strain pre-harvest flush (YYYY-MM-DD)" },
            gdpHarvest:   { type: "string", description: "Primary strain harvest (YYYY-MM-DD)" },
            hazeFlush:    { type: "string", description: "Secondary strain pre-harvest flush (YYYY-MM-DD)" },
            hazeHarvest:  { type: "string", description: "Secondary strain harvest (YYYY-MM-DD)" },
          },
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
    name: "create_event_rule",
    description: "Create a recurring or timed event (e.g. a spray, a foliar feed) that appears as a task on every matching day. IMPORTANT: confirm the full rule with the grower before calling. Resolve natural language into a structured window and cadence.",
    parameters: {
      type: "object",
      properties: {
        label: { type: "string", description: "Short name for the event, e.g. 'Neem oil spray' (max 80 chars)." },
        task: { type: "string", description: "The task line shown on each matching day, e.g. 'Spray neem oil on leaf undersides to runoff' (max 200 chars)." },
        window: {
          type: "object",
          description: "When the rule is active. Exactly one shape. range: {type:'range', from:'YYYY-MM-DD', to:'YYYY-MM-DD'}. phase: {type:'phase', phases:[...]} valid phases: transplant, early_veg, veg_cm, veg_half, veg_full, pre_flower, flower, flush, flush_gdp, harvest_gdp, flower_haze, flush_haze, harvest_haze. milestone: {type:'milestone', anchor:'<configKey>', offsetStart:int, offsetEnd:int} valid anchors: start, transplant, calMag, feedStart, fullDose, flush1, flush2, flush3, backyardMove, preFlower, flowerStart, gdpFlush, gdpHarvest, hazeFlush, hazeHarvest. Omit window only when cadence.type is 'dates'.",
        },
        cadence: {
          type: "object",
          description: "Which days inside the window fire. everyDay: {type:'everyDay'}. everyNDays: {type:'everyNDays', n:int, anchor?:'YYYY-MM-DD'} (anchor defaults to grow start). weekdays: {type:'weekdays', days:['mon','thu',...]}. dates: {type:'dates', dates:['YYYY-MM-DD',...]} (window not required).",
        },
      },
      required: ["task", "cadence"],
    },
  },
  {
    name: "delete_event_rule",
    description: "Delete a recurring event rule from the active grow by its id. Use get_grow_info first to find the rule id.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "The event rule id (starts with 'evt_'), from get_grow_info." },
      },
      required: ["id"],
    },
  },
  {
    name: "add_plant",
    description: "Add a plant to the active grow's Plants roster. Call this once per plant — e.g. call it three times to add three plants. If the grower didn't give names/strains, either ask or use sensible names (the grow's existing strains, or 'Plant 1', 'Plant 2', …).",
    parameters: {
      type: "object",
      properties: {
        name:        { type: "string",  description: "Plant or strain name (required, max 60 chars)." },
        type:        { type: "string",  enum: ["indica", "sativa", "hybrid"], description: "Strain type. Defaults to hybrid." },
        photo:       { type: "boolean", description: "true = photoperiod (default), false = autoflower." },
        flowerWeeks: { type: "integer", description: "Expected flowering weeks, 4-20. Defaults to 9." },
      },
      required: ["name"],
    },
  },
  {
    name: "update_plant",
    description: "Update one plant in the active grow's roster by its id. Get plant ids from get_grow_info (the `plants` array). Only include the fields that are changing.",
    parameters: {
      type: "object",
      properties: {
        plant_id:    { type: "string",  description: "The plant id from get_grow_info (starts with 'p_')." },
        name:        { type: "string",  description: "New name (max 60 chars)." },
        type:        { type: "string",  enum: ["indica", "sativa", "hybrid"], description: "Strain type." },
        photo:       { type: "boolean", description: "true = photoperiod, false = autoflower." },
        flowerWeeks: { type: "integer", description: "Expected flowering weeks, 4-20." },
        status:      { type: "string",  enum: ["growing", "harvested", "dead"], description: "Plant status." },
      },
      required: ["plant_id"],
    },
  },
  {
    name: "delete_plant",
    description: "Remove a plant from the active grow's roster by its id (get ids from get_grow_info). IMPORTANT: confirm with the grower first — this also permanently deletes that plant's logged height/health history and can't be undone.",
    parameters: {
      type: "object",
      properties: {
        plant_id: { type: "string", description: "The plant id from get_grow_info (starts with 'p_')." },
      },
      required: ["plant_id"],
    },
  },
  {
    name: "update_grow_profile",
    description: "Update the active grow's profile/setup fields: environment, growing medium, container type/size, location, experience level, watering method, planned veg length, whether plants are already outside, and free-text notes. Call get_grow_info first (see the `profile` object) to show current values and confirm the change. NOTE: this updates the grow's profile/context and (for location) refreshes weather & frost data — it does not rewrite the existing day-by-day calendar.",
    parameters: {
      type: "object",
      properties: {
        environment:            { type: "string",  enum: ["outdoor", "indoor", "greenhouse"], description: "Grow environment." },
        medium:                 { type: "string",  enum: ["soil", "coco", "hydro", "other"], description: "Growing medium." },
        container_type:         { type: "string",  enum: ["fabric", "plastic", "ground", "other"], description: "Container type." },
        container_gallons:      { type: "integer", description: "Container size in gallons (1-400)." },
        location:               { type: "string",  description: "City/region; re-geocoded for weather & frost." },
        experience_level:       { type: "string",  enum: ["beginner", "intermediate", "advanced"], description: "Grower experience level." },
        watering_method:        { type: "string",  enum: ["hand", "drip"], description: "Watering method." },
        veg_weeks:              { type: "integer", description: "Planned veg length in weeks (1-52)." },
        plants_already_outside: { type: "boolean", description: "Whether plants are already in their final outdoor spot." },
        notes:                  { type: "string",  description: "Free-text grow notes (replaces existing notes, max 2000 chars)." },
      },
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
