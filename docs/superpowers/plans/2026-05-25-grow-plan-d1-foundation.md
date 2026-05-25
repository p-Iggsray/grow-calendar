# Grow Plan D1 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the grow plan D1-backed and editable-ready (driving dates in a config row, per-day overrides in a table, generator reads them) without changing any user-visible behavior.

**Architecture:** Approach B from the spec. The plan generator stays one module but becomes a pure function of a `config` object instead of a hardcoded `D` constant. D1 stores the config (driving dates) and a per-day override table. The frontend fetches `{config, overrides}` once and runs the same generator locally, so rendering is unchanged. A golden-snapshot test proves the refactored generator produces byte-identical output to today's hardcoded version.

**Tech Stack:** Cloudflare Workers + D1, Vite + React 18, Wrangler 4. Tests use Node's built-in `node:test` + `node:assert` (no new dependencies).

---

## Scope refinements vs the approved spec

Three items the spec placed in the foundation are deferred to the MJ sub-project, because they are only meaningful once the plan can change (the write path, already deferred to MJ):

1. **Dosing extraction into config.** Foundation config holds dates only. Dosing stays as inline literals in the generator text. `plan_config.config` is a JSON blob, so adding dosing keys later needs no migration.
2. **`buildPlanText` / D1-driven AI context.** `worker/chat.js` is untouched; the static `worker/growContext.js` stays accurate because the seeded plan equals the hardcoded plan. The worker does not import the generator in this sub-project.
3. **Splitting React out of `dates.js`.** Only needed when the worker imports the generator (MJ phase). Foundation keeps `dates.js` as-is.

Overrides (table, read path, generator application, tests) stay in the foundation to complete the data model and the `GET /api/plan` contract; they are always empty until MJ adds writes, so they do not affect rendering.

## File structure

- Create `src/lib/planConfig.js` - `DEFAULT_CONFIG` (driving dates as ISO strings) + `parseConfig` (ISO -> local `Date`). Pure, no React. Imported by frontend now and worker later.
- Modify `src/lib/growData.js` - generator becomes config-driven; `MILESTONES` const becomes `buildMilestones(config)`; add `getDetail` override wrapper + `applyDayOverride`. `PHASES`, `THREATS`, `getThreatsForPhase` stay static.
- Create `src/lib/usePlan.jsx` - `PlanProvider` + `usePlan` hook; fetches `/api/plan`, parses config, provides `{config, overrides, loading, error}`.
- Modify `src/main.jsx` - wrap `<App/>` in `<PlanProvider>`.
- Modify `src/App.jsx`, `src/components/Calendar.jsx`, `src/components/MilestoneStrip.jsx` - consume config/milestones. `PhaseLegend.jsx` and `ThreatsReference.jsx` are unchanged (they import only the still-exported static `PHASES`/`THREATS`).
- Modify `src/lib/api.js` - add `getPlan`.
- Create `worker/plan.js` - `getPlan(request, env)` read endpoint.
- Modify `worker/index.js` - route `GET /api/plan`.
- Modify `schema.sql` - `plan_config` + `plan_day_overrides` tables.
- Create `scripts/gen-seed.mjs` - emits `seed/seed-plan-config.sql` from `DEFAULT_CONFIG`.
- Create `test/generate-golden.mjs` (one-shot), `test/golden-plan.json` (fixture), `test/plan-parity.test.js`, `test/plan-overrides.test.js`, `test/plan-config.test.js`.
- Modify `package.json` - add `"test": "node --test"` script (built-in runner, no dependency).

---

### Task 1: Capture golden snapshot from the current generator

Run this BEFORE any refactor so we have a fixture of today's exact output.

**Files:**
- Create: `test/generate-golden.mjs`
- Create (generated): `test/golden-plan.json`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Add the test script**

In `package.json`, add to `"scripts"`:

```json
    "test": "node --test"
```

- [ ] **Step 2: Write the one-shot golden generator**

Create `test/generate-golden.mjs`:

```js
// One-shot: captures the CURRENT generator output as the golden fixture.
// Run once before refactoring growData.js. Not rerun afterward (the generator
// signature changes); kept for provenance.
import { writeFileSync } from "node:fs";
import { D, getPhase, getDetail } from "../src/lib/growData.js";

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const out = [];
const cur = new Date(D.start);
while (cur <= D.hazeHarvest) {
  out.push({ date: ymd(cur), phase: getPhase(cur), detail: getDetail(cur) });
  cur.setDate(cur.getDate() + 1);
}

writeFileSync(
  new URL("./golden-plan.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`wrote ${out.length} days to test/golden-plan.json`);
```

- [ ] **Step 3: Run it and verify the day count**

Run: `node test/generate-golden.mjs`
Expected: `wrote 151 days to test/golden-plan.json` (May 21 through Oct 18, 2026 inclusive).

- [ ] **Step 4: Sanity-check the fixture**

Run: `node -e "const g=require('./test/golden-plan.json'); console.log(g[0].date, g[0].phase, '|', g.at(-1).date, g.at(-1).phase)"`
Expected: `2026-05-21 pre | 2026-10-18 harvest_haze`

- [ ] **Step 5: Commit**

```bash
git add package.json test/generate-golden.mjs test/golden-plan.json
git commit -m "test: capture golden snapshot of current grow-plan generator"
```

---

### Task 2: Default config + parser

**Files:**
- Create: `src/lib/planConfig.js`
- Test: `test/plan-config.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/plan-config.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

test("parseConfig produces local Date objects matching the legacy D values", () => {
  const cfg = parseConfig(DEFAULT_CONFIG);
  assert.deepEqual(cfg.start, new Date(2026, 4, 21));
  assert.deepEqual(cfg.transplant, new Date(2026, 4, 24));
  assert.deepEqual(cfg.feedStart, new Date(2026, 5, 21));
  assert.deepEqual(cfg.backyardMove, new Date(2026, 6, 28));
  assert.deepEqual(cfg.hazeHarvest, new Date(2026, 9, 18));
});

test("DEFAULT_CONFIG keys are ISO date strings", () => {
  for (const v of Object.values(DEFAULT_CONFIG)) {
    assert.match(v, /^\d{4}-\d{2}-\d{2}$/);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/plan-config.test.js`
Expected: FAIL, cannot find module `../src/lib/planConfig.js`.

- [ ] **Step 3: Implement planConfig.js**

Create `src/lib/planConfig.js`:

```js
// Driving dates for the grow plan. Stored in D1 as JSON; this is the seed/default.
// Dates are ISO YYYY-MM-DD strings and MUST be parsed as LOCAL dates (parseDate),
// not via new Date("...") which would parse as UTC and shift the day.
export const DEFAULT_CONFIG = {
  start:        "2026-05-21",
  transplant:   "2026-05-24",
  calMag:       "2026-06-07",
  feedStart:    "2026-06-21",
  fullDose:     "2026-07-05",
  flush1:       "2026-06-24",
  flush2:       "2026-07-24",
  flush3:       "2026-08-24",
  backyardMove: "2026-07-28",
  preFlower:    "2026-08-01",
  flowerStart:  "2026-08-15",
  gdpFlush:     "2026-09-20",
  gdpHarvest:   "2026-09-27",
  hazeFlush:    "2026-10-04",
  hazeHarvest:  "2026-10-18",
};

function parseDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Convert an ISO-string config (from D1 or DEFAULT_CONFIG) into the Date-keyed
// object the generator consumes (same shape as the legacy `D` constant).
export function parseConfig(raw) {
  const out = {};
  for (const [key, iso] of Object.entries(raw)) out[key] = parseDate(iso);
  return out;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/plan-config.test.js`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/planConfig.js test/plan-config.test.js
git commit -m "feat: add grow-plan default config and ISO->local parser"
```

---

### Task 3: Make the generator config-driven

Mechanical refactor of `src/lib/growData.js`. The generator stops closing over the module-level `D` constant and takes `config` (a Date-keyed object, same shape as `D`) as a parameter.

**Files:**
- Modify: `src/lib/growData.js`

- [ ] **Step 1: Remove the `D` constant and `MILESTONES` constant**

Delete the `export const D = { ... };` block (lines ~3-19) and the `export const MILESTONES = [ ... ];` block (lines ~81-90). They are replaced by config (Task 2) and `buildMilestones` (Step 4). Leave `PHASES` and `THREATS` exactly as they are.

- [ ] **Step 2: Convert `dpt` and `getPhase` to take config**

Replace the current `dpt`/`getPhase` definitions with:

```js
export const dpt = (date, config) => daysBetween(date, config.transplant);

export function getPhase(date, config) {
  if (date < config.start || date > config.hazeHarvest) return null;
  if (date < config.transplant) return "pre";
  const d = dpt(date, config);
  if (d === 0) return "transplant";
  if (sameDay(date, config.gdpHarvest))  return "harvest_gdp";
  if (sameDay(date, config.hazeHarvest)) return "harvest_haze";
  if (sameDay(date, config.flush1) || sameDay(date, config.flush2) || sameDay(date, config.flush3)) return "flush";
  if (date >= config.hazeFlush)   return "flush_haze";
  if (date >  config.gdpHarvest)  return "flower_haze";
  if (date >= config.gdpFlush)    return "flush_gdp";
  if (date >= config.flowerStart) return "flower";
  if (date >= config.preFlower)   return "pre_flower";
  if (d >= 42) return "veg_full";
  if (d >= 28) return "veg_half";
  if (d >= 14) return "veg_cm";
  return "early_veg";
}
```

- [ ] **Step 3: Convert `getNextMilestone` and `getGrowProgress` to take config**

```js
export function getNextMilestone(today, config) {
  const milestones = buildMilestones(config);
  return milestones.find(m => daysBetween(m.date, today) > 0) || milestones[milestones.length - 1];
}

export function getGrowProgress(today, config) {
  const total = daysBetween(config.hazeHarvest, config.start);
  const done  = Math.max(0, Math.min(total, daysBetween(today, config.start)));
  return Math.round((done / total) * 100);
}
```

- [ ] **Step 4: Add `buildMilestones(config)`**

```js
export function buildMilestones(config) {
  return [
    { label:"Transplant",       date:config.transplant,   icon:"🌱", color:"#7c3aed" },
    { label:"Cal-Mag Starts",   date:config.calMag,       icon:"💊", color:"#16a34a" },
    { label:"Feeding Starts",   date:config.feedStart,    icon:"🧪", color:"#15803d" },
    { label:"Move to Backyard", date:config.backyardMove, icon:"🏡", color:"#22c55e" },
    { label:"Pre-Flower",       date:config.preFlower,    icon:"🌸", color:"#f59e0b" },
    { label:"Flower",           date:config.flowerStart,  icon:"🌺", color:"#f97316" },
    { label:"GDP Harvest",      date:config.gdpHarvest,   icon:"✂️", color:"#d97706" },
    { label:"Haze Harvest",     date:config.hazeHarvest,  icon:"🏆", color:"#b45309" },
  ];
}
```

- [ ] **Step 5: Rename the big `getDetail` body to `generateDetail(date, config)` and transform it**

Rename `export function getDetail(date) {` to `function generateDetail(date, config) {` (note: no `export`). Then apply this exact mechanical transform to its entire body:

- Every `D.` becomes `config.` (e.g. `D.feedStart` -> `config.feedStart`, `D.start` -> `config.start`).
- The local `const d = dpt(date);` lines become `const d = dpt(date, config);`.
- The local `const phase = getPhase(date);` line becomes `const phase = getPhase(date, config);`.
- Leave everything else (task strings, `fmt(...)`/`fmtL(...)` calls, conditionals, day-number math) byte-for-byte unchanged.

Do not hand-edit task copy. The parity test in Task 4 is the gate that proves this transform is exact.

- [ ] **Step 6: Add the `getDetail` wrapper and `applyDayOverride`**

Add these near the bottom of the file:

```js
function ymdLocal(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// Apply a per-day override onto generated detail. Order: edit in place, drop by
// original index, then append. Indices refer to the generated task list.
function applyDayOverride(detail, override) {
  if (!detail || !override) return detail;
  let tasks = detail.tasks.slice();
  if (override.editedTasks) {
    for (const [i, text] of Object.entries(override.editedTasks)) {
      const idx = Number(i);
      if (idx >= 0 && idx < tasks.length) tasks[idx] = text;
    }
  }
  if (Array.isArray(override.removedTasks)) {
    const drop = new Set(override.removedTasks);
    tasks = tasks.filter((_, idx) => !drop.has(idx));
  }
  if (Array.isArray(override.addedTasks)) {
    tasks = tasks.concat(override.addedTasks);
  }
  return {
    ...detail,
    tasks,
    // payload key is `note`; it overrides the rendered `notes` field (what DayView shows).
    notes: override.note != null ? override.note : detail.notes,
    // `warning` has no base equivalent; only attach when provided (UI for it lands with MJ).
    ...(override.warning != null ? { warning: override.warning } : {}),
  };
}

export function getDetail(date, config, overrides) {
  const base = generateDetail(date, config);
  if (!base) return null;
  const override = overrides ? overrides[ymdLocal(date)] : undefined;
  return applyDayOverride(base, override);
}
```

Note: `applyDayOverride` returns `base` unchanged when `override` is falsy, so empty-override output is identical to the generated base (verified by Task 4).

- [ ] **Step 7: Verify no remaining references to `D` or `MILESTONES`**

Run: `grep -nE "\bD\.|MILESTONES" src/lib/growData.js`
Expected: no output (empty). If anything prints, finish the transform.

- [ ] **Step 8: Commit**

```bash
git add src/lib/growData.js
git commit -m "refactor: make grow-plan generator config-driven with override support"
```

---

### Task 4: Parity test (the gate)

Proves the refactored generator with `DEFAULT_CONFIG` and empty overrides equals the golden snapshot.

**Files:**
- Test: `test/plan-parity.test.js`

- [ ] **Step 1: Write the parity test**

Create `test/plan-parity.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPhase, getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const golden = JSON.parse(
  readFileSync(new URL("./golden-plan.json", import.meta.url), "utf8"),
);

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

test("refactored generator with default config matches the golden snapshot", () => {
  const config = parseConfig(DEFAULT_CONFIG);
  const regenerated = golden.map(({ date }) => {
    const [y, m, d] = date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return { date, phase: getPhase(dt, config), detail: getDetail(dt, config, {}) };
  });

  // Compare day-by-day for a precise failure location.
  for (let i = 0; i < golden.length; i++) {
    // Empty overrides make getDetail return the generated base unchanged (early
    // return in applyDayOverride), so no extra keys are introduced on either side.
    assert.deepEqual(
      regenerated[i],
      JSON.parse(JSON.stringify(golden[i])),
      `mismatch on ${golden[i].date}`,
    );
  }
  assert.equal(regenerated.length, golden.length);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/plan-parity.test.js`
Expected: PASS. If it fails, the message names the first mismatching date; fix the Task 3 transform on that day and rerun. Do not edit the golden fixture.

- [ ] **Step 3: Commit**

```bash
git add test/plan-parity.test.js
git commit -m "test: parity between config-driven generator and golden snapshot"
```

---

### Task 5: Override application test

**Files:**
- Test: `test/plan-overrides.test.js`

- [ ] **Step 1: Write the test**

Create `test/plan-overrides.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { getDetail } from "../src/lib/growData.js";
import { DEFAULT_CONFIG, parseConfig } from "../src/lib/planConfig.js";

const config = parseConfig(DEFAULT_CONFIG);
const DAY = "2026-06-12"; // an early_veg day with a stable task list
function dayDate() { return new Date(2026, 5, 12); }

test("addedTasks are appended", () => {
  const base = getDetail(dayDate(), config, {});
  const withAdd = getDetail(dayDate(), config, { [DAY]: { addedTasks: ["Spray neem tonight"] } });
  assert.equal(withAdd.tasks.length, base.tasks.length + 1);
  assert.equal(withAdd.tasks.at(-1), "Spray neem tonight");
});

test("editedTasks replace by index", () => {
  const withEdit = getDetail(dayDate(), config, { [DAY]: { editedTasks: { 0: "REPLACED" } } });
  assert.equal(withEdit.tasks[0], "REPLACED");
});

test("removedTasks drop by original index", () => {
  const base = getDetail(dayDate(), config, {});
  const withRemove = getDetail(dayDate(), config, { [DAY]: { removedTasks: [0] } });
  assert.equal(withRemove.tasks.length, base.tasks.length - 1);
  assert.equal(withRemove.tasks[0], base.tasks[1]);
});

test("note overrides the rendered notes field; warning attaches", () => {
  const d = getDetail(dayDate(), config, { [DAY]: { note: "custom note", warning: "watch heat" } });
  assert.equal(d.notes, "custom note");
  assert.equal(d.warning, "watch heat");
});

test("empty overrides leave the day unchanged", () => {
  const base = getDetail(dayDate(), config, {});
  const same = getDetail(dayDate(), config, {});
  assert.deepEqual(same, base);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/plan-overrides.test.js`
Expected: PASS, 5 tests. If the `DAY` task list is shorter than expected, pick another in-range date and adjust `DAY`/`dayDate()` consistently.

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: all test files PASS.

- [ ] **Step 4: Commit**

```bash
git add test/plan-overrides.test.js
git commit -m "test: per-day override application"
```

---

### Task 6: D1 schema and seed

**Files:**
- Modify: `schema.sql`
- Create: `scripts/gen-seed.mjs`
- Create (generated): `seed/seed-plan-config.sql`

- [ ] **Step 1: Add the tables to schema.sql**

Append to `schema.sql`:

```sql

CREATE TABLE IF NOT EXISTS plan_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),  -- single global row
  config      TEXT NOT NULL,                        -- JSON: driving dates
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_day_overrides (
  date        TEXT PRIMARY KEY,   -- YYYY-MM-DD
  payload     TEXT NOT NULL,      -- JSON: addedTasks/editedTasks/removedTasks/note/warning
  updated_at  TEXT NOT NULL
);
```

- [ ] **Step 2: Write the seed generator**

Create `scripts/gen-seed.mjs`:

```js
// Generates seed/seed-plan-config.sql from DEFAULT_CONFIG so the seed never
// drifts from the source of truth. INSERT OR IGNORE keeps it idempotent.
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

const json = JSON.stringify(DEFAULT_CONFIG);          // ISO dates only, no quotes to escape
const now = new Date().toISOString();
const sql =
  `INSERT OR IGNORE INTO plan_config (id, config, updated_at)\n` +
  `VALUES (1, '${json}', '${now}');\n`;

mkdirSync(new URL("../seed/", import.meta.url), { recursive: true });
writeFileSync(new URL("../seed/seed-plan-config.sql", import.meta.url), sql);
console.log("wrote seed/seed-plan-config.sql");
```

- [ ] **Step 3: Generate the seed file**

Run: `node scripts/gen-seed.mjs`
Expected: `wrote seed/seed-plan-config.sql`. Open it and confirm one `INSERT OR IGNORE` with a JSON blob of ISO dates.

- [ ] **Step 4: Apply schema and seed to LOCAL D1**

Run:
```bash
npx wrangler d1 execute grow-calendar-db --local --file=./schema.sql
npx wrangler d1 execute grow-calendar-db --local --file=./seed/seed-plan-config.sql
```
Expected: both report success. Re-running is safe (`IF NOT EXISTS` / `INSERT OR IGNORE`).

- [ ] **Step 5: Verify the local row**

Run: `npx wrangler d1 execute grow-calendar-db --local --command="SELECT id, config FROM plan_config;"`
Expected: one row, `id` = 1, `config` = the ISO-date JSON.

- [ ] **Step 6: Commit**

```bash
git add schema.sql scripts/gen-seed.mjs seed/seed-plan-config.sql
git commit -m "feat: add plan_config and plan_day_overrides D1 schema + seed"
```

---

### Task 7: Worker read endpoint

**Files:**
- Create: `worker/plan.js`
- Modify: `worker/index.js`
- Modify: `src/lib/api.js`

- [ ] **Step 1: Write the worker handler**

Create `worker/plan.js`:

```js
import { json, error } from "./util.js";
import { currentUser } from "./auth.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

// GET /api/plan -> { config, overrides }
// config: ISO-date object (DEFAULT_CONFIG if the row is missing/unparseable).
// overrides: map of "YYYY-MM-DD" -> payload object.
export async function getPlan(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

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

  return json({ config, overrides });
}
```

- [ ] **Step 2: Register the route**

In `worker/index.js`, add the import alongside the others:

```js
import { getPlan } from "./plan.js";
```

And add this route line just after the `/api/chat` route inside `route()`:

```js
  if (path === "/api/plan" && method === "GET") return getPlan(request, env);
```

- [ ] **Step 3: Add the frontend API wrapper**

In `src/lib/api.js`, add to the `api` object (e.g. after `chat`):

```js
  getPlan: () => request("/api/plan"),
```

- [ ] **Step 4: Verify against the local worker**

Start the worker (separate terminal): `npx wrangler dev`
Then, logged-in cookie required, so test the unauth path first:

Run: `curl.exe -s http://localhost:8787/api/plan`
Expected: `{"error":"not authenticated"}` with 401.

Then sign in locally (per DEV.md the local `test`/`testpass123` account exists) and confirm the authed shape in the browser devtools Network tab on `/api/plan`: a JSON body with `config` (ISO dates) and `overrides` (`{}`). Stop `wrangler dev` when done.

- [ ] **Step 5: Commit**

```bash
git add worker/plan.js worker/index.js src/lib/api.js
git commit -m "feat: GET /api/plan read endpoint serving config + overrides"
```

---

### Task 8: Frontend fetches and threads config

**Files:**
- Create: `src/lib/usePlan.jsx`
- Modify: `src/main.jsx`
- Modify: `src/App.jsx`
- Modify: `src/components/Calendar.jsx`
- Modify: `src/components/MilestoneStrip.jsx`

- [ ] **Step 1: Write the plan provider/hook**

Create `src/lib/usePlan.jsx`:

```jsx
import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api.js";
import { parseConfig } from "./planConfig.js";

const PlanContext = createContext(null);

export function PlanProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.getPlan()
      .then(data => {
        if (cancelled) return;
        setConfig(parseConfig(data.config));
        setOverrides(data.overrides || {});
        setLoading(false);
      })
      .catch(err => {
        if (cancelled) return;
        setError(err);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  return (
    <PlanContext.Provider value={{ config, overrides, loading, error }}>
      {children}
    </PlanContext.Provider>
  );
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
```

- [ ] **Step 2: Mount the provider (only when authenticated)**

In `src/main.jsx`, import the provider:

```jsx
import { PlanProvider } from "./lib/usePlan.jsx";
```

Change the authenticated return in `Root` from `return <App />;` to:

```jsx
  return (
    <PlanProvider>
      <App />
    </PlanProvider>
  );
```

- [ ] **Step 3: Consume config in App.jsx**

In `src/App.jsx`:

Change the `growData.js` import to add `buildMilestones` and drop nothing else:

```jsx
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  getGrowProgress,
  buildMilestones,
} from "./lib/growData.js";
```

Add the plan hook import:

```jsx
import { usePlan } from "./lib/usePlan.jsx";
```

Inside `App()`, just after `const today = useToday();`, add:

```jsx
  const { config, loading: planLoading, error: planError, overrides } = usePlan();
```

Immediately after the hooks (before computing `todayPhase`), short-circuit on load/error using the existing Splash-style shell. Add:

```jsx
  if (planError) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen" style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "#c98a8a" }}>
          Could not load the grow plan. {planError.message}
        </div>
      </div>
    );
  }
  if (planLoading || !config) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen" style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "#3a5a3a", letterSpacing: 4 }}>
          LOADING PLAN
        </div>
      </div>
    );
  }
```

Update the derived values to pass `config`/`overrides`:

```jsx
  const todayPhase = getPhase(today, config);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone(today, config);
  const daysToNext = nextMs ? daysBetween(nextMs.date, today) : 0;
  const progress   = getGrowProgress(today, config);
  const milestones = buildMilestones(config);

  const selPhase = selected ? getPhase(selected, config) : null;
  const selStyle = selPhase ? PHASES[selPhase]    : null;
  const detail   = selected ? getDetail(selected, config, overrides) : null;
  const threats  = selPhase ? getThreatsForPhase(selPhase) : [];
```

Pass the new props to the children. Change `<MilestoneStrip today={today} onPick={pickMilestone} />` to:

```jsx
      <MilestoneStrip today={today} milestones={milestones} onPick={pickMilestone} />
```

And add `config={config}` to `<Calendar ... />`:

```jsx
        <Calendar
          today={today}
          month={month}
          setMonth={setMonth}
          selected={selected}
          config={config}
          onPickDay={pickDay}
          onClearSelection={() => setSelected(null)}
        />
```

- [ ] **Step 4: Consume config in Calendar.jsx**

In `src/components/Calendar.jsx`, add `config` to the destructured props in the component signature, and change the `getPhase(date)` call (line ~51) to `getPhase(date, config)`. Ensure `getPhase` is imported from `../lib/growData.js` (it already calls it today).

- [ ] **Step 5: Consume milestones prop in MilestoneStrip.jsx**

In `src/components/MilestoneStrip.jsx`, remove the `import { MILESTONES } from "../lib/growData.js";` line, change the signature to `export default function MilestoneStrip({ today, milestones, onPick }) {`, and change `{MILESTONES.map(m => {` to `{milestones.map(m => {`. The `sameDay, daysBetween, fmt` import from `../lib/dates.js` stays.

- [ ] **Step 6: Build to verify no broken imports**

Run: `npm run build`
Expected: Vite build succeeds with no unresolved import or undefined-reference errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/usePlan.jsx src/main.jsx src/App.jsx src/components/Calendar.jsx src/components/MilestoneStrip.jsx
git commit -m "feat: frontend fetches plan config from D1 and threads it through the generator"
```

---

### Task 9: Full local verification

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite**

Run: `npm test`
Expected: all PASS (config, parity, overrides).

- [ ] **Step 2: Run the full local stack**

Per DEV.md: terminal 1 `npm run dev`, terminal 2 `npx wrangler dev`. Confirm local D1 has the schema + seed from Task 6. Open http://localhost:5173 and sign in with the local `test` account.

- [ ] **Step 3: Behavior parity walkthrough**

Confirm, against memory of current behavior:
- Calendar day colors match across all months (May-Oct).
- Milestone strip shows all 8 milestones with correct dates/icons.
- Opening several days (e.g. May 24 transplant, Jun 12, Jul 28 backyard-move window, Sep 27 GDP harvest, Oct 18 haze harvest) shows the same title/summary/tasks/notes as before.
- Phase legend and threats reference render unchanged.
- The AI "Ask" chat still works (chat.js untouched).

- [ ] **Step 4: Override smoke test (manual)**

Insert one override locally:
```bash
npx wrangler d1 execute grow-calendar-db --local --command="INSERT OR REPLACE INTO plan_day_overrides (date, payload, updated_at) VALUES ('2026-06-12', '{\"addedTasks\":[\"TEST override task\"]}', '2026-05-25T00:00:00Z');"
```
Reload the app, open June 12, confirm "TEST override task" appears at the end of the task list. Then delete it:
```bash
npx wrangler d1 execute grow-calendar-db --local --command="DELETE FROM plan_day_overrides WHERE date='2026-06-12';"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin claude/grow-plan-d1-foundation
gh pr create --title "D1-backed editable grow plan (foundation)" --body "Sub-project 1 of 2 toward MJ. Moves grow-plan driving dates into D1 (plan_config) and adds a per-day override table (plan_day_overrides). Generator is now config-driven; golden-snapshot test proves identical output. Read-only API; write paths land with MJ.

REMOTE DEPLOY PREREQUISITE: before this merges/auto-deploys, apply the new tables and seed to remote D1:
  npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql
  npx wrangler d1 execute grow-calendar-db --remote --file=./seed/seed-plan-config.sql"
```

---

## Remote deploy prerequisite (do before merge/auto-deploy)

This repo auto-deploys on push to `main`. Before merging, apply to remote D1 (these are additive and idempotent):

```bash
npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql
npx wrangler d1 execute grow-calendar-db --remote --file=./seed/seed-plan-config.sql
```

Unrelated but still pending in this repo: the `login_attempts` migration for the open rate-limiting PR, and a `day_notes` remote check. Reconcile those before the next remote deploy.

## Deferred to the MJ sub-project (sub-project 2)

- `PUT /api/plan/config` and override CRUD (write paths).
- Dosing constants extracted into config + the "adjust dosing" tool.
- `buildPlanText(config, overrides)` driving the AI context from D1, retiring `worker/growContext.js`.
- Splitting the pure date helpers out of `src/lib/dates.js` so the worker can import the generator without bundling React.
- The MJ chat UI, tool-calling, model-selection seam, and confirm-before-write flow.
