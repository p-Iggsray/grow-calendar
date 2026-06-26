# Recurring Event Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a grower add a recurring/timed event (e.g. "neem spray every 7 days during veg") once, via MJ, and have it appear on every matching day, stored as one editable rule.

**Architecture:** A pure `occurrencesForDate(date, config, eventRules)` engine evaluates a list of `{window × cadence}` rules and returns the task lines that fire on a date. `getDetail` injects those occurrences into a day's task list right before per-day overrides apply, so every existing consumer (frontend day view, calendar, MJ `get_day`, report, push) shows them with consistent indices. Rules persist as a JSON `event_rules` column on the `grows` table, edited through grow-scoped CRUD endpoints and two new MJ tools.

**Tech Stack:** Vanilla JS ES modules (shared between Vite/React frontend and Cloudflare Worker), Cloudflare D1 (SQLite), `node:test` + `node:assert/strict` for tests.

## Global Constraints

- No em dashes anywhere (prose, comments, strings). Use periods or rephrase.
- Comments only for non-obvious logic. Match existing file style.
- `getDetail`'s new `eventRules` parameter MUST default to `[]` so existing 3-to-5-argument callers (the test suite, any untouched site) keep working.
- Dates in config are LOCAL `Date` objects (from `parseConfig`); rule date strings are ISO `YYYY-MM-DD` parsed with `parseDate` from `src/lib/planConfig.js`. Never use `new Date("YYYY-MM-DD")` (UTC shift).
- Pure shared modules live in `src/lib/` and must not import React or DOM APIs (the Worker imports them).
- Run the full test suite with `npm test` (which runs `node --test`).
- Do NOT run `git push`, `git commit` is allowed locally per these task steps, but do NOT deploy. The repo owner runs deploys/migrations.

---

### Task 1: Pure occurrence engine

**Files:**
- Create: `src/lib/growdata/eventRules.js`
- Test: `test/event-rules.test.js`

**Interfaces:**
- Consumes: `daysBetween` from `src/lib/dates-core.js`; `getPhase` from `src/lib/growdata/phase.js`; `parseDate` from `src/lib/planConfig.js`.
- Produces: `export function occurrencesForDate(date, config, eventRules) -> string[]` where `date` is a local `Date`, `config` is a parsed (Date-valued) config, `eventRules` is an array of rule objects. Returns the `task` strings of enabled rules that fire on `date`, ordered by `createdAt`.

- [ ] **Step 1: Write the failing test**

Create `test/event-rules.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { occurrencesForDate } from "../src/lib/growdata/eventRules.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG); // start 2026-05-21, transplant 2026-05-24

function rule(extra) {
  return { id: "evt_1", label: "Neem", task: "Spray neem", enabled: true, createdAt: "2026-06-26T00:00:00.000Z", ...extra };
}

test("empty or missing rules yields no occurrences", () => {
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, []), []);
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, undefined), []);
});

test("range window + everyDay fires inside the range only", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]);
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 25), config, r), []);
});

test("range window + everyNDays fires on the cadence beat", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyNDays", n: 7, anchor: "2026-06-01" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]); // 06-01 + 14
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 16), config, r), []);
});

test("phase window matches by getPhase membership", () => {
  const r = [rule({ window: { type: "phase", phases: ["veg_full"] }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 6, 10), config, r), ["Spray neem"]); // 2026-07-10 is veg_full
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), []); // veg_cm
});

test("milestone window resolves offsets off a config date", () => {
  const r = [rule({ window: { type: "milestone", anchor: "transplant", offsetStart: -3, offsetEnd: -3 }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 4, 21), config, r), ["Spray neem"]); // 3 days before 2026-05-24
  assert.deepEqual(occurrencesForDate(new Date(2026, 4, 22), config, r), []);
});

test("dates cadence ignores window and fires on listed days", () => {
  const r = [rule({ cadence: { type: "dates", dates: ["2026-06-30", "2026-07-14"] } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 30), config, r), ["Spray neem"]);
  assert.deepEqual(occurrencesForDate(new Date(2026, 6, 1), config, r), []);
});

test("weekdays cadence fires on listed weekday within window", () => {
  const r = [rule({ window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "weekdays", days: ["mon"] } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["Spray neem"]); // 2026-06-15 is a Monday
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 16), config, r), []); // Tuesday
});

test("disabled rules never fire", () => {
  const r = [rule({ enabled: false, window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } })];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), []);
});

test("multiple rules return in createdAt order", () => {
  const r = [
    rule({ id: "b", task: "B", createdAt: "2026-06-26T02:00:00.000Z", window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } }),
    rule({ id: "a", task: "A", createdAt: "2026-06-26T01:00:00.000Z", window: { type: "range", from: "2026-06-10", to: "2026-06-20" }, cadence: { type: "everyDay" } }),
  ];
  assert.deepEqual(occurrencesForDate(new Date(2026, 5, 15), config, r), ["A", "B"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with a module-not-found / `occurrencesForDate is not a function` error for `event-rules.test.js`.

- [ ] **Step 3: Write the engine**

Create `src/lib/growdata/eventRules.js`:

```js
// Pure recurring-event engine. No React, no DOM - safe to import in the Worker.
// Evaluates {window x cadence} rules and returns the task lines firing on a date.
import { daysBetween } from "../dates-core.js";
import { getPhase } from "./phase.js";
import { parseDate } from "../planConfig.js";

const WEEKDAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function offsetDays(base, days) {
  const out = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  out.setDate(out.getDate() + (days ?? 0));
  return out;
}

function windowMatch(date, config, window) {
  if (!window || typeof window !== "object") return false;
  if (window.type === "range") {
    if (!window.from || !window.to) return false;
    return date >= parseDate(window.from) && date <= parseDate(window.to);
  }
  if (window.type === "phase") {
    const phase = getPhase(date, config);
    return Array.isArray(window.phases) && phase != null && window.phases.includes(phase);
  }
  if (window.type === "milestone") {
    const anchor = config[window.anchor];
    if (!anchor) return false;
    return date >= offsetDays(anchor, window.offsetStart) && date <= offsetDays(anchor, window.offsetEnd);
  }
  return false;
}

function cadenceMatch(date, config, cadence) {
  if (!cadence || typeof cadence !== "object") return false;
  if (cadence.type === "everyDay") return true;
  if (cadence.type === "everyNDays") {
    if (!Number.isInteger(cadence.n) || cadence.n < 1) return false;
    const anchor = cadence.anchor ? parseDate(cadence.anchor) : config.start;
    const diff = daysBetween(date, anchor);
    return diff >= 0 && diff % cadence.n === 0;
  }
  if (cadence.type === "weekdays") {
    return Array.isArray(cadence.days) && cadence.days.includes(WEEKDAY_KEYS[date.getDay()]);
  }
  if (cadence.type === "dates") {
    return Array.isArray(cadence.dates) && cadence.dates.includes(ymd(date));
  }
  return false;
}

export function occurrencesForDate(date, config, eventRules) {
  if (!Array.isArray(eventRules) || eventRules.length === 0) return [];
  const sorted = [...eventRules].sort((a, b) => String(a?.createdAt).localeCompare(String(b?.createdAt)));
  const out = [];
  for (const rule of sorted) {
    if (!rule || rule.enabled === false) continue;
    const datesCadence = rule.cadence?.type === "dates";
    if (!datesCadence && !windowMatch(date, config, rule.window)) continue;
    if (!cadenceMatch(date, config, rule.cadence)) continue;
    if (typeof rule.task === "string" && rule.task.trim()) out.push(rule.task);
  }
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for all `event-rules.test.js` cases. Full suite green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/growdata/eventRules.js test/event-rules.test.js
git commit -m "feat: pure recurring event-rule occurrence engine"
```

---

### Task 2: Inject occurrences into getDetail

**Files:**
- Modify: `src/lib/growdata/detail.js` (function `getDetail`, around lines 326-362)
- Test: `test/event-rules-getdetail.test.js`

**Interfaces:**
- Consumes: `occurrencesForDate` from Task 1.
- Produces: `getDetail(date, config, overrides, generatedPlan, phaseOverrides, eventRules = [])`. Occurrences are appended to `tasks` after phase tasks and before day overrides apply.

- [ ] **Step 1: Write the failing test**

Create `test/event-rules-getdetail.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG);
function day() { return new Date(2026, 5, 12); } // 2026-06-12, stable early-veg day
const DAY = "2026-06-12";

const rules = [{
  id: "evt_1", label: "Neem", task: "Spray neem to runoff", enabled: true,
  createdAt: "2026-06-26T00:00:00.000Z",
  window: { type: "range", from: "2026-06-01", to: "2026-06-30" },
  cadence: { type: "everyDay" },
}];

test("occurrence is appended after the generated tasks", () => {
  const base = getDetail(day(), config, {}, null, {});
  const withRule = getDetail(day(), config, {}, null, {}, rules);
  assert.equal(withRule.tasks.length, base.tasks.length + 1);
  assert.equal(withRule.tasks.at(-1), "Spray neem to runoff");
});

test("a day removedTasks override can skip a single occurrence by index", () => {
  const withRule = getDetail(day(), config, {}, null, {}, rules);
  const occIndex = withRule.tasks.length - 1;
  const skipped = getDetail(day(), config, { [DAY]: { removedTasks: [occIndex] } }, null, {}, rules);
  assert.equal(skipped.tasks.length, withRule.tasks.length - 1);
  assert.ok(!skipped.tasks.includes("Spray neem to runoff"));
});

test("omitting eventRules leaves the day unchanged (backward compatible)", () => {
  const base = getDetail(day(), config, {});
  const same = getDetail(day(), config, {}, null, {});
  assert.deepEqual(same, base);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL on the first two cases (occurrence not appended) because `getDetail` ignores rules.

- [ ] **Step 3: Add the import and inject occurrences**

In `src/lib/growdata/detail.js`, add to the imports at the top (after the existing `import { dpt, getPhase } from "./phase.js";`):

```js
import { occurrencesForDate } from "./eventRules.js";
```

Change the `getDetail` signature (line ~326) from:

```js
export function getDetail(date, config, overrides, generatedPlan, phaseOverrides) {
```

to:

```js
export function getDetail(date, config, overrides, generatedPlan, phaseOverrides, eventRules = []) {
```

Then, in the same function, locate the phase-override block:

```js
  // Phase-level override (survives AI regeneration — full task array).
  if (phaseOverrides?.[phase]) {
    base = applyPhaseOverride(base, phaseOverrides[phase]);
  }
```

Immediately AFTER that block and BEFORE the `// Day-level override` block, insert:

```js
  // Recurring event-rule occurrences are appended after phase tasks and before
  // day overrides, so per-day edits/removes and check-off indices treat them as
  // ordinary tasks.
  const occurrences = occurrencesForDate(date, config, eventRules);
  if (occurrences.length > 0) {
    base = { ...base, tasks: base.tasks.concat(occurrences) };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `event-rules-getdetail.test.js` and the existing `plan-overrides.test.js` (unchanged, since it omits the new arg).

- [ ] **Step 5: Commit**

```bash
git add src/lib/growdata/detail.js test/event-rules-getdetail.test.js
git commit -m "feat: inject recurring event occurrences into getDetail"
```

---

### Task 3: Rule validation helper

**Files:**
- Create: `worker/eventRulesValidate.js`
- Test: `test/event-rules-validate.test.js`

**Interfaces:**
- Consumes: `VALID_GROW_PHASES`, `VALID_CONFIG_DATE_KEYS` (Sets) from `worker/mj-logic.js`.
- Produces: `export function validateEventRule(rule) -> string | null` (null = valid, else an error message). `export const MAX_RULES_PER_GROW = 50;`

- [ ] **Step 1: Write the failing test**

Create `test/event-rules-validate.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEventRule } from "../worker/eventRulesValidate.js";

function valid(extra) {
  return { id: "evt_1", label: "Neem", task: "Spray neem", enabled: true, createdAt: "2026-06-26T00:00:00.000Z",
    window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" }, ...extra };
}

test("a well-formed range/everyDay rule is valid", () => {
  assert.equal(validateEventRule(valid()), null);
});

test("missing task is rejected", () => {
  assert.match(validateEventRule(valid({ task: "" })), /task/);
});

test("over-long task is rejected", () => {
  assert.match(validateEventRule(valid({ task: "x".repeat(201) })), /task/);
});

test("unknown window type is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "bogus" } })), /window/);
});

test("unknown milestone anchor is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "milestone", anchor: "nope", offsetStart: 0, offsetEnd: 1 } })), /anchor/);
});

test("invalid phase in phase window is rejected", () => {
  assert.match(validateEventRule(valid({ window: { type: "phase", phases: ["not_a_phase"] } })), /phase/);
});

test("everyNDays with non-positive n is rejected", () => {
  assert.match(validateEventRule(valid({ cadence: { type: "everyNDays", n: 0 } })), /n/);
});

test("dates cadence needs no window", () => {
  assert.equal(validateEventRule({ task: "Spray", cadence: { type: "dates", dates: ["2026-06-30"] } }), null);
});

test("bad weekday key is rejected", () => {
  assert.match(validateEventRule(valid({ cadence: { type: "weekdays", days: ["funday"] } })), /days/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with module-not-found for `worker/eventRulesValidate.js`.

- [ ] **Step 3: Write the validator**

Create `worker/eventRulesValidate.js`:

```js
import { VALID_GROW_PHASES, VALID_CONFIG_DATE_KEYS } from "./mj-logic.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WINDOW_TYPES = new Set(["range", "phase", "milestone"]);
const CADENCE_TYPES = new Set(["everyDay", "everyNDays", "weekdays", "dates"]);
const WEEKDAYS = new Set(["sun", "mon", "tue", "wed", "thu", "fri", "sat"]);
const MAX_TASK_LEN = 200;
const MAX_LABEL_LEN = 80;

export const MAX_RULES_PER_GROW = 50;

// Returns null when valid, otherwise a short error message.
export function validateEventRule(rule) {
  if (!rule || typeof rule !== "object") return "rule must be an object";
  if (typeof rule.task !== "string" || !rule.task.trim()) return "task is required";
  if (rule.task.length > MAX_TASK_LEN) return `task exceeds ${MAX_TASK_LEN} characters`;
  if (rule.label != null && (typeof rule.label !== "string" || rule.label.length > MAX_LABEL_LEN)) {
    return `label must be a string up to ${MAX_LABEL_LEN} characters`;
  }

  const cad = rule.cadence;
  if (!cad || typeof cad !== "object" || !CADENCE_TYPES.has(cad.type)) return "cadence.type is invalid";
  if (cad.type === "everyNDays") {
    if (!Number.isInteger(cad.n) || cad.n < 1) return "cadence.n must be a positive integer";
    if (cad.anchor != null && !DATE_RE.test(cad.anchor)) return "cadence.anchor must be YYYY-MM-DD";
  }
  if (cad.type === "weekdays" && (!Array.isArray(cad.days) || cad.days.length === 0 || cad.days.some(d => !WEEKDAYS.has(d)))) {
    return "cadence.days must be weekday keys (mon..sun)";
  }
  if (cad.type === "dates" && (!Array.isArray(cad.dates) || cad.dates.length === 0 || cad.dates.some(d => !DATE_RE.test(d)))) {
    return "cadence.dates must be a non-empty list of YYYY-MM-DD strings";
  }

  // window is required unless the cadence is an explicit date list.
  if (cad.type !== "dates") {
    const w = rule.window;
    if (!w || typeof w !== "object" || !WINDOW_TYPES.has(w.type)) return "window.type is invalid";
    if (w.type === "range") {
      if (!DATE_RE.test(w.from || "") || !DATE_RE.test(w.to || "")) return "window range needs from/to as YYYY-MM-DD";
    } else if (w.type === "phase") {
      if (!Array.isArray(w.phases) || w.phases.length === 0 || w.phases.some(p => !VALID_GROW_PHASES.has(p))) {
        return "window.phases must be valid phase keys";
      }
    } else if (w.type === "milestone") {
      if (!VALID_CONFIG_DATE_KEYS.has(w.anchor)) return "window.anchor must be a config date key";
      if (!Number.isInteger(w.offsetStart) || !Number.isInteger(w.offsetEnd)) return "window offsets must be integers";
    }
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS for `event-rules-validate.test.js`.

- [ ] **Step 5: Commit**

```bash
git add worker/eventRulesValidate.js test/event-rules-validate.test.js
git commit -m "feat: event-rule validation helper"
```

---

### Task 4: Persist event_rules on the grows table

**Files:**
- Create: `migrations/004_event_rules.sql`
- Modify: `schema.sql` (grows CREATE TABLE, around lines 232-246)
- Modify: `worker/grows.js` (`ensureMigrated` DDL ~lines 29-42; `loadRawGrow` return ~lines 109-119; `getGrow` ~lines 202-236)

**Interfaces:**
- Produces: `loadRawGrow(...)` and the `getGrow` JSON payload both include `eventRules` (array, default `[]`). New DB column `grows.event_rules TEXT`.

- [ ] **Step 1: Write the migration**

Create `migrations/004_event_rules.sql`:

```sql
-- Add recurring event rules (JSON array) to the grows table.
ALTER TABLE grows ADD COLUMN event_rules TEXT;
```

- [ ] **Step 2: Add the column to schema.sql and the ensureMigrated DDL**

In `schema.sql`, find the `grows` CREATE TABLE and add `event_rules` after `phase_overrides`:

```sql
  phase_overrides TEXT,            -- JSON: per-phase task overrides
  event_rules     TEXT,            -- JSON: recurring event rules ({window x cadence})
```

In `worker/grows.js`, inside `ensureMigrated`, update the CREATE TABLE to include the column (after the `phase_overrides TEXT,` line):

```js
        phase_overrides TEXT,
        event_rules     TEXT,
```

- [ ] **Step 3: Return eventRules from loadRawGrow and getGrow**

In `worker/grows.js` `loadRawGrow`, add to the returned object (after `phaseOverrides: ...`):

```js
    phaseOverrides: parseField(row.phase_overrides) ?? {},
    eventRules:     parseField(row.event_rules) ?? [],
```

In `getGrow`, after `const phaseOverrides = parseField(row.phase_overrides) ?? {};` add:

```js
  const eventRules = parseField(row.event_rules) ?? [];
```

and add `eventRules,` to the `json({ ... })` response object (next to `phaseOverrides,`).

- [ ] **Step 4: Write a test that loadRawGrow/getGrow shape includes eventRules**

Create `test/grows-event-rules-shape.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { loadRawGrow } from "../worker/grows.js";

// Minimal fake D1 returning one grow row with an event_rules JSON column.
function fakeEnv(row) {
  return {
    DB: {
      prepare() {
        return {
          bind() { return this; },
          first: async () => row,
          all: async () => ({ results: [] }),
        };
      },
    },
  };
}

test("loadRawGrow parses event_rules into an array", async () => {
  const rules = [{ id: "evt_1", task: "Spray", cadence: { type: "everyDay" }, window: { type: "phase", phases: ["veg_full"] }, createdAt: "2026-06-26T00:00:00.000Z" }];
  const env = fakeEnv({ id: "g1", config: null, survey: null, generated_plan: null, phase_overrides: null, event_rules: JSON.stringify(rules), display_name: "G", status: "active" });
  const raw = await loadRawGrow(env, 1, "g1");
  assert.deepEqual(raw.eventRules, rules);
});

test("loadRawGrow defaults event_rules to an empty array", async () => {
  const env = fakeEnv({ id: "g1", config: null, survey: null, generated_plan: null, phase_overrides: null, event_rules: null, display_name: "G", status: "active" });
  const raw = await loadRawGrow(env, 1, "g1");
  assert.deepEqual(raw.eventRules, []);
});
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS for `grows-event-rules-shape.test.js`.

- [ ] **Step 6: Commit**

```bash
git add migrations/004_event_rules.sql schema.sql worker/grows.js test/grows-event-rules-shape.test.js
git commit -m "feat: persist event_rules column on grows table"
```

> Migration note (for the repo owner, NOT run by the worker): apply to local then remote:
> `npx wrangler d1 execute grow-calendar-db --local --file=./migrations/004_event_rules.sql`
> `npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/004_event_rules.sql`

---

### Task 5: Grow-scoped CRUD endpoints

**Files:**
- Modify: `worker/grows.js` (add handlers + helpers near the phase handlers, ~line 393)
- Modify: `worker/index.js` (import + route, near the grows routes ~line 164)
- Test: `test/grows-event-crud.test.js`

**Interfaces:**
- Consumes: `validateEventRule`, `MAX_RULES_PER_GROW` from `worker/eventRulesValidate.js`; existing `json`, `error`, `safeJsonBounded`, `parseField`.
- Produces: `createGrowEvent(request, env, user, growId)`, `patchGrowEvent(request, env, user, growId, ruleId)`, `deleteGrowEvent(env, user, growId, ruleId)`. Routes: `POST /api/grows/:id/events`, `PATCH /api/grows/:id/events/:ruleId`, `DELETE /api/grows/:id/events/:ruleId`.

- [ ] **Step 1: Write the failing test**

Create `test/grows-event-crud.test.js`. This uses an in-memory fake of the single grow row that the handlers read/write:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createGrowEvent, deleteGrowEvent } from "../worker/grows.js";

// Fake D1 backed by a mutable store of one grow's event_rules JSON string.
function fakeEnv(store) {
  return {
    DB: {
      prepare(sql) {
        return {
          _sql: sql,
          bind(...args) { this._args = args; return this; },
          first: async () => (store.exists ? { event_rules: store.value } : null),
          run: async () => {
            // UPDATE grows SET event_rules = ? ...
            store.value = this._args[0];
            return { meta: { changes: 1 } };
          },
        };
      },
    },
  };
}

function req(body) {
  return new Request("http://x/api/grows/g1/events", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
}

test("createGrowEvent assigns id + createdAt and persists", async () => {
  const store = { exists: true, value: null };
  const env = fakeEnv(store);
  const res = await createGrowEvent(req({ label: "Neem", task: "Spray neem", window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" } }), env, { id: 1 }, "g1");
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.match(data.rule.id, /^evt_/);
  assert.ok(data.rule.createdAt);
  assert.equal(JSON.parse(store.value).length, 1);
});

test("createGrowEvent rejects an invalid rule with 400", async () => {
  const store = { exists: true, value: null };
  const res = await createGrowEvent(req({ task: "" }), fakeEnv(store), { id: 1 }, "g1");
  assert.equal(res.status, 400);
});

test("deleteGrowEvent removes by id", async () => {
  const store = { exists: true, value: JSON.stringify([{ id: "evt_x", task: "Spray", cadence: { type: "everyDay" }, window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, createdAt: "2026-06-26T00:00:00.000Z" }]) };
  const res = await deleteGrowEvent(fakeEnv(store), { id: 1 }, "g1", "evt_x");
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(store.value), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL with `createGrowEvent is not a function` (not yet exported).

- [ ] **Step 3: Implement the handlers**

In `worker/grows.js`, add the import near the top (after the existing imports):

```js
import { validateEventRule, MAX_RULES_PER_GROW } from "./eventRulesValidate.js";
```

Add these helpers and handlers (place them after `deleteGrowPhase`, before `patchGrowDayOverride`):

```js
function newRuleId() {
  return "evt_" + Math.random().toString(36).slice(2, 10);
}

async function readGrowRules(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT event_rules FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;
  return parseField(row.event_rules) ?? [];
}

async function writeGrowRules(env, userId, growId, rules) {
  await env.DB.prepare(
    "UPDATE grows SET event_rules = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(rules), new Date().toISOString(), growId, userId).run();
}

// POST /api/grows/:id/events
export async function createGrowEvent(request, env, user, growId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  if (rules.length >= MAX_RULES_PER_GROW) return error(400, `rule limit (${MAX_RULES_PER_GROW}) reached`);

  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const rule = {
    id: newRuleId(),
    label: typeof body?.label === "string" ? body.label.slice(0, 80) : "",
    task: typeof body?.task === "string" ? body.task : "",
    enabled: body?.enabled !== false,
    window: body?.window ?? null,
    cadence: body?.cadence ?? null,
    createdAt: new Date().toISOString(),
  };

  const invalid = validateEventRule(rule);
  if (invalid) return error(400, invalid);

  rules.push(rule);
  await writeGrowRules(env, user.id, growId, rules);
  return json({ ok: true, rule });
}

// PATCH /api/grows/:id/events/:ruleId
export async function patchGrowEvent(request, env, user, growId, ruleId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  const idx = rules.findIndex(r => r.id === ruleId);
  if (idx < 0) return error(404, "rule not found");

  let body;
  { const p = await safeJsonBounded(request, 16384); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const next = { ...rules[idx] };
  if (typeof body?.label === "string") next.label = body.label.slice(0, 80);
  if (typeof body?.task === "string") next.task = body.task;
  if (typeof body?.enabled === "boolean") next.enabled = body.enabled;
  if (body?.window !== undefined) next.window = body.window;
  if (body?.cadence !== undefined) next.cadence = body.cadence;

  const invalid = validateEventRule(next);
  if (invalid) return error(400, invalid);

  rules[idx] = next;
  await writeGrowRules(env, user.id, growId, rules);
  return json({ ok: true, rule: next });
}

// DELETE /api/grows/:id/events/:ruleId
export async function deleteGrowEvent(env, user, growId, ruleId) {
  const rules = await readGrowRules(env, user.id, growId);
  if (rules === null) return error(404, "grow not found");
  await writeGrowRules(env, user.id, growId, rules.filter(r => r.id !== ruleId));
  return json({ ok: true });
}
```

- [ ] **Step 4: Wire the routes in index.js**

In `worker/index.js`, add the new handlers to the existing grows import from `./grows.js` (the line that imports `putGrowPhase`, `deleteGrowPhase`, etc.):

```js
import { /* ...existing grows imports..., */ createGrowEvent, patchGrowEvent, deleteGrowEvent } from "./grows.js";
```

Then, near the other `/api/grows/...` regex routes (after the phase/day routes), add:

```js
  const growEventsMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/events(?:\/([A-Za-z0-9_]+))?$/);
  if (growEventsMatch) {
    const gid = growEventsMatch[1];
    const ruleId = growEventsMatch[2];
    if (method === "POST"   && !ruleId) return createGrowEvent(request, env, user, gid);
    if (method === "PATCH"  &&  ruleId) return patchGrowEvent(request, env, user, gid, ruleId);
    if (method === "DELETE" &&  ruleId) return deleteGrowEvent(env, user, gid, ruleId);
  }
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: PASS for `grows-event-crud.test.js`.

- [ ] **Step 6: Commit**

```bash
git add worker/grows.js worker/index.js test/grows-event-crud.test.js
git commit -m "feat: grow-scoped CRUD endpoints for event rules"
```

---

### Task 6: Frontend wiring (usePlan + render call sites)

**Files:**
- Modify: `src/lib/usePlan.jsx` (state + context, ~lines 24-110)
- Modify: `src/App.jsx:250`
- Modify: `src/components/Calendar.jsx:130`
- Modify: `src/components/BuddyView.jsx:76`
- Modify: `src/lib/planText.js` (`buildPlanText`, ~lines 6-9)
- Modify: `src/lib/api.js` (add wrappers)

**Interfaces:**
- Consumes: `data.eventRules` from `GET /api/grows/:id` (Task 4).
- Produces: `usePlan()` returns `eventRules`. `buildPlanText(config, overrides, generatedPlan, phaseOverrides, eventRules = [])`. `api.createGrowEvent/patchGrowEvent/deleteGrowEvent`.

- [ ] **Step 1: Add eventRules to usePlan**

In `src/lib/usePlan.jsx`:

Add state next to `phaseOverrides`:

```js
  const [eventRules, setEventRules] = useState([]);
```

In the `api.getGrow(targetId).then(...)` success block, where `setPhaseOverrides(data.phaseOverrides || {});` is, add:

```js
        setEventRules(data.eventRules || []);
```

Add `eventRules` to the context value object (next to `phaseOverrides`):

```js
      config, overrides, generatedPlan, phaseOverrides, eventRules, survey,
```

- [ ] **Step 2: Pass eventRules at the three frontend getDetail sites**

`src/App.jsx`: change the destructure from `usePlan()` to include `eventRules`, then update line 250:

```js
  const detail = selected ? getDetail(selected, config, overrides, generatedPlan, phaseOverrides, eventRules) : null;
```

`src/components/Calendar.jsx`: include `eventRules` from `usePlan()` and update line 130:

```js
              const dayDetail = getDetail(date, config, overrides, generatedPlan, phaseOverrides, eventRules);
```

`src/components/BuddyView.jsx`: include `eventRules` from `usePlan()` and update line 76:

```js
  const detail = getDetail(today, config, {}, generatedPlan, phaseOverrides, eventRules);
```

- [ ] **Step 3: Thread eventRules through buildPlanText**

In `src/lib/planText.js`, change the signature and the `getDetail` call:

```js
export function buildPlanText(config, overrides, generatedPlan, phaseOverrides, eventRules = []) {
```

```js
    const detail = getDetail(m.date, config, overrides, generatedPlan, phaseOverrides, eventRules);
```

- [ ] **Step 4: Add api.js wrappers**

In `src/lib/api.js`, next to `saveGrowPhase` / `clearGrowPhase`, add:

```js
  createGrowEvent: (id, rule) =>
    request(`/api/grows/${id}/events`, { method: "POST", body: JSON.stringify(rule) }),
  patchGrowEvent: (id, ruleId, patch) =>
    request(`/api/grows/${id}/events/${ruleId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteGrowEvent: (id, ruleId) =>
    request(`/api/grows/${id}/events/${ruleId}`, { method: "DELETE", body: "{}" }),
```

- [ ] **Step 5: Verify build and lint**

Run: `npm run build`
Expected: build succeeds (no syntax/reference errors).
Run: `npm run lint`
Expected: no new errors in the modified files.

- [ ] **Step 6: Commit**

```bash
git add src/lib/usePlan.jsx src/App.jsx src/components/Calendar.jsx src/components/BuddyView.jsx src/lib/planText.js src/lib/api.js
git commit -m "feat: thread eventRules through frontend render paths"
```

---

### Task 7: Worker render-path wiring

**Files:**
- Modify: `worker/mj/chat.js` (~lines 104, 130, 169-170)
- Modify: `worker/mj/tools.js` (`executeTool` signature ~line 32; getDetail calls at ~154, 257, 269)
- Modify: `worker/mj/undo.js:32`
- Modify: `worker/push.js:153`
- Modify: `worker/report.js:272,308`

**Interfaces:**
- Consumes: `raw.eventRules` (Task 4) in chat.js; `eventRules` param in `executeTool`.
- Produces: `executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions, growId, rawGrow, eventRules)` passes `eventRules` into every `getDetail` it calls.

- [ ] **Step 1: Thread eventRules in chat.js**

In `worker/mj/chat.js`, after `const phaseOverrides = raw.phaseOverrides;` (~line 104) add:

```js
  const eventRules = raw.eventRules ?? [];
```

Update the `buildPlanText` call (~line 130):

```js
  const planText = buildPlanText(config, overrides, raw.generatedPlan, phaseOverrides, eventRules);
```

Update the `executeTool` call (~line 170) to pass `eventRules` as the final argument:

```js
        executeTool(name, input, env, user.id, config, overrides, raw.generatedPlan, phaseOverrides, actions, activeGrowId, raw, eventRules);
```

- [ ] **Step 2: Accept and use eventRules in executeTool**

In `worker/mj/tools.js`, change the signature (~line 32):

```js
export async function executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions, growId, rawGrow, eventRules = []) {
```

Update the three `getDetail` calls (get_week ~154, get_day ~257, set_tasks_done ~269) to pass `eventRules`:

```js
        const detail = getDetail(dt, config, overrides, generatedPlan, phaseOverrides, eventRules);
```

(Apply the same sixth argument to all three.)

- [ ] **Step 3: Thread eventRules in undo.js, push.js, report.js**

`worker/mj/undo.js:32` — the raw plan is loaded there as `raw`; pass `raw.eventRules ?? []`:

```js
    const detail = getDetail(dt, config, raw.overrides, raw.generatedPlan, raw.phaseOverrides, raw.eventRules ?? []);
```

`worker/push.js:153` — same pattern with its `raw`:

```js
    const detail = getDetail(todayDt, config, raw.overrides, raw.generatedPlan, raw.phaseOverrides, raw.eventRules ?? []);
```

`worker/report.js` builds its own context object and the `getDetail` calls live inside `renderReport`. Four edits:

1. In `getGrowReport`, after `const phaseOverrides = parseField(row.phase_overrides) ?? {};` (~line 111) add:

```js
  const eventRules = parseField(row.event_rules) ?? [];
```

2. In the `renderReport({ ... })` call (~lines 140-143), add `eventRules` to the object:

```js
  const html = renderReport({
    row, config, survey, generatedPlan, phaseOverrides, overrides, eventRules,
    logRows, noteRows, checkRows, taskNoteRows, plantLogRows,
  });
```

3. In `renderReport`, add `eventRules` to the destructure (~line 154):

```js
  const { row, config, survey, generatedPlan, phaseOverrides, overrides, eventRules, logRows, noteRows, checkRows, taskNoteRows, plantLogRows } = ctx;
```

4. Update both `getDetail` calls (~lines 272 and 308) to pass `eventRules`:

```js
      const detail = getDetail(r.start, config, overrides, generatedPlan, phaseOverrides, eventRules);
```
```js
    const detail = config && date ? getDetail(date, config, overrides, generatedPlan, phaseOverrides, eventRules) : null;
```

- [ ] **Step 4: Verify**

Run: `npm test`
Expected: full suite still green (these are pass-through edits; existing MJ tests in `test/mj-*.test.js` must not regress).

Run: `npx wrangler deploy --dry-run` (build-only; does NOT deploy)
Expected: bundles successfully with no import/reference errors.

- [ ] **Step 5: Commit**

```bash
git add worker/mj/chat.js worker/mj/tools.js worker/mj/undo.js worker/push.js worker/report.js
git commit -m "feat: thread eventRules through worker render paths"
```

---

### Task 8: MJ tools (create / delete / list)

**Files:**
- Modify: `worker/mj-logic.js` (`MJ_TOOLS` array ~line 127; persona tool list ~line 88; extend `get_grow_info` description)
- Modify: `worker/mj/tools.js` (`get_grow_info` handler ~line 38; add `create_event_rule` + `delete_event_rule` handlers)
- Test: `test/mj-event-tools.test.js`

**Interfaces:**
- Consumes: `validateEventRule` from `worker/eventRulesValidate.js`; the active grow's `event_rules` column via the same read/write pattern as Task 5.
- Produces: MJ tools `create_event_rule` and `delete_event_rule`; `get_grow_info` returns `eventRules`.

- [ ] **Step 1: Add the tool schemas**

In `worker/mj-logic.js`, append two entries to the `MJ_TOOLS` array (before the closing `];`):

```js
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
```

- [ ] **Step 2: Mention the tools in the persona and extend get_grow_info description**

In `worker/mj-logic.js` `MJ_PERSONA`, under "Writing tools — always confirm before calling:", add two bullets after `update_phase_tasks`:

```
- **create_event_rule** — add a recurring/timed event (spray, foliar feed) across the cycle
- **delete_event_rule** — remove a recurring event by id
```

In the `get_grow_info` tool description string, append: ` Also returns the active grow's recurring event rules (eventRules) with their ids.`

- [ ] **Step 3: Write the failing test**

Create `test/mj-event-tools.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../worker/mj/tools.js";

// Fake D1 storing one grow's event_rules as a JSON string in `store`.
function fakeEnv(store) {
  return {
    DB: {
      prepare(sql) {
        return {
          _sql: sql, _args: [],
          bind(...a) { this._args = a; return this; },
          first: async () => (/event_rules/.test(sql) || /SELECT \* FROM grows/.test(sql)) ? { event_rules: store.value } : null,
          run: async () => { if (/UPDATE grows SET event_rules/.test(this._sql)) store.value = this._args[0]; return { meta: { changes: 1 } }; },
          all: async () => ({ results: [] }),
        };
      },
    },
  };
}

const baseArgs = (env) => ["create_event_rule",
  { label: "Neem", task: "Spray neem", window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, cadence: { type: "everyDay" } },
  env, 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []];

test("create_event_rule validates and stores a rule", async () => {
  const store = { value: null };
  const res = await executeTool(...baseArgs(fakeEnv(store)));
  assert.ok(res.rule);
  assert.match(res.rule.id, /^evt_/);
  assert.equal(JSON.parse(store.value).length, 1);
});

test("create_event_rule rejects an invalid rule", async () => {
  const store = { value: null };
  const res = await executeTool("create_event_rule", { task: "" }, fakeEnv(store), 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []);
  assert.ok(res.error);
});

test("delete_event_rule removes by id", async () => {
  const store = { value: JSON.stringify([{ id: "evt_x", task: "Spray", cadence: { type: "everyDay" }, window: { type: "range", from: "2026-06-01", to: "2026-06-30" }, createdAt: "2026-06-26T00:00:00.000Z" }]) };
  const res = await executeTool("delete_event_rule", { id: "evt_x" }, fakeEnv(store), 1, {}, {}, null, {}, [], "g1", { id: "g1" }, []);
  assert.equal(res.ok, true);
  assert.deepEqual(JSON.parse(store.value), []);
});
```

Note: the argument order in the test matches the `executeTool(name, input, env, userId, config, overrides, generatedPlan, phaseOverrides, actions, growId, rawGrow, eventRules)` signature from Task 7. Adjust the positional args if your local signature differs.

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test`
Expected: FAIL because `create_event_rule` / `delete_event_rule` are not handled in `executeTool` (they fall through to the unknown-tool path).

- [ ] **Step 5: Implement the handlers**

In `worker/mj/tools.js`, add the import near the top:

```js
import { validateEventRule, MAX_RULES_PER_GROW } from "../eventRulesValidate.js";
```

Add helpers near the top of the file (after `dateToYmd`):

```js
function newRuleId() {
  return "evt_" + Math.random().toString(36).slice(2, 10);
}

async function readActiveRules(env, userId, growId) {
  const row = await env.DB.prepare(
    "SELECT event_rules FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
  if (!row) return null;
  try { return row.event_rules ? JSON.parse(row.event_rules) : []; } catch { return []; }
}

async function writeActiveRules(env, userId, growId, rules) {
  await env.DB.prepare(
    "UPDATE grows SET event_rules = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(rules), new Date().toISOString(), growId, userId).run();
}
```

Inside `executeTool`, add two handler blocks (place them alongside the other grow-editing tools, e.g. after `update_phase_tasks`):

```js
    if (name === "create_event_rule") {
      if (!growId) return { error: "No active grow selected. Tap a grow in the Plan tab first." };
      const rules = await readActiveRules(env, userId, growId);
      if (rules === null) return { error: "Grow not found." };
      if (rules.length >= MAX_RULES_PER_GROW) return { error: `Rule limit (${MAX_RULES_PER_GROW}) reached.` };

      const rule = {
        id: newRuleId(),
        label: typeof input?.label === "string" ? input.label.slice(0, 80) : "",
        task: typeof input?.task === "string" ? input.task : "",
        enabled: true,
        window: input?.window ?? null,
        cadence: input?.cadence ?? null,
        createdAt: new Date().toISOString(),
      };
      const invalid = validateEventRule(rule);
      if (invalid) return { error: invalid };

      rules.push(rule);
      await writeActiveRules(env, userId, growId, rules);
      actions.push({ type: "create_event_rule", summary: `Added recurring event: ${rule.label || rule.task}` });
      return { ok: true, rule };
    }

    if (name === "delete_event_rule") {
      if (!growId) return { error: "No active grow selected." };
      const rules = await readActiveRules(env, userId, growId);
      if (rules === null) return { error: "Grow not found." };
      const target = rules.find(r => r.id === input?.id);
      if (!target) return { error: `No event rule with id ${input?.id}.` };
      await writeActiveRules(env, userId, growId, rules.filter(r => r.id !== input.id));
      actions.push({ type: "delete_event_rule", summary: `Removed recurring event: ${target.label || target.task}` });
      return { ok: true };
    }
```

- [ ] **Step 6: Surface rules in get_grow_info**

In `worker/mj/tools.js` `get_grow_info` handler, add `eventRules` to the returned object using the rawGrow already passed in:

```js
        phasesWithOverrides,
        eventRules: (rawGrow.eventRules ?? []).map(r => ({ id: r.id, label: r.label, task: r.task, enabled: r.enabled !== false, window: r.window, cadence: r.cadence })),
        growId,
```

- [ ] **Step 7: Run tests**

Run: `npm test`
Expected: PASS for `mj-event-tools.test.js`; existing `mj-*` tests still green.

- [ ] **Step 8: Commit**

```bash
git add worker/mj-logic.js worker/mj/tools.js test/mj-event-tools.test.js
git commit -m "feat: MJ tools to create, delete, and list recurring event rules"
```

---

## Final verification

- [ ] Run the full suite: `npm test` (all green)
- [ ] Build the frontend: `npm run build` (succeeds)
- [ ] Lint: `npm run lint` (no new errors)
- [ ] Worker bundles: `npx wrangler deploy --dry-run` (succeeds, no deploy)
- [ ] Hand the migration command to the repo owner (do NOT run remote):
      `npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/004_event_rules.sql`

## Manual smoke test (after the owner applies the local migration)

1. `npx wrangler d1 execute grow-calendar-db --local --file=./migrations/004_event_rules.sql`
2. Run the local stack (`npm run dev` + `npx wrangler dev`), sign in as the local `test` user.
3. Open MJ, say: "Add a neem spray every 7 days during veg." Confirm when MJ asks.
4. Open several veg days a week apart in the calendar; verify the spray task appears on the beat days and not between.
5. Tell MJ "skip the spray on <one of those dates>"; verify that single day drops the task while the others keep it.
6. Tell MJ "remove the neem spray rule"; verify the task disappears from all days.

---

## Self-review notes

- Spec coverage: data model (Task 1 shape + Task 3 validation), engine (Task 1), injection (Task 2), persistence/column/migration (Task 4), CRUD API (Task 5), frontend wiring (Task 6), worker render wiring (Task 7), MJ tools + listing (Task 8). All four timing patterns are exercised by Task 1 tests. Out-of-scope items (calendar markers, editor screen, update_event_rule, per-occurrence editing beyond skip) are intentionally omitted.
- Type consistency: rule shape `{id,label,task,enabled,window,cadence,createdAt}` is identical across engine, validator, endpoints, and MJ tools. `getDetail` sixth param `eventRules` and `buildPlanText` fifth param `eventRules` both default to `[]`. `executeTool` final param `eventRules` matches between chat.js call and the signature.
- Backward compatibility: every signature change appends an optional, default-valued parameter, so untouched callers and the existing test suite keep passing.
