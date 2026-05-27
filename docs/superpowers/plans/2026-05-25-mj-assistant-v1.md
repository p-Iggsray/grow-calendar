# MJ Assistant v1 (read + act) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the reply-only grow chat with MJ, a tool-calling assistant that answers about the grow AND acts on the user's behalf (checks tasks off, appends daily notes) via an Anthropic tool-use loop in the worker.

**Architecture:** Server-side tool-calling. `POST /api/mj` runs an agentic loop: the model emits `tool_use` blocks, the worker executes them against D1 + the generator, returns `tool_result`, and loops until a final text reply. Tools: `get_day`, `set_tasks_done`, `append_note`. Acts directly (notes append-only). Testable logic is kept pure (no D1 faking); D1 I/O is thin shared helpers; the worker bundle is verified via `wrangler --dry-run`.

**Tech Stack:** Cloudflare Workers + D1, Anthropic Messages API (tool use, `claude-haiku-4-5`), Vite + React 18. Tests use Node's built-in `node:test` (no new deps).

---

## Scope notes

- v1 is read + act only. Plan-editing (dates/dosing/per-day overrides), write endpoints, and confirm-before-write are v2.
- v1 pulls in two foundation-deferred prerequisites because server-side acting needs them: the `dates.js` React split (so the worker can import the generator) and `buildPlanText` (live AI context, retiring `worker/growContext.js`).
- No new D1 tables. Uses existing `task_checkoffs`, `day_notes`, `plan_config`, `plan_day_overrides`.

## File structure

- Create `src/lib/dates-core.js` - pure date helpers (no React). `dates.js` keeps `useToday` + re-exports core. `growData.js` imports core.
- Create `src/lib/planText.js` - `buildPlanText(config, overrides)` generated season overview for the system prompt.
- Modify `src/lib/planConfig.js` - export `parseDate`.
- Modify `worker/checkoffs.js` - extract `readCheckoffs`/`writeCheckoffs`; handlers delegate.
- Modify `worker/notes.js` - extract `readNote`/`writeNote` + export `MAX_NOTE_LEN`; handlers delegate.
- Modify `worker/plan.js` - extract `loadRawPlan(env)`; `getPlan` delegates.
- Create `worker/mj-logic.js` - pure helpers (`mergeChecked`, `appendNoteText`, `buildDayView`) + `MJ_PERSONA` + `MJ_TOOLS`. Unit tested.
- Create `worker/mj.js` - tool-use loop, tool executor, `pickModel` seam.
- Modify `worker/index.js` - route `POST /api/mj`; remove `/api/chat`.
- Delete `worker/chat.js`, `worker/growContext.js`.
- Modify `src/lib/api.js` - `mj()` replaces `chat()`.
- Modify `src/components/ChatPanel.jsx` - drive `/api/mj`, render actions, MJ branding.
- Create `test/plan-text.test.js`, `test/mj-logic.test.js`.

---

### Task 1: Split dates.js into a React-free core

**Files:**
- Create: `src/lib/dates-core.js`
- Modify: `src/lib/dates.js`
- Modify: `src/lib/growData.js` (import line only)

- [ ] **Step 1: Create the pure core module**

Create `src/lib/dates-core.js`:

```js
// Pure date helpers. No React, no DOM - safe to import in the Cloudflare Worker.
export function getToday() {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export const DOW_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

export function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function daysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ua - ub) / 86400000);
}

export const fmt  = d => `${MONTH_NAMES[d.getMonth()].slice(0, 3)} ${d.getDate()}`;
export const fmtL = d => `${MONTH_NAMES[d.getMonth()]} ${d.getDate()}`;
```

- [ ] **Step 2: Reduce dates.js to the React hook + re-export**

Replace the ENTIRE contents of `src/lib/dates.js` with:

```js
import { useState, useEffect } from "react";
import { getToday } from "./dates-core.js";

// Re-export the pure helpers so existing `from "./dates.js"` imports keep working.
export * from "./dates-core.js";

export function useToday() {
  const [today, setToday] = useState(getToday);
  useEffect(() => {
    const midnight = new Date();
    midnight.setHours(24, 0, 0, 0);
    const id = setTimeout(() => setToday(getToday()), midnight - Date.now());
    return () => clearTimeout(id);
  }, [today]);
  return today;
}
```

- [ ] **Step 3: Point growData.js at the core**

In `src/lib/growData.js`, change the date-helpers import line from `from "./dates.js"` to `from "./dates-core.js"`:

```js
import { sameDay, daysBetween, fmt, fmtL } from "./dates-core.js";
```

- [ ] **Step 4: Verify no behavior change**

Run: `npm test`
Expected: all existing tests pass (the parity test proves the generator output is unchanged after the import swap).

Run: `npm run build`
Expected: Vite build succeeds (frontend `useToday`/helper imports from `dates.js` still resolve via the re-export).

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates-core.js src/lib/dates.js src/lib/growData.js
git commit -m "refactor: split pure date helpers into dates-core so the worker can import the generator

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Generated plan overview (buildPlanText)

**Files:**
- Create: `src/lib/planText.js`
- Test: `test/plan-text.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/plan-text.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPlanText } from "../src/lib/planText.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

test("buildPlanText contains the key schedule dates and threats", () => {
  const text = buildPlanText(parseConfig(DEFAULT_CONFIG), {});
  // transplant, feeding start, the three flush days, GDP harvest, Haze harvest
  for (const iso of ["2026-05-24", "2026-06-21", "2026-06-24", "2026-07-24", "2026-08-24", "2026-09-27", "2026-10-18"]) {
    assert.ok(text.includes(iso), `expected ${iso} in plan text`);
  }
  assert.ok(text.includes("THREATS"), "expected a threats section");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/plan-text.test.js`
Expected: FAIL, cannot find module `../src/lib/planText.js`.

- [ ] **Step 3: Implement planText.js**

Create `src/lib/planText.js`:

```js
import { getPhase, getDetail, buildMilestones, THREATS } from "./growData.js";

// Compact, LIVE season overview for MJ's system prompt. Sampled from the generator
// at milestone dates so dosing language comes from the generated task text (single
// source), not hand-authored prose. MJ uses the get_day tool for per-day specifics.
export function buildPlanText(config, overrides) {
  const lines = ["THE GROW PLAN (live schedule):"];
  for (const m of buildMilestones(config)) {
    const detail = getDetail(m.date, config, overrides);
    if (!detail) continue;
    const phase = getPhase(m.date, config);
    lines.push(`\n- ${m.label} (${ymd(m.date)}, phase: ${phase}): ${detail.summary}`);
    for (const t of detail.tasks.slice(0, 4)) lines.push(`    • ${t}`);
  }

  const keyDates = {
    fullDose: "Full-dose feeding begins",
    flush1: "Routine flush #1",
    flush2: "Routine flush #2",
    flush3: "Routine flush #3",
    gdpFlush: "GDP pre-harvest flush begins",
    hazeFlush: "Haze pre-harvest flush begins",
  };
  lines.push("\nKEY DATES:");
  for (const [key, label] of Object.entries(keyDates)) {
    lines.push(`- ${label}: ${ymd(config[key])}`);
  }

  lines.push("\nSEASON THREATS:");
  for (const t of THREATS) lines.push(`- ${t.title}: ${t.desc}`);

  return lines.join("\n");
}

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/plan-text.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planText.js test/plan-text.test.js
git commit -m "feat: generated live plan overview (buildPlanText) for the AI context

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Extract shared data-access helpers

Mechanical extraction so MJ tools and the existing HTTP handlers share one implementation. No behavior change to the endpoints.

**Files:**
- Modify: `worker/checkoffs.js`
- Modify: `worker/notes.js`
- Modify: `worker/plan.js`
- Modify: `src/lib/planConfig.js`

- [ ] **Step 1: Extract checkoffs helpers**

In `worker/checkoffs.js`, add these two exported functions (above `getCheckoffs`):

```js
export async function readCheckoffs(env, userId, date) {
  const result = await env.DB.prepare(
    "SELECT task_index FROM task_checkoffs WHERE user_id = ? AND date = ? ORDER BY task_index",
  ).bind(userId, date).all();
  return (result.results || []).map(r => r.task_index);
}

export async function writeCheckoffs(env, userId, date, checkedIndices) {
  const now = nowIso();
  const statements = [
    env.DB.prepare("DELETE FROM task_checkoffs WHERE user_id = ? AND date = ?").bind(userId, date),
  ];
  for (const idx of checkedIndices) {
    statements.push(
      env.DB.prepare(
        "INSERT INTO task_checkoffs (user_id, date, task_index, checked_at) VALUES (?, ?, ?, ?)",
      ).bind(userId, date, idx, now),
    );
  }
  await env.DB.batch(statements);
}
```

Then make the handlers delegate. Replace the body of `getCheckoffs` after the auth + `DATE_RE` checks with:

```js
  return json({ date, checked: await readCheckoffs(env, user.id, date) });
```

Replace the body of `putCheckoffs` after it computes the filtered `checked` array (the `.map(Number).filter(...)` block) with:

```js
  await writeCheckoffs(env, user.id, date, checked);
  return json({ date, checked });
```

(Remove the now-duplicated inline DELETE/INSERT/batch block from `putCheckoffs`.)

- [ ] **Step 2: Extract notes helpers**

In `worker/notes.js`, change `const MAX_BODY_LEN = 20000;` to an export and add the helpers:

```js
export const MAX_NOTE_LEN = 20000;

export async function readNote(env, userId, date) {
  const row = await env.DB.prepare(
    "SELECT body FROM day_notes WHERE user_id = ? AND date = ?",
  ).bind(userId, date).first();
  return row?.body ?? "";
}

export async function writeNote(env, userId, date, body) {
  const text = body ?? "";
  if (text.trim() === "") {
    await env.DB.prepare(
      "DELETE FROM day_notes WHERE user_id = ? AND date = ?",
    ).bind(userId, date).run();
    return "";
  }
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO day_notes (user_id, date, body, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  ).bind(userId, date, text, now).run();
  return text;
}
```

Update references to the old `MAX_BODY_LEN` in `putNote` to `MAX_NOTE_LEN`, and make `getNote`/`putNote` delegate. Replace the body of `getNote` after the auth + `DATE_RE` checks with:

```js
  return json({ date, body: await readNote(env, user.id, date) });
```

Replace the body of `putNote` after the `MAX_NOTE_LEN` length check with:

```js
  const stored = await writeNote(env, user.id, date, text);
  return json({ date, body: stored });
```

(Remove the now-duplicated inline DELETE/upsert block from `putNote`. Keep the `typeof body?.body !== "string"` and length validations in `putNote`.)

- [ ] **Step 3: Extract the plan loader**

In `worker/plan.js`, add an exported `loadRawPlan` and refactor `getPlan` to use it. The file currently inlines the D1 load in `getPlan`. Add:

```js
export async function loadRawPlan(env) {
  let config = DEFAULT_CONFIG;
  const row = await env.DB.prepare("SELECT config FROM plan_config WHERE id = 1").first();
  if (row?.config) {
    try { config = JSON.parse(row.config); }
    catch { console.error("plan_config JSON parse failed; using defaults"); }
  }
  const overrides = {};
  const res = await env.DB.prepare("SELECT date, payload FROM plan_day_overrides").all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }
  return { config, overrides };
}
```

Then replace the load body inside `getPlan` (after the `currentUser` auth check) with:

```js
  const { config, overrides } = await loadRawPlan(env);
  return json({ config, overrides });
```

- [ ] **Step 4: Export parseDate from planConfig**

In `src/lib/planConfig.js`, the file has a private `function parseDate(iso)`. Add the `export` keyword: `export function parseDate(iso) {`. (No other change; `parseConfig` keeps using it.)

- [ ] **Step 5: Verify no behavior change**

Run: `npm test`
Expected: all tests still pass (Task 2's plan-text test and the foundation tests; this task adds no tests but must not break any).

Run: `npx wrangler deploy --dry-run --outdir .wrangler/tmp-dryrun`
Expected: bundles successfully (the worker files still compile; do not commit `.wrangler/`).

- [ ] **Step 6: Commit**

```bash
git add worker/checkoffs.js worker/notes.js worker/plan.js src/lib/planConfig.js
git commit -m "refactor: extract shared read/write helpers for checkoffs, notes, and plan load

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Pure MJ tool logic

**Files:**
- Create: `worker/mj-logic.js`
- Test: `test/mj-logic.test.js`

- [ ] **Step 1: Write the failing tests**

Create `test/mj-logic.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeChecked, appendNoteText, buildDayView } from "../worker/mj-logic.js";

test("mergeChecked adds indices, dedupes, sorts ascending", () => {
  assert.deepEqual(mergeChecked([2, 1], [3, 1], true), [1, 2, 3]);
});

test("mergeChecked removes indices when done=false", () => {
  assert.deepEqual(mergeChecked([1, 2, 3], [2], false), [1, 3]);
});

test("appendNoteText appends with a newline separator", () => {
  assert.equal(appendNoteText("foo", "bar"), "foo\nbar");
});

test("appendNoteText creates the note when existing is empty or null", () => {
  assert.equal(appendNoteText("", "bar"), "bar");
  assert.equal(appendNoteText(null, "bar"), "bar");
});

test("appendNoteText ignores a blank addition", () => {
  assert.equal(appendNoteText("foo", "   "), "foo");
});

test("buildDayView maps tasks with done flags and splits guidance/userNote", () => {
  const detail = { title: "T", summary: "S", tasks: ["a", "b", "c"], notes: "guide" };
  const v = buildDayView("2026-06-12", "veg_cm", detail, [0, 2], "my note");
  assert.equal(v.date, "2026-06-12");
  assert.equal(v.phase, "veg_cm");
  assert.equal(v.tasks.length, 3);
  assert.deepEqual(v.tasks[0], { index: 0, text: "a", done: true });
  assert.deepEqual(v.tasks[1], { index: 1, text: "b", done: false });
  assert.equal(v.guidance, "guide");
  assert.equal(v.userNote, "my note");
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/mj-logic.test.js`
Expected: FAIL, cannot find module `../worker/mj-logic.js`.

- [ ] **Step 3: Implement mj-logic.js**

Create `worker/mj-logic.js`:

```js
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/mj-logic.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add worker/mj-logic.js test/mj-logic.test.js
git commit -m "feat: pure MJ tool logic (merge checkoffs, append note, day view) + tool schemas

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: MJ worker route (tool-use loop)

**Files:**
- Create: `worker/mj.js`
- Modify: `worker/index.js`
- Modify: `src/lib/api.js`
- Delete: `worker/chat.js`, `worker/growContext.js`

- [ ] **Step 1: Create the MJ route handler**

Create `worker/mj.js`:

```js
import { json, error } from "./util.js";
import { currentUser } from "./auth.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1024;
const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Model-selection seam. v1: always Claude with the shared key. Future: a non-owner
// user could route to Gemini (env.GEMINI_API_KEY). Not wired - single user today.
function pickModel(user, env) {
  return { model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY };
}

export async function postMj(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return error(400, "messages must be a non-empty array");
  }

  const { model, apiKey } = pickModel(user, env);
  if (!apiKey) return error(503, "MJ is not configured yet");

  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: typeof m?.content === "string" ? m.content.slice(0, MAX_MSG_LEN) : "",
    }))
    .filter(m => m.content !== "");
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return error(400, "the last message must be from the user");
  }

  const raw = await loadRawPlan(env);
  const config = parseConfig(raw.config);
  const overrides = raw.overrides;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const system = [
    { type: "text", text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache_control: { type: "ephemeral" } },
    { type: "text", text: `Today's date is ${today}.` },
  ];

  const actions = [];
  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = "";

  for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
    let data;
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, tools: MJ_TOOLS, messages: apiMessages }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("anthropic error", res.status, detail);
        return error(502, "the AI service returned an error");
      }
      data = await res.json();
    } catch {
      return error(502, "could not reach the AI service");
    }

    const content = Array.isArray(data.content) ? data.content : [];
    finalText = content.filter(b => b.type === "text").map(b => b.text).join("").trim();

    if (data.stop_reason !== "tool_use") {
      return json({ reply: finalText || "(no response)", actions });
    }

    apiMessages.push({ role: "assistant", content });
    const toolResults = [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const result = await executeTool(b, env, user.id, config, overrides, actions);
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
    }
    apiMessages.push({ role: "user", content: toolResults });
  }

  return json({ reply: finalText || "I stopped after several steps - could you rephrase?", actions });
}

async function executeTool(block, env, userId, config, overrides, actions) {
  const { name, input } = block;
  try {
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    const detail = getDetail(dt, config, overrides);
    if (!detail) return { error: `no plan for ${date} (outside the grow season)` };

    if (name === "get_day") {
      const phase = getPhase(dt, config);
      const checked = await readCheckoffs(env, userId, date);
      const userNote = await readNote(env, userId, date);
      return buildDayView(date, phase, detail, checked, userNote);
    }

    if (name === "set_tasks_done") {
      const indices = Array.isArray(input.taskIndices)
        ? input.taskIndices.map(Number).filter(Number.isInteger) : null;
      if (!indices) return { error: "taskIndices must be an array of integers" };
      if (typeof input.done !== "boolean") return { error: "done must be a boolean" };
      const inRange = indices.filter(i => i >= 0 && i < detail.tasks.length);
      const ignored = indices.filter(i => i < 0 || i >= detail.tasks.length);
      const current = await readCheckoffs(env, userId, date);
      const next = mergeChecked(current, inRange, input.done);
      await writeCheckoffs(env, userId, date, next);
      actions.push({ type: "set_tasks_done", date, summary: describeChecked(detail, inRange, input.done) });
      return { date, checked: next, ignored };
    }

    if (name === "append_note") {
      if (typeof input.text !== "string" || input.text.trim() === "") {
        return { error: "text must be a non-empty string" };
      }
      const existing = await readNote(env, userId, date);
      const note = appendNoteText(existing, input.text);
      if (note.length > MAX_NOTE_LEN) return { error: "note would exceed the maximum length" };
      await writeNote(env, userId, date, note);
      actions.push({ type: "append_note", date, summary: `Added to ${date} note` });
      return { date, note };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    console.error("tool execution error", name, err);
    return { error: "tool failed to execute" };
  }
}

function describeChecked(detail, indices, done) {
  const verb = done ? "Marked done" : "Un-checked";
  if (indices.length === 1) {
    const t = detail.tasks[indices[0]] || "";
    return `${verb}: ${t.slice(0, 60)}`;
  }
  return `${verb} ${indices.length} tasks`;
}
```

- [ ] **Step 2: Route it and remove the old chat route**

In `worker/index.js`: remove the line `import { postChat } from "./chat.js";` and add `import { postMj } from "./mj.js";`. Replace the route line `if (path === "/api/chat" && method === "POST") return postChat(request, env);` with:

```js
  if (path === "/api/mj" && method === "POST") return postMj(request, env);
```

- [ ] **Step 3: Swap the frontend API wrapper**

In `src/lib/api.js`, replace the `chat` entry:

```js
  chat: (messages) =>
    request("/api/chat", { method: "POST", body: JSON.stringify({ messages }) }),
```

with:

```js
  mj: (messages) =>
    request("/api/mj", { method: "POST", body: JSON.stringify({ messages }) }),
```

- [ ] **Step 4: Delete the retired files**

```bash
git rm worker/chat.js worker/growContext.js
```

- [ ] **Step 5: Verify the worker bundles**

Run: `npx wrangler deploy --dry-run --outdir .wrangler/tmp-dryrun`
Expected: bundles successfully. This is the key check that the worker now imports the generator (`growData.js` -> `dates-core.js`), `planText.js`, and `planConfig.js` WITHOUT pulling in React, and that nothing still imports the deleted `chat.js`/`growContext.js`. Do not commit `.wrangler/`.

Run: `npm test`
Expected: all tests still pass (no test imports the deleted files).

- [ ] **Step 6: Commit**

```bash
git add worker/mj.js worker/index.js src/lib/api.js
git commit -m "feat: MJ worker route with Anthropic tool-use loop (get_day, set_tasks_done, append_note)

Replaces the reply-only /api/chat. Retires chat.js and the hand-authored
growContext.js in favor of the generated buildPlanText context.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: MJ chat UI

**Files:**
- Modify: `src/components/ChatPanel.jsx`
- Modify: `src/App.jsx` (button label only)

- [ ] **Step 1: Drive /api/mj and render actions**

In `src/components/ChatPanel.jsx`:

Change the `SUGGESTIONS` array to hint at actions:

```js
const SUGGESTIONS = [
  "What should I be doing today?",
  "Mark today's watering done",
  "Add a note to today: lower leaves yellowing",
];
```

Change the message-state comment and `send()` to call `api.mj` and capture actions. The current `send()` sets `setMessages([...next, { role: "assistant", content: reply }])`. Replace the `try` block in `send()` with:

```js
    try {
      const { reply, actions } = await api.mj(next);
      setMessages([...next, { role: "assistant", content: reply, actions: actions || [] }]);
    } catch (err) {
      setError(err.message || "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
```

Update the message render to pass actions to the bubble. Change `{messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} />)}` to:

```jsx
        {messages.map((m, i) => <Bubble key={i} role={m.role} text={m.content} actions={m.actions} />)}
```

Update the `Bubble` component to render an actions chip list under assistant text. Replace the `Bubble` function with:

```jsx
function Bubble({ role, text, dim, actions }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: isUser ? "flex-end" : "flex-start" }}>
      <div style={{
        maxWidth: "82%", whiteSpace: "pre-wrap", lineHeight: 1.6, fontSize: 14,
        padding: "10px 13px", borderRadius: 12,
        background: isUser ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.05)",
        border: `1px solid ${isUser ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
        color: dim ? "#5a7a5a" : (isUser ? "#e8f5e3" : "#d6e6d6"),
        borderBottomRightRadius: isUser ? 4 : 12,
        borderBottomLeftRadius: isUser ? 12 : 4,
      }}>{text}</div>
      {actions && actions.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6, maxWidth: "82%" }}>
          {actions.map((a, i) => (
            <span key={i} style={{
              fontSize: 11, fontFamily: "'Courier New', monospace",
              color: "#4ade80", background: "rgba(34,197,94,0.1)",
              border: "1px solid rgba(34,197,94,0.25)", borderRadius: 8, padding: "3px 8px",
            }}>
              {a.type === "append_note" ? "📝" : "✓"} {a.summary}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: MJ branding**

In `src/components/ChatPanel.jsx`, change the header text. Replace the header label block:

```jsx
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#5a8a5a", textTransform: "uppercase" }}>Grow Assistant</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Ask about your grow</div>
```

with:

```jsx
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: "#5a8a5a", textTransform: "uppercase" }}>MJ</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.3 }}>Your grow assistant</div>
```

Update the empty-state copy line that begins "Ask anything about your plants" to mention actions:

```jsx
              Ask anything about your grow, or tell me to do things - check off today's tasks, add to your daily notes. I know your full plan.
```

In `src/App.jsx`, change the floating button label from `🌿 Ask` to `🌿 MJ` (the text content of the chat-open `<button>`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: Vite build succeeds, no unresolved references (`api.mj` exists; `api.chat` is gone and nothing else references it).

Run: `npm test`
Expected: all tests still pass.

- [ ] **Step 4: Commit**

```bash
git add src/components/ChatPanel.jsx src/App.jsx
git commit -m "feat: MJ chat UI - drives /api/mj, renders actions taken, MJ branding

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Full verification and PR

**Files:** none (verification only)

- [ ] **Step 1: Test suite + build**

Run: `npm test`
Expected: all PASS (plan-config, plan-parity, plan-overrides, plan-text, mj-logic).

Run: `npm run build`
Expected: success.

- [ ] **Step 2: Worker bundle**

Run: `npx wrangler deploy --dry-run --outdir .wrangler/tmp-dryrun`
Expected: bundles cleanly. (Do not commit `.wrangler/`.)

- [ ] **Step 3: Manual MJ acting test (local stack)**

Per DEV.md: terminal 1 `npm run dev`, terminal 2 `npx wrangler dev`. The local D1 must have the foundation schema + seed (from the prior sub-project). A local `.dev.vars` with `ANTHROPIC_API_KEY=sk-ant-...` is required for MJ to answer (without it MJ returns "not configured"). Sign in with the local `test` account, open MJ, and verify:
- "What should I do today?" returns a grounded answer.
- "Mark today's watering done" -> MJ replies confirming, an action chip appears, and opening today's day view shows the task checked.
- "Add a note to today: GDP looks droopy" -> MJ confirms, and the day's note contains the appended text (open the day to confirm; the note is appended, not overwritten if one existed).
- Confirm in local D1 if desired:
  `npx wrangler d1 execute grow-calendar-db --local --command="SELECT * FROM task_checkoffs ORDER BY date DESC LIMIT 5;"`

- [ ] **Step 4: Push and open the PR**

```bash
git push -u origin claude/mj-assistant-v1
gh pr create --title "MJ assistant v1 (read + act)" --body "Replaces the reply-only grow chat with MJ: a tool-calling assistant that answers AND acts (checks tasks off, appends daily notes) via an Anthropic tool-use loop in the worker.

Tools: get_day, set_tasks_done, append_note (notes append-only; acts directly). Pulls in the foundation-deferred dates.js React split and buildPlanText (live AI context, retiring growContext.js) as prerequisites for server-side acting. Plan-editing is v2.

No new D1 tables. Requires ANTHROPIC_API_KEY as a Worker secret in production (already a tracked prerequisite); without it MJ returns 'not configured'.

Design + plan: docs/superpowers/specs/2026-05-25-mj-assistant-v1-design.md, docs/superpowers/plans/2026-05-25-mj-assistant-v1.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Deploy notes

- No new D1 tables; nothing new to migrate remotely for v1.
- `ANTHROPIC_API_KEY` Worker secret must be set in production (`npx wrangler secret put ANTHROPIC_API_KEY`) or MJ returns "not configured" (the app otherwise works).
- The foundation's remote prerequisites (plan_config schema + seed) must already be applied, since MJ's context load and get_day depend on the plan tables.

## Deferred to v2

Plan-editing tools and the write endpoints they need (`PUT /api/plan/config`, override CRUD), dosing extraction into config, confirm-before-write UX, and the Gemini branch of `pickModel`.
