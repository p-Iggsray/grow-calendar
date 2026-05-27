# MJ Per-user Model Routing (A2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route MJ per user (owner -> paid Claude, everyone else -> free Gemini 2.5 Flash on a shared key), with a per-user daily message cap and graceful Gemini quota handling.

**Architecture:** Abstract MJ's provider behind two adapter modules (`worker/providers/anthropic.js`, `worker/providers/gemini.js`) each running its native tool-use loop and sharing `executeTool`, the tool definitions, the system content, and the actions array. `postMj` picks the provider from the user's role, applies a `mj_usage` daily cap for non-admins, and maps provider errors to HTTP responses.

**Tech Stack:** Cloudflare Workers, D1, React 18, Vite, `node --test`. No schema change (the `mj_usage` table exists from A1).

**Spec:** `docs/superpowers/specs/2026-05-27-mj-model-routing-a2-design.md` (epic #90, issue #91 / A2).

---

## File structure

**Created:**
- `worker/providers/errors.js` — `ProviderError { kind }`.
- `worker/providers/anthropic.js` — `runAnthropic(...)` (today's Anthropic loop, lifted out).
- `worker/providers/gemini.js` — `runGemini(...)` + pure `toGeminiContents`, `buildGeminiBody`, `parseGeminiResponse`.
- `test/gemini-map.test.js`, `test/pick-model.test.js`, `test/mj-usage.test.js`.

**Modified:**
- `worker/mj-logic.js` — `MJ_TOOLS` uses `parameters` (neutral) instead of `input_schema`.
- `worker/mj.js` — `pickModel` routes by role; `postMj` is provider-agnostic (systemSegments + executeToolUse + dispatch + error mapping); `executeTool(name, input, ...)`; per-user cap.
- `DEV.md` — document per-user MJ routing + the daily cap.

---

## Task 1: Neutralize the shared tool schema

**Files:** Modify `worker/mj-logic.js`.

- [ ] **Step 1: Rename `input_schema` to `parameters` in all three tools**

In `worker/mj-logic.js`, each entry of `MJ_TOOLS` currently has an `input_schema:` key. Rename that key to `parameters:` for all three tools (`get_day`, `set_tasks_done`, `append_note`). The schema object contents are unchanged. Example for `get_day`:

```js
  {
    name: "get_day",
    description: "Get a single day's plan detail: phase, title, summary, the task list with their indices and done-state, the plan's guidance note, and the grower's personal note. Call this before checking tasks off so you know the correct task indices.",
    parameters: {
      type: "object",
      properties: { date: { type: "string", description: "Target day as YYYY-MM-DD" } },
      required: ["date"],
    },
  },
```
Do the same `input_schema` -> `parameters` rename for `set_tasks_done` and `append_note`. Nothing else changes in this file.

- [ ] **Step 2: Confirm nothing else reads `input_schema`**

Run: `grep -rn "input_schema" worker/ src/ test/`
Expected: the only place that referenced it was `worker/mj.js` (the Anthropic request body), which Task 2 moves into the adapter. If grep shows `mj.js` still uses `MJ_TOOLS` directly with `input_schema`, that is fine for now — Task 2 fixes `mj.js`. There must be no OTHER consumer.

- [ ] **Step 3: Run tests + build**

Run: `npm test` (23 tests pass — none assert the tool key) and `npm run build` (succeeds).

- [ ] **Step 4: Commit**

```bash
git add worker/mj-logic.js
git commit -m "refactor: neutral tool schema (parameters) for multi-provider MJ"
```

---

## Task 2: Anthropic adapter + executeTool refactor + provider-agnostic postMj (owner path preserved)

**Files:** Create `worker/providers/errors.js`, `worker/providers/anthropic.js`. Modify `worker/mj.js`.

- [ ] **Step 1: Create `worker/providers/errors.js`**

```js
// Typed error so postMj can map provider failures to the right HTTP status.
export class ProviderError extends Error {
  constructor(kind) {
    super(kind);              // kind: "quota" | "upstream" | "unreachable"
    this.name = "ProviderError";
    this.kind = kind;
  }
}
```

- [ ] **Step 2: Create `worker/providers/anthropic.js`**

```js
import { ProviderError } from "./errors.js";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_TOKENS = 1024;

// runConversation contract:
//   ({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) -> { reply }
// systemSegments: [{ text, cache }]; tools: [{ name, description, parameters }];
// messages: [{ role: "user"|"assistant", content }]; executeToolUse(name, input) -> result object.
export async function runAnthropic({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) {
  const system = systemSegments.map(s => ({
    type: "text",
    text: s.text,
    ...(s.cache ? { cache_control: { type: "ephemeral" } } : {}),
  }));
  const anthropicTools = tools.map(t => ({ name: t.name, description: t.description, input_schema: t.parameters }));
  const apiMessages = messages.map(m => ({ role: m.role, content: m.content }));
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let data;
    try {
      const res = await fetch(ANTHROPIC_URL, {
        method: "POST",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
        body: JSON.stringify({ model, max_tokens: MAX_TOKENS, system, tools: anthropicTools, messages: apiMessages }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("anthropic error", res.status, detail);
        throw new ProviderError("upstream");
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unreachable");
    }

    const content = Array.isArray(data.content) ? data.content : [];
    finalText = content.filter(b => b.type === "text").map(b => b.text).join("").trim();

    if (data.stop_reason !== "tool_use") return { reply: finalText || "(no response)" };

    apiMessages.push({ role: "assistant", content });
    const toolResults = [];
    for (const b of content) {
      if (b.type !== "tool_use") continue;
      const result = await executeToolUse(b.name, b.input);
      toolResults.push({ type: "tool_result", tool_use_id: b.id, content: JSON.stringify(result) });
    }
    apiMessages.push({ role: "user", content: toolResults });
  }
  return { reply: finalText || "I stopped after several steps - could you rephrase?" };
}
```

- [ ] **Step 3: Rewrite `worker/mj.js` to use the adapter and the new `executeTool` signature**

Replace the imports/constants/`pickModel`/`postMj`/`executeTool` so the file reads as below. Keep `describeChecked` exactly as it is at the bottom of the current file (do not change it). `pickModel` still returns Anthropic for everyone in this task (routing is generalized in Task 4) but now includes a `provider` field.

```js
import { json, error } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { buildPlanText } from "../src/lib/planText.js";
import { readCheckoffs, writeCheckoffs } from "./checkoffs.js";
import { readNote, writeNote, MAX_NOTE_LEN } from "./notes.js";
import { MJ_PERSONA, MJ_TOOLS, mergeChecked, appendNoteText, buildDayView } from "./mj-logic.js";
import { runAnthropic } from "./providers/anthropic.js";
import { ProviderError } from "./providers/errors.js";

const MAX_MESSAGES = 20;
const MAX_MSG_LEN = 4000;
const MAX_TOOL_ITERATIONS = 6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Provider routing. Task 4 sends non-admins to Gemini; for now everyone uses Claude.
export function pickModel(user, env) {
  return { provider: "anthropic", model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY };
}

export async function postMj(request, env, user) {
  let body;
  try { body = await request.json(); }
  catch { return error(400, "invalid json"); }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return error(400, "messages must be a non-empty array");
  }

  const { provider, model, apiKey } = pickModel(user, env);
  if (!apiKey) return error(503, "MJ is not configured yet");

  const messages = body.messages
    .slice(-MAX_MESSAGES)
    .map(m => ({
      role: m && m.role === "assistant" ? "assistant" : "user",
      content: typeof m?.content === "string" ? m.content.slice(0, MAX_MSG_LEN) : "",
    }))
    .filter(m => m.content !== "");
  // The length === 0 check must stay first: it short-circuits the array access
  // so the .role read never runs on an empty array. Do not reorder.
  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return error(400, "the last message must be from the user");
  }

  const raw = await loadRawPlan(env, user.id);
  const config = parseConfig(raw.config);
  const overrides = raw.overrides;

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const systemSegments = [
    { text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache: true },
    { text: `Today's date is ${today}.`, cache: false },
  ];

  const actions = [];
  const executeToolUse = (name, input) => executeTool(name, input, env, user.id, config, overrides, actions);

  const run = runAnthropic; // Task 4 selects between providers
  try {
    const { reply } = await run({
      apiKey, model, systemSegments, tools: MJ_TOOLS, messages, executeToolUse, maxIterations: MAX_TOOL_ITERATIONS,
    });
    return json({ reply, actions });
  } catch (e) {
    if (e instanceof ProviderError && e.kind === "quota") {
      return error(429, "MJ has hit today's limit, please try again later");
    }
    if (e instanceof ProviderError && e.kind === "unreachable") {
      return error(502, "could not reach the AI service");
    }
    console.error("MJ provider error", e);
    return error(502, "the AI service returned an error");
  }
}

async function executeTool(name, input, env, userId, config, overrides, actions) {
  try {
    const date = input?.date;
    if (typeof date !== "string" || !DATE_RE.test(date)) return { error: "date must be YYYY-MM-DD" };
    const dt = parseDate(date);
    const phase = getPhase(dt, config);
    if (!phase) return { error: `no plan for ${date} (outside the grow season)` };

    if (name === "get_day") {
      const detail = getDetail(dt, config, overrides);
      const checked = await readCheckoffs(env, userId, date);
      const userNote = await readNote(env, userId, date);
      return buildDayView(date, phase, detail, checked, userNote);
    }

    if (name === "set_tasks_done") {
      const indices = Array.isArray(input?.taskIndices)
        ? input.taskIndices.map(Number).filter(Number.isInteger) : null;
      if (!indices) return { error: "taskIndices must be an array of integers" };
      if (typeof input?.done !== "boolean") return { error: "done must be a boolean" };
      const detail = getDetail(dt, config, overrides);
      const inRange = indices.filter(i => i >= 0 && i < detail.tasks.length);
      const ignored = indices.filter(i => i < 0 || i >= detail.tasks.length);
      const current = await readCheckoffs(env, userId, date);
      const next = mergeChecked(current, inRange, input.done);
      await writeCheckoffs(env, userId, date, next);
      actions.push({ type: "set_tasks_done", date, summary: describeChecked(detail, inRange, input.done) });
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
      actions.push({ type: "append_note", date, summary: `Added to ${date} note` });
      return { date, note };
    }

    return { error: `unknown tool: ${name}` };
  } catch (err) {
    console.error("tool execution error", name, err);
    return { error: "tool failed to execute" };
  }
}
```
Then keep the existing `describeChecked` function below unchanged.

- [ ] **Step 4: Verify build, bundle, and tests**

Run `npm test` (23 pass), `npm run build` (succeeds), and `npx wrangler deploy --dry-run --outdir=.wrangler-dryrun-a2t2` (worker bundles; resolves the new `./providers/*` imports). Then `rm -rf .wrangler-dryrun-a2t2` (do not commit it).

- [ ] **Step 5: Commit**

```bash
git add worker/providers/errors.js worker/providers/anthropic.js worker/mj.js
git commit -m "refactor: extract Anthropic provider adapter; provider-agnostic postMj"
```

---

## Task 3: Gemini adapter (pure mappers + loop) + tests

**Files:** Create `worker/providers/gemini.js`, `test/gemini-map.test.js`.

- [ ] **Step 1: Write the failing test `test/gemini-map.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { toGeminiContents, buildGeminiBody, parseGeminiResponse } from "../worker/providers/gemini.js";

const tools = [
  { name: "get_day", description: "d", parameters: { type: "object", properties: { date: { type: "string" } }, required: ["date"] } },
];
const systemSegments = [{ text: "persona+plan", cache: true }, { text: "Today is 2026-05-27.", cache: false }];

test("toGeminiContents maps roles assistant->model and wraps text parts", () => {
  const out = toGeminiContents([{ role: "user", content: "hi" }, { role: "assistant", content: "yo" }]);
  assert.deepEqual(out, [
    { role: "user", parts: [{ text: "hi" }] },
    { role: "model", parts: [{ text: "yo" }] },
  ]);
});

test("buildGeminiBody shapes systemInstruction, functionDeclarations, and disables thinking", () => {
  const body = buildGeminiBody({ systemSegments, tools, contents: toGeminiContents([{ role: "user", content: "hi" }]) });
  assert.deepEqual(body.systemInstruction.parts, [{ text: "persona+plan" }, { text: "Today is 2026-05-27." }]);
  assert.equal(body.tools[0].functionDeclarations[0].name, "get_day");
  assert.deepEqual(body.tools[0].functionDeclarations[0].parameters, tools[0].parameters);
  assert.equal(body.generationConfig.thinkingConfig.thinkingBudget, 0);
});

test("parseGeminiResponse extracts text and functionCalls", () => {
  const data = { candidates: [{ content: { role: "model", parts: [
    { text: "ok" },
    { functionCall: { name: "get_day", args: { date: "2026-06-01" } } },
  ] } }] };
  const { text, functionCalls } = parseGeminiResponse(data);
  assert.equal(text, "ok");
  assert.deepEqual(functionCalls, [{ name: "get_day", args: { date: "2026-06-01" } }]);
});

test("parseGeminiResponse handles text-only response", () => {
  const data = { candidates: [{ content: { role: "model", parts: [{ text: "hello" }] } }] };
  const { text, functionCalls } = parseGeminiResponse(data);
  assert.equal(text, "hello");
  assert.deepEqual(functionCalls, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/gemini-map.test.js`
Expected: FAIL — cannot find module `../worker/providers/gemini.js`.

- [ ] **Step 3: Create `worker/providers/gemini.js`**

```js
import { ProviderError } from "./errors.js";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export function toGeminiContents(messages) {
  return messages.map(m => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export function buildGeminiBody({ systemSegments, tools, contents }) {
  return {
    systemInstruction: { parts: systemSegments.map(s => ({ text: s.text })) },
    contents,
    tools: [{
      functionDeclarations: tools.map(t => ({
        name: t.name, description: t.description, parameters: t.parameters,
      })),
    }],
    // thinkingBudget 0 keeps tool calls fast and quota-frugal on Flash.
    generationConfig: { temperature: 0.7, thinkingConfig: { thinkingBudget: 0 } },
  };
}

export function parseGeminiResponse(data) {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.filter(p => typeof p.text === "string").map(p => p.text).join("").trim();
  const functionCalls = parts
    .filter(p => p.functionCall)
    .map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} }));
  return { text, functionCalls, parts };
}

export async function runGemini({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) {
  const contents = toGeminiContents(messages);
  let finalText = "";

  for (let iter = 0; iter < maxIterations; iter++) {
    let data;
    try {
      const res = await fetch(`${GEMINI_BASE}/${model}:generateContent`, {
        method: "POST",
        headers: { "x-goog-api-key": apiKey, "content-type": "application/json" },
        body: JSON.stringify(buildGeminiBody({ systemSegments, tools, contents })),
      });
      if (res.status === 429) throw new ProviderError("quota");
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        console.error("gemini error", res.status, detail);
        throw new ProviderError("upstream");
      }
      data = await res.json();
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      throw new ProviderError("unreachable");
    }

    const { text, functionCalls, parts } = parseGeminiResponse(data);
    if (text) finalText = text;
    if (functionCalls.length === 0) return { reply: finalText || "(no response)" };

    contents.push({ role: "model", parts });
    const responseParts = [];
    for (const fc of functionCalls) {
      const result = await executeToolUse(fc.name, fc.args);
      responseParts.push({ functionResponse: { name: fc.name, response: result } });
    }
    contents.push({ role: "user", parts: responseParts });
  }
  return { reply: finalText || "I stopped after several steps - could you rephrase?" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/gemini-map.test.js` (4 tests pass). Then `npm test` (whole suite green) and `npx wrangler deploy --dry-run --outdir=.wrangler-dryrun-a2t3` (bundles), then `rm -rf .wrangler-dryrun-a2t3`.

- [ ] **Step 5: Commit**

```bash
git add worker/providers/gemini.js test/gemini-map.test.js
git commit -m "feat: Gemini provider adapter with function-calling loop + tests"
```

---

## Task 4: Route by role in pickModel + dispatch in postMj

**Files:** Modify `worker/mj.js`. Create `test/pick-model.test.js`.

- [ ] **Step 1: Write the failing test `test/pick-model.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModel } from "../worker/mj.js";

const env = { ANTHROPIC_API_KEY: "ak", GEMINI_API_KEY: "gk" };

test("admin routes to Anthropic Claude", () => {
  const r = pickModel({ role: "admin" }, env);
  assert.equal(r.provider, "anthropic");
  assert.equal(r.model, "claude-haiku-4-5");
  assert.equal(r.apiKey, "ak");
});

test("non-admin routes to Gemini", () => {
  const r = pickModel({ role: "user" }, env);
  assert.equal(r.provider, "gemini");
  assert.equal(r.model, "gemini-2.5-flash");
  assert.equal(r.apiKey, "gk");
});

test("missing provider key leaves apiKey falsy", () => {
  assert.equal(pickModel({ role: "user" }, { ANTHROPIC_API_KEY: "ak" }).apiKey, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/pick-model.test.js`
Expected: FAIL — admin/non-admin both currently return anthropic (the non-admin and missing-key cases fail).

- [ ] **Step 3: Generalize `pickModel` and dispatch**

In `worker/mj.js`, add the `isAdmin` import and the `runGemini` import:
```js
import { isAdmin } from "./guard.js";
import { runGemini } from "./providers/gemini.js";
```
Replace `pickModel`:
```js
export function pickModel(user, env) {
  if (isAdmin(user)) {
    return { provider: "anthropic", model: "claude-haiku-4-5", apiKey: env.ANTHROPIC_API_KEY };
  }
  return { provider: "gemini", model: "gemini-2.5-flash", apiKey: env.GEMINI_API_KEY };
}
```
In `postMj`, replace `const run = runAnthropic;` with:
```js
  const run = provider === "gemini" ? runGemini : runAnthropic;
```

- [ ] **Step 4: Run tests + build + bundle**

Run `node --test test/pick-model.test.js` (3 pass), `npm test` (all green), `npm run build`, and `npx wrangler deploy --dry-run --outdir=.wrangler-dryrun-a2t4` then `rm -rf .wrangler-dryrun-a2t4`.

- [ ] **Step 5: Commit**

```bash
git add worker/mj.js test/pick-model.test.js
git commit -m "feat: route MJ by role (admin->Claude, others->Gemini)"
```

---

## Task 5: Per-user daily MJ cap

**Files:** Modify `worker/mj.js`. Create `test/mj-usage.test.js`.

- [ ] **Step 1: Write the failing test `test/mj-usage.test.js`**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isOverMjLimit, MJ_DAILY_LIMIT } from "../worker/mj.js";

test("MJ_DAILY_LIMIT is 30", () => {
  assert.equal(MJ_DAILY_LIMIT, 30);
});

test("isOverMjLimit is true at or above the limit", () => {
  assert.equal(isOverMjLimit(0, 30), false);
  assert.equal(isOverMjLimit(29, 30), false);
  assert.equal(isOverMjLimit(30, 30), true);
  assert.equal(isOverMjLimit(31, 30), true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/mj-usage.test.js`
Expected: FAIL — `isOverMjLimit` / `MJ_DAILY_LIMIT` not exported.

- [ ] **Step 3: Add the cap to `worker/mj.js`**

Add the constant and helpers near the other constants:
```js
export const MJ_DAILY_LIMIT = 30;

export function isOverMjLimit(count, limit) {
  return count >= limit;
}

async function bumpMjUsageOrReject(env, userId, today) {
  const row = await env.DB.prepare(
    "SELECT count FROM mj_usage WHERE user_id = ? AND date = ?",
  ).bind(userId, today).first();
  if (isOverMjLimit(row?.count ?? 0, MJ_DAILY_LIMIT)) return false;
  await env.DB.prepare(
    "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1",
  ).bind(userId, today).run();
  return true;
}
```
In `postMj`, compute `today` BEFORE the plan load, and enforce the cap for non-admins before doing the (more expensive) plan load + model call. Reorder so the relevant section reads:
```js
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });

  if (!isAdmin(user)) {
    const allowed = await bumpMjUsageOrReject(env, user.id, today);
    if (!allowed) {
      return error(429, `You have reached today's MJ limit (${MJ_DAILY_LIMIT} messages). It resets tomorrow.`);
    }
  }

  const raw = await loadRawPlan(env, user.id);
  const config = parseConfig(raw.config);
  const overrides = raw.overrides;

  const systemSegments = [
    { text: `${MJ_PERSONA}\n\n${buildPlanText(config, overrides)}`, cache: true },
    { text: `Today's date is ${today}.`, cache: false },
  ];
```
(That is the same `today`/`systemSegments` as before, just with the cap check inserted and `today` computed once before both.)

- [ ] **Step 4: Run tests + build + bundle**

Run `node --test test/mj-usage.test.js` (2 pass), `npm test` (all green), `npm run build`, and a dry-run bundle (`npx wrangler deploy --dry-run --outdir=.wrangler-dryrun-a2t5`; then `rm -rf .wrangler-dryrun-a2t5`).

- [ ] **Step 5: Commit**

```bash
git add worker/mj.js test/mj-usage.test.js
git commit -m "feat: per-user daily MJ cap (30/day for non-admins, admin exempt)"
```

---

## Task 6: Document per-user MJ in DEV.md

**Files:** Modify `DEV.md`.

- [ ] **Step 1: Update the MJ section**

In `DEV.md`'s MJ section, document: MJ routes per user now. The owner (admin) uses Claude (`claude-haiku-4-5`) on `ANTHROPIC_API_KEY`; all other users use Gemini (`gemini-2.5-flash`) on a shared `GEMINI_API_KEY` (set with `npx wrangler secret put GEMINI_API_KEY`). Non-admin users are capped at 30 MJ messages/day (the `mj_usage` table); admins are exempt. If a key for the relevant provider is unset, that user's MJ returns a friendly "not configured" message. No em dashes or en dashes (regular hyphens only).

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs: document per-user MJ model routing and daily cap"
```

---

## Task 7: Full test pass, bundle, finish

**Files:** none (verification).

- [ ] **Step 1: Run the whole suite**

Run: `npm test`
Expected: all pass — `gemini-map` (4), `pick-model` (3), `mj-usage` (2), plus the pre-existing tests.

- [ ] **Step 2: Build + worker bundle**

Run `npm run build` (succeeds) and `npx wrangler deploy --dry-run --outdir=.wrangler-dryrun-a2final` (bundles cleanly), then `rm -rf .wrangler-dryrun-a2final`.

- [ ] **Step 3: Manual smoke (owner + a non-owner), local**

With `npx wrangler dev` and a `.dev.vars` containing both `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`: as the owner (admin) confirm MJ answers and can run a tool (e.g., "what's on for today?" then "mark the first task done"). Create + approve a second local user and confirm MJ answers for them via Gemini and the same tools work. (This step is manual; the unit suite covers the pure mapping/cap logic.)

- [ ] **Step 4: Finish the branch**

Use the superpowers:finishing-a-development-branch skill. Push and open a PR to `main`. A2 has no D1 migration, so merging only auto-deploys code (safe). Note in the PR that both secrets are already set and non-owner users may be approved once A2 is deployed.

---

## Self-review notes

- **Spec coverage:** role routing (T4), Anthropic adapter preserving behavior (T2), Gemini adapter with function-calling loop + thinking disabled (T3), neutral tools (T1), `executeTool(name, input, ...)` refactor (T2), provider-agnostic `postMj` with ProviderError mapping incl. quota->429 (T2), per-user 30/day cap with admin exemption + 429 (T5), docs (T6). No frontend or schema changes, per spec.
- **Placeholders:** none; full code is given for every new module and for `postMj`/`executeTool`. The DEV.md task is prose-only by nature.
- **Type consistency:** the adapter contract `({ apiKey, model, systemSegments, tools, messages, executeToolUse, maxIterations }) -> { reply }` is identical for `runAnthropic` and `runGemini`; `pickModel` returns `{ provider, model, apiKey }` consumed in `postMj`; `executeToolUse(name, input)` matches the refactored `executeTool(name, input, ...)`; tools carry `parameters` (T1) which both adapters read.
