# Per-Plant Tracking + Plants Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `TODAY` tab with a `PLANTS` tab where the grower can view each plant in the active grow, keep a dated per-plant log (notes + height + health), and add/edit/archive/delete plants.

**Architecture:** Plants stay in the grow's `survey.strains[]` roster (the single source of truth that also feeds AI plan generation and existing display paths); each entry gains a stable `id` and a `status`. A new `plant_log` table holds the per-plant time-series. New worker routes under `/api/grows/:id/plants/...` mutate the roster (no AI call on add) and the log. A new `PlantsTab` React screen replaces the today-jump tab. Pure logic (roster mutation, validation, normalization, UI partition/derive helpers) is extracted into testable modules; HTTP handlers and React components follow the repo's existing untested-but-linted convention.

**Tech Stack:** Cloudflare Workers + D1 (SQLite), React 18 + framer-motion + lucide-react, Vite. Tests use Node's built-in runner (`node --test`).

## Global Constraints

- **No em dashes anywhere** (prose, comments, strings). Use periods/commas/hyphens.
- **Commits are run by the USER, not the assistant.** Where a step says "Commit", stage nothing on the user's behalf beyond `git add`; print the exact `git commit` command and stop. Never run `git commit`/`git push`.
- **The remote D1 migration is run by the USER** (`npx wrangler d1 execute ... --remote`). Never run remote-mutating wrangler commands.
- Match existing code style: inline styles, `MONO`/`SERIF` font constants, CSS custom-property color tokens (`var(--c-*)`), `@ts-check` on worker files.
- Worker mutating routes require `content-type: application/json` (already enforced centrally) and use `safeJsonBounded` for body parsing, `json()`/`error()` from `worker/util.js`.
- Plant `type` ∈ `{indica, sativa, hybrid}`; `status` ∈ `{growing, harvested, dead}`; `health` ∈ `{thriving, healthy, stressed, sick}`; `height_unit` ∈ `{in, cm}`.
- Adding a plant must NOT trigger AI plan generation or alter the calendar/config.
- No photos in this phase.

---

## File structure

**New**
- `worker/plantsRoster.js` — pure roster + validation + log-normalization helpers (unit tested).
- `worker/plants.js` — HTTP handlers for roster + log endpoints, lazy `plant_log` schema.
- `migrations/003_plant_log.sql` — `plant_log` table + index.
- `src/lib/usePlantLog.js` — React hook to load/mutate one plant's log.
- `src/components/PlantsTab/constants.js` — UI constants + pure `partitionPlants`/`latestMetrics` (unit tested).
- `src/components/PlantsTab/PlantCard.jsx`
- `src/components/PlantsTab/LogEntryForm.jsx`
- `src/components/PlantsTab/AddPlantSheet.jsx`
- `src/components/PlantsTab/PlantDetail.jsx`
- `src/components/PlantsTab/PlantsTab.jsx`
- `test/plants-roster.test.js`
- `test/plants-ui-helpers.test.js`

**Modified**
- `worker/grows.js` — backfill plant ids in the `getGrow` read path.
- `worker/index.js` — route the new endpoints.
- `src/lib/api.js` — client methods.
- `src/components/TabBar.jsx` — TODAY → PLANTS.
- `src/App.jsx` — render `PlantsTab`, drop `today` branches.
- `schema.sql` — document the new table.

---

### Task 1: Roster pure helpers

**Files:**
- Create: `worker/plantsRoster.js`
- Test: `test/plants-roster.test.js`

**Interfaces:**
- Produces:
  - `PLANT_TYPES: Set<string>`, `PLANT_STATUSES: Set<string>`, `HEALTH_VALUES: Set<string>`, `HEIGHT_UNITS: Set<string>`
  - `newPlantId(): string` (format `p_<base36>`)
  - `ensurePlantIds(survey): { survey, changed: boolean }`
  - `validatePlantFields(fields, partial=false): { ok:true, value } | { ok:false, error }`
  - `addPlantToSurvey(survey, fields, idGen=newPlantId): { survey, plant }`
  - `updatePlantInSurvey(survey, plantId, patch): { survey, plant } | null`
  - `removePlantFromSurvey(survey, plantId): { survey } | null`

- [ ] **Step 1: Write the failing test**

Create `test/plants-roster.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey,
} from "../worker/plantsRoster.js";

test("ensurePlantIds assigns ids and default status, preserves existing ids", () => {
  const survey = { strains: [{ name: "A", id: "p_keep" }, { name: "B" }] };
  const { survey: out, changed } = ensurePlantIds(survey);
  assert.equal(changed, true);
  assert.equal(out.strains[0].id, "p_keep");
  assert.ok(out.strains[1].id);
  assert.equal(out.strains[0].status, "growing");
  assert.equal(out.strains[1].status, "growing");
  // input not mutated
  assert.equal(survey.strains[1].id, undefined);
});

test("ensurePlantIds is a no-op when everything is present", () => {
  const survey = { strains: [{ name: "A", id: "p_1", status: "harvested" }] };
  const { changed } = ensurePlantIds(survey);
  assert.equal(changed, false);
});

test("validatePlantFields rejects bad input and normalizes good input", () => {
  assert.equal(validatePlantFields({ name: "" }).ok, false);
  assert.equal(validatePlantFields({ name: "X", type: "bogus" }).ok, false);
  assert.equal(validatePlantFields({ name: "X", flowerWeeks: 99 }).ok, false);
  const ok = validatePlantFields({ name: "  Blue Dream  ", type: "sativa", photo: false, flowerWeeks: 10 });
  assert.deepEqual(ok.value, { name: "Blue Dream", type: "sativa", photo: false, flowerWeeks: 10 });
});

test("validatePlantFields partial allows a subset including status", () => {
  const r = validatePlantFields({ status: "dead" }, true);
  assert.deepEqual(r.value, { status: "dead" });
  assert.equal(validatePlantFields({ status: "nope" }, true).ok, false);
});

test("addPlantToSurvey appends with id and status, deterministic via idGen", () => {
  const { survey, plant } = addPlantToSurvey({ strains: [] }, { name: "A", type: "hybrid", photo: true, flowerWeeks: 9 }, () => "p_test");
  assert.equal(plant.id, "p_test");
  assert.equal(plant.status, "growing");
  assert.equal(survey.strains.length, 1);
});

test("addPlantToSurvey handles a missing strains array", () => {
  const { survey } = addPlantToSurvey({}, { name: "A" }, () => "p_x");
  assert.equal(survey.strains.length, 1);
});

test("updatePlantInSurvey patches the matching plant or returns null", () => {
  const base = { strains: [{ id: "p_1", name: "A", status: "growing" }] };
  const res = updatePlantInSurvey(base, "p_1", { status: "harvested" });
  assert.equal(res.plant.status, "harvested");
  assert.equal(updatePlantInSurvey(base, "p_missing", { status: "dead" }), null);
});

test("removePlantFromSurvey drops the plant or returns null", () => {
  const base = { strains: [{ id: "p_1" }, { id: "p_2" }] };
  const res = removePlantFromSurvey(base, "p_1");
  assert.equal(res.survey.strains.length, 1);
  assert.equal(removePlantFromSurvey(base, "p_missing"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plants-roster.test.js`
Expected: FAIL (cannot find module `../worker/plantsRoster.js`).

- [ ] **Step 3: Write minimal implementation**

Create `worker/plantsRoster.js`:

```js
// @ts-check
// Pure helpers for the per-plant roster (stored in a grow's survey.strains[])
// and for validating log-entry input. No DB access, so these are unit-testable
// in isolation with node --test.

export const PLANT_TYPES = new Set(["indica", "sativa", "hybrid"]);
export const PLANT_STATUSES = new Set(["growing", "harvested", "dead"]);
export const HEALTH_VALUES = new Set(["thriving", "healthy", "stressed", "sick"]);
export const HEIGHT_UNITS = new Set(["in", "cm"]);

const NAME_MAX = 60;

export function newPlantId() {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Assigns a stable id + default status to any strain entry missing them.
// Returns { survey, changed }. Never mutates the input.
export function ensurePlantIds(survey) {
  if (!survey || !Array.isArray(survey.strains)) return { survey, changed: false };
  let changed = false;
  const strains = survey.strains.map((s) => {
    const next = { ...s };
    if (!next.id) { next.id = newPlantId(); changed = true; }
    if (!PLANT_STATUSES.has(next.status)) { next.status = "growing"; changed = true; }
    return next;
  });
  return changed ? { survey: { ...survey, strains }, changed: true } : { survey, changed: false };
}

// Validates + normalizes plant roster fields. partial=true allows a subset (PATCH).
export function validatePlantFields(fields, partial = false) {
  const out = {};
  const has = (k) => fields[k] !== undefined;

  if (has("name") || !partial) {
    const name = String(fields.name ?? "").trim();
    if (!name) return { ok: false, error: "name required" };
    out.name = name.slice(0, NAME_MAX);
  }
  if (has("type") || !partial) {
    const type = String(fields.type ?? "hybrid");
    if (!PLANT_TYPES.has(type)) return { ok: false, error: "invalid type" };
    out.type = type;
  }
  if (has("photo") || !partial) {
    out.photo = Boolean(fields.photo ?? true);
  }
  if (has("flowerWeeks") || !partial) {
    const fw = Number(fields.flowerWeeks ?? 9);
    if (!Number.isFinite(fw) || fw < 4 || fw > 20) return { ok: false, error: "flowerWeeks out of range" };
    out.flowerWeeks = Math.round(fw);
  }
  if (has("status")) {
    if (!PLANT_STATUSES.has(fields.status)) return { ok: false, error: "invalid status" };
    out.status = fields.status;
  }
  return { ok: true, value: out };
}

export function addPlantToSurvey(survey, fields, idGen = newPlantId) {
  const base = survey && typeof survey === "object" ? survey : {};
  const strains = Array.isArray(base.strains) ? base.strains.slice() : [];
  const plant = { id: idGen(), status: "growing", ...fields };
  strains.push(plant);
  return { survey: { ...base, strains }, plant };
}

export function updatePlantInSurvey(survey, plantId, patch) {
  if (!survey || !Array.isArray(survey.strains)) return null;
  let plant = null;
  const strains = survey.strains.map((s) => {
    if (s.id !== plantId) return s;
    plant = { ...s, ...patch };
    return plant;
  });
  if (!plant) return null;
  return { survey: { ...survey, strains }, plant };
}

export function removePlantFromSurvey(survey, plantId) {
  if (!survey || !Array.isArray(survey.strains)) return null;
  const strains = survey.strains.filter((s) => s.id !== plantId);
  if (strains.length === survey.strains.length) return null;
  return { survey: { ...survey, strains } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plants-roster.test.js`
Expected: PASS (all tests).

- [ ] **Step 5: Commit** (hand to user)

```bash
git add worker/plantsRoster.js test/plants-roster.test.js
git commit -m "Add pure plant-roster helpers with tests"
```

---

### Task 2: Log-entry normalization helper

**Files:**
- Modify: `worker/plantsRoster.js` (append `normalizeLogEntry`)
- Test: `test/plants-roster.test.js` (append cases)

**Interfaces:**
- Consumes: nothing new.
- Produces: `normalizeLogEntry(input, partial=false, todayIso?): { ok:true, value } | { ok:false, error }`. `value` uses DB column names (`date`, `body`, `height`, `height_unit`, `health`).

- [ ] **Step 1: Write the failing test**

Append to `test/plants-roster.test.js`:

```js
import { normalizeLogEntry } from "../worker/plantsRoster.js";

test("normalizeLogEntry requires a valid date when not partial", () => {
  assert.equal(normalizeLogEntry({ body: "x", date: "nope" }).ok, false);
  const ok = normalizeLogEntry({ body: "fed", date: "2026-06-17" });
  assert.equal(ok.value.date, "2026-06-17");
  assert.equal(ok.value.body, "fed");
});

test("normalizeLogEntry defaults date to todayIso", () => {
  const ok = normalizeLogEntry({ body: "x" }, false, "2026-06-17");
  assert.equal(ok.value.date, "2026-06-17");
});

test("normalizeLogEntry validates height and health, allows clearing", () => {
  assert.equal(normalizeLogEntry({ body: "x", date: "2026-06-17", height: -1 }).ok, false);
  assert.equal(normalizeLogEntry({ body: "x", date: "2026-06-17", health: "bogus" }).ok, false);
  const ok = normalizeLogEntry({ body: "x", date: "2026-06-17", height: 24, heightUnit: "in", health: "healthy" });
  assert.deepEqual(ok.value, { date: "2026-06-17", body: "x", height: 24, height_unit: "in", health: "healthy" });
  const cleared = normalizeLogEntry({ height: "", health: "" }, true);
  assert.deepEqual(cleared.value, { height: null, health: null });
});

test("normalizeLogEntry partial rejects an empty object only when not partial", () => {
  assert.equal(normalizeLogEntry({}, true).ok, true);
  assert.equal(normalizeLogEntry({ date: "2026-06-17" }, false).value.body, "");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plants-roster.test.js`
Expected: FAIL (`normalizeLogEntry` is not exported).

- [ ] **Step 3: Write minimal implementation**

Append to `worker/plantsRoster.js`:

```js
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_MAX = 2000;

// Validates + normalizes a log entry. partial=true for PATCH. Returns DB-column
// shaped value: { date, body, height, height_unit, health }.
export function normalizeLogEntry(input, partial = false, todayIso) {
  const out = {};
  const has = (k) => input[k] !== undefined;

  if (has("date") || !partial) {
    const date = String(input.date ?? todayIso ?? "");
    if (!DATE_RE.test(date)) return { ok: false, error: "date must be YYYY-MM-DD" };
    out.date = date;
  }
  if (has("body") || !partial) {
    out.body = String(input.body ?? "").slice(0, BODY_MAX);
  }
  if (has("height")) {
    if (input.height === null || input.height === "") {
      out.height = null;
    } else {
      const h = Number(input.height);
      if (!Number.isFinite(h) || h < 0 || h > 2000) return { ok: false, error: "height out of range" };
      out.height = h;
    }
  }
  if (has("heightUnit")) {
    if (input.heightUnit == null || input.heightUnit === "") out.height_unit = null;
    else if (!HEIGHT_UNITS.has(input.heightUnit)) return { ok: false, error: "invalid heightUnit" };
    else out.height_unit = input.heightUnit;
  }
  if (has("health")) {
    if (input.health == null || input.health === "") out.health = null;
    else if (!HEALTH_VALUES.has(input.health)) return { ok: false, error: "invalid health" };
    else out.health = input.health;
  }
  return { ok: true, value: out };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plants-roster.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (hand to user)

```bash
git add worker/plantsRoster.js test/plants-roster.test.js
git commit -m "Add log-entry normalization helper with tests"
```

---

### Task 3: Migration + schema documentation

**Files:**
- Create: `migrations/003_plant_log.sql`
- Modify: `schema.sql` (document the new table near the other per-grow tables)

**Interfaces:** none (SQL only).

- [ ] **Step 1: Create the migration**

Create `migrations/003_plant_log.sql`:

```sql
-- Per-plant time-series log. plant_id = the stable id on a grow's survey.strains[] entry.
-- Run remotely before/at merge:
--   npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/003_plant_log.sql
CREATE TABLE IF NOT EXISTS plant_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  grow_id     TEXT NOT NULL,
  plant_id    TEXT NOT NULL,
  date        TEXT NOT NULL,
  body        TEXT NOT NULL DEFAULT '',
  height      REAL,
  height_unit TEXT,
  health      TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plant_log
  ON plant_log(user_id, grow_id, plant_id, date DESC);
```

- [ ] **Step 2: Document in schema.sql**

Append the same `CREATE TABLE IF NOT EXISTS plant_log (...)` and `CREATE INDEX IF NOT EXISTS idx_plant_log ...` block to `schema.sql` (after the `grows` table block, before `share_tokens`), with a one-line comment: `-- Per-plant log entries (notes + height + health). plant_id references a survey.strains[] entry id.`

- [ ] **Step 3: Verify SQL parses locally (optional, non-blocking)**

If a local D1 exists: `npx wrangler d1 execute grow-calendar-db --local --file=./migrations/003_plant_log.sql`
Expected: success, or skip if no local DB is configured. Do NOT run `--remote` (user does that at deploy).

- [ ] **Step 4: Commit** (hand to user)

```bash
git add migrations/003_plant_log.sql schema.sql
git commit -m "Add plant_log table migration and schema doc"
```

---

### Task 4: Worker roster endpoints + id backfill + routes

**Files:**
- Create: `worker/plants.js`
- Modify: `worker/grows.js` (backfill ids in `getGrow`)
- Modify: `worker/index.js` (route roster endpoints)

**Interfaces:**
- Consumes: `worker/plantsRoster.js` (Task 1), `json`/`error`/`safeJsonBounded` from `worker/util.js`, `logError` from `worker/log.js`.
- Produces (exports from `worker/plants.js`):
  - `addPlant(request, env, user, growId): Response`
  - `patchPlant(request, env, user, growId, plantId): Response`
  - `deletePlant(env, user, growId, plantId): Response`
  - `ensurePlantLogSchema(env): Promise<void>` (used here for delete-cascade; also by Task 5)
  - `ownedGrowRow(env, userId, growId)`, `parseSurvey(raw)`, `saveSurvey(...)` (internal, may be unexported)

- [ ] **Step 1: Create `worker/plants.js` (roster handlers + lazy schema)**

```js
// @ts-check
import { json, error, safeJsonBounded } from "./util.js";
import { logError } from "./log.js";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey, normalizeLogEntry,
} from "./plantsRoster.js";

function parseSurvey(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function ownedGrowRow(env, userId, growId) {
  return env.DB.prepare(
    "SELECT survey FROM grows WHERE id = ? AND user_id = ?"
  ).bind(growId, userId).first();
}

async function saveSurvey(env, userId, growId, survey) {
  await env.DB.prepare(
    "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(survey), new Date().toISOString(), growId, userId).run();
}

let _schemaReady = false;
export async function ensurePlantLogSchema(env) {
  if (_schemaReady) return;
  try {
    await env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS plant_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL,
        grow_id     TEXT NOT NULL,
        plant_id    TEXT NOT NULL,
        date        TEXT NOT NULL,
        body        TEXT NOT NULL DEFAULT '',
        height      REAL,
        height_unit TEXT,
        health      TEXT,
        created_at  TEXT NOT NULL,
        updated_at  TEXT NOT NULL
      )`
    ).run();
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_plant_log ON plant_log(user_id, grow_id, plant_id, date DESC)"
    ).run();
    _schemaReady = true;
  } catch (e) {
    logError("plant-log-ddl", { message: String(e?.message) });
  }
}

// POST /api/grows/:id/plants
export async function addPlant(request, env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = validatePlantFields(body ?? {}, false);
  if (!v.ok) return error(400, v.error);

  const survey = parseSurvey(row.survey) ?? {};
  const { survey: nextSurvey, plant } = addPlantToSurvey(survey, v.value);
  await saveSurvey(env, user.id, growId, nextSurvey);
  return json({ ok: true, plant });
}

// PATCH /api/grows/:id/plants/:plantId
export async function patchPlant(request, env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = validatePlantFields(body ?? {}, true);
  if (!v.ok) return error(400, v.error);
  if (Object.keys(v.value).length === 0) return error(400, "no valid fields");

  const ensured = ensurePlantIds(parseSurvey(row.survey) ?? {});
  const res = updatePlantInSurvey(ensured.survey, plantId, v.value);
  if (!res) return error(404, "plant not found");

  await saveSurvey(env, user.id, growId, res.survey);
  return json({ ok: true, plant: res.plant });
}

// DELETE /api/grows/:id/plants/:plantId
export async function deletePlant(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  const res = removePlantFromSurvey(parseSurvey(row.survey) ?? {}, plantId);
  if (!res) return error(404, "plant not found");

  await saveSurvey(env, user.id, growId, res.survey);
  await ensurePlantLogSchema(env);
  await env.DB.prepare(
    "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ?"
  ).bind(user.id, growId, plantId).run();
  return json({ ok: true });
}

export { ownedGrowRow, parseSurvey, saveSurvey };
```

- [ ] **Step 2: Backfill ids in `worker/grows.js` `getGrow`**

In `worker/grows.js`, add to the imports at the top:

```js
import { ensurePlantIds } from "./plantsRoster.js";
```

In `getGrow`, replace the line `const survey = parseField(row.survey);` with:

```js
  let survey = parseField(row.survey);
  if (survey) {
    const ensured = ensurePlantIds(survey);
    if (ensured.changed) {
      survey = ensured.survey;
      await env.DB.prepare(
        "UPDATE grows SET survey = ?, updated_at = ? WHERE id = ? AND user_id = ?"
      ).bind(JSON.stringify(survey), new Date().toISOString(), row.id, user.id).run();
    }
  }
```

(Leave the rest of `getGrow` unchanged; it already returns `survey` in the JSON body.)

- [ ] **Step 3: Route the roster endpoints in `worker/index.js`**

Add to the imports near the `grows.js` import:

```js
import { addPlant, patchPlant, deletePlant } from "./plants.js";
```

In `authenticatedRoute`, immediately AFTER the `growDayMatch` block (around line 181) and BEFORE the `/api/share` block, insert:

```js
  const plantsMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants$/);
  if (plantsMatch && method === "POST") return addPlant(request, env, user, plantsMatch[1]);
  const plantMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)$/);
  if (plantMatch) {
    const gId = plantMatch[1];
    const pId = plantMatch[2];
    if (method === "PATCH")  return patchPlant(request, env, user, gId, pId);
    if (method === "DELETE") return deletePlant(env, user, gId, pId);
  }
```

(These have extra path segments, so they never collide with the `^/api/grows/([A-Za-z0-9]+)$` grow route.)

- [ ] **Step 4: Verify build + lint pass**

Run: `npm run build`
Expected: build succeeds (no import errors).
Run: `npm run lint`
Expected: no new errors in `worker/plants.js`, `worker/grows.js`, `worker/index.js`.

- [ ] **Step 5: Commit** (hand to user)

```bash
git add worker/plants.js worker/grows.js worker/index.js
git commit -m "Add plant roster endpoints and id backfill"
```

---

### Task 5: Worker log endpoints + summary + routes

**Files:**
- Modify: `worker/plants.js` (append log handlers + summary)
- Modify: `worker/index.js` (route log endpoints)

**Interfaces:**
- Consumes: `ownedGrowRow`, `parseSurvey`, `ensurePlantLogSchema` (Task 4), `normalizeLogEntry` (Task 2).
- Produces (exports from `worker/plants.js`):
  - `listPlantLog(env, user, growId, plantId): Response` → `{ entries: [...] }`
  - `addPlantLogEntry(request, env, user, growId, plantId): Response` → `{ ok, id }`
  - `patchPlantLogEntry(request, env, user, growId, plantId, entryId): Response`
  - `deletePlantLogEntry(env, user, growId, plantId, entryId): Response`
  - `plantLogSummary(env, user, growId): Response` → `{ summary: { [plantId]: { date, height, heightUnit, health } } }`

- [ ] **Step 1: Append log handlers to `worker/plants.js`**

```js
// GET /api/grows/:id/plants/:plantId/log
export async function listPlantLog(env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT id, date, body, height, height_unit, health, created_at, updated_at
     FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ?
     ORDER BY date DESC, id DESC`
  ).bind(user.id, growId, plantId).all();
  return json({ entries: res.results ?? [] });
}

// POST /api/grows/:id/plants/:plantId/log
export async function addPlantLogEntry(request, env, user, growId, plantId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const survey = parseSurvey(row.survey);
  const exists = Array.isArray(survey?.strains) && survey.strains.some((s) => s.id === plantId);
  if (!exists) return error(404, "plant not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const todayIso = new Date().toISOString().slice(0, 10);
  const v = normalizeLogEntry(body ?? {}, false, todayIso);
  if (!v.ok) return error(400, v.error);

  await ensurePlantLogSchema(env);
  const now = new Date().toISOString();
  const ins = await env.DB.prepare(
    `INSERT INTO plant_log
       (user_id, grow_id, plant_id, date, body, height, height_unit, health, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    user.id, growId, plantId,
    v.value.date, v.value.body ?? "",
    v.value.height ?? null, v.value.height_unit ?? null, v.value.health ?? null,
    now, now,
  ).run();
  return json({ ok: true, id: ins.meta.last_row_id });
}

// PATCH /api/grows/:id/plants/:plantId/log/:entryId
export async function patchPlantLogEntry(request, env, user, growId, plantId, entryId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");

  let body;
  { const p = await safeJsonBounded(request, 8192); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const v = normalizeLogEntry(body ?? {}, true);
  if (!v.ok) return error(400, v.error);
  const cols = Object.keys(v.value); // safe: fixed set from the normalizer
  if (cols.length === 0) return error(400, "no valid fields");

  await ensurePlantLogSchema(env);
  const sets = cols.map((c) => `${c} = ?`).join(", ");
  const binds = cols.map((c) => v.value[c]);
  binds.push(new Date().toISOString(), user.id, growId, plantId, entryId);
  const upd = await env.DB.prepare(
    `UPDATE plant_log SET ${sets}, updated_at = ?
     WHERE user_id = ? AND grow_id = ? AND plant_id = ? AND id = ?`
  ).bind(...binds).run();
  if (!upd.meta.changes) return error(404, "entry not found");
  return json({ ok: true });
}

// DELETE /api/grows/:id/plants/:plantId/log/:entryId
export async function deletePlantLogEntry(env, user, growId, plantId, entryId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const del = await env.DB.prepare(
    "DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id = ? AND id = ?"
  ).bind(user.id, growId, plantId, entryId).run();
  if (!del.meta.changes) return error(404, "entry not found");
  return json({ ok: true });
}

// GET /api/grows/:id/plant-log-summary — latest metric row per plant in one query.
export async function plantLogSummary(env, user, growId) {
  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  await ensurePlantLogSchema(env);
  const res = await env.DB.prepare(
    `SELECT plant_id, date, height, height_unit, health FROM (
       SELECT plant_id, date, height, height_unit, health,
              ROW_NUMBER() OVER (PARTITION BY plant_id ORDER BY date DESC, id DESC) AS rn
       FROM plant_log WHERE user_id = ? AND grow_id = ?
     ) WHERE rn = 1`
  ).bind(user.id, growId).all();
  const summary = {};
  for (const r of res.results ?? []) {
    summary[r.plant_id] = { date: r.date, height: r.height, heightUnit: r.height_unit, health: r.health };
  }
  return json({ summary });
}
```

- [ ] **Step 2: Route the log endpoints in `worker/index.js`**

Extend the `plants.js` import:

```js
import { addPlant, patchPlant, deletePlant, listPlantLog, addPlantLogEntry, patchPlantLogEntry, deletePlantLogEntry, plantLogSummary } from "./plants.js";
```

Immediately AFTER the `plantMatch` block added in Task 4, insert:

```js
  const plantSummaryMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plant-log-summary$/);
  if (plantSummaryMatch && method === "GET") return plantLogSummary(env, user, plantSummaryMatch[1]);
  const plantLogMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/log$/);
  if (plantLogMatch) {
    const gId = plantLogMatch[1];
    const pId = plantLogMatch[2];
    if (method === "GET")  return listPlantLog(env, user, gId, pId);
    if (method === "POST") return addPlantLogEntry(request, env, user, gId, pId);
  }
  const plantLogEntryMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/log\/(\d+)$/);
  if (plantLogEntryMatch) {
    const gId = plantLogEntryMatch[1];
    const pId = plantLogEntryMatch[2];
    const eId = Number(plantLogEntryMatch[3]);
    if (method === "PATCH")  return patchPlantLogEntry(request, env, user, gId, pId, eId);
    if (method === "DELETE") return deletePlantLogEntry(env, user, gId, pId, eId);
  }
```

- [ ] **Step 3: Verify build + lint**

Run: `npm run build` → expected success.
Run: `npm run lint` → expected no new errors.

- [ ] **Step 4: Commit** (hand to user)

```bash
git add worker/plants.js worker/index.js
git commit -m "Add per-plant log endpoints and summary"
```

---

### Task 6: Client API methods

**Files:**
- Modify: `src/lib/api.js` (add methods inside the `api` object, after the `patchGrowDay` entry)

**Interfaces:**
- Produces on `api`: `addPlant(growId, fields)`, `patchPlant(growId, plantId, patch)`, `deletePlant(growId, plantId)`, `getPlantLog(growId, plantId)`, `getPlantLogSummary(growId)`, `addPlantLogEntry(growId, plantId, entry)`, `patchPlantLogEntry(growId, plantId, entryId, patch)`, `deletePlantLogEntry(growId, plantId, entryId)`.

- [ ] **Step 1: Add the methods**

In `src/lib/api.js`, directly after the `patchGrowDay:` entry, insert:

```js
  addPlant: (growId, fields) =>
    request(`/api/grows/${growId}/plants`, { method: "POST", body: JSON.stringify(fields) }),
  patchPlant: (growId, plantId, patch) =>
    request(`/api/grows/${growId}/plants/${plantId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePlant: (growId, plantId) =>
    request(`/api/grows/${growId}/plants/${plantId}`, { method: "DELETE", body: "{}" }),
  getPlantLog: (growId, plantId) =>
    request(`/api/grows/${growId}/plants/${plantId}/log`),
  getPlantLogSummary: (growId) =>
    request(`/api/grows/${growId}/plant-log-summary`),
  addPlantLogEntry: (growId, plantId, entry) =>
    request(`/api/grows/${growId}/plants/${plantId}/log`, { method: "POST", body: JSON.stringify(entry) }),
  patchPlantLogEntry: (growId, plantId, entryId, patch) =>
    request(`/api/grows/${growId}/plants/${plantId}/log/${entryId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePlantLogEntry: (growId, plantId, entryId) =>
    request(`/api/grows/${growId}/plants/${plantId}/log/${entryId}`, { method: "DELETE", body: "{}" }),
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/lib/api.js
git commit -m "Add plant + plant-log client API methods"
```

---

### Task 7: UI constants + pure UI helpers

**Files:**
- Create: `src/components/PlantsTab/constants.js`
- Test: `test/plants-ui-helpers.test.js`

**Interfaces:**
- Produces: `MONO`, `SERIF`, `TYPE_LABEL`, `HEALTH_OPTIONS`, `HEALTH_MAP`, `partitionPlants(survey): { active, archived }`, `latestMetrics(entries): { height, heightUnit, health, lastDate }`.

- [ ] **Step 1: Write the failing test**

Create `test/plants-ui-helpers.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { partitionPlants, latestMetrics } from "../src/components/PlantsTab/constants.js";

test("partitionPlants splits growing vs archived", () => {
  const survey = { strains: [
    { id: "a", status: "growing" }, { id: "b", status: "harvested" },
    { id: "c", status: "dead" }, { id: "d" },
  ] };
  const { active, archived } = partitionPlants(survey);
  assert.deepEqual(active.map((p) => p.id), ["a", "d"]);
  assert.deepEqual(archived.map((p) => p.id), ["b", "c"]);
});

test("partitionPlants tolerates a null survey", () => {
  const { active, archived } = partitionPlants(null);
  assert.deepEqual(active, []);
  assert.deepEqual(archived, []);
});

test("latestMetrics picks newest height + health from date-desc entries", () => {
  const entries = [
    { date: "2026-06-17", height: null, height_unit: null, health: "stressed" },
    { date: "2026-06-10", height: 30, height_unit: "in", health: "healthy" },
  ];
  const m = latestMetrics(entries);
  assert.equal(m.lastDate, "2026-06-17");
  assert.equal(m.health, "stressed");
  assert.equal(m.height, 30);
  assert.equal(m.heightUnit, "in");
});

test("latestMetrics returns nulls for empty input", () => {
  assert.deepEqual(latestMetrics([]), { height: null, heightUnit: null, health: null, lastDate: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plants-ui-helpers.test.js`
Expected: FAIL (module not found).

- [ ] **Step 3: Write the implementation**

Create `src/components/PlantsTab/constants.js`:

```js
export const MONO = "'Courier New', monospace";
export const SERIF = "'Georgia', 'Times New Roman', serif";

export const TYPE_LABEL = { indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" };

export const HEALTH_OPTIONS = [
  { value: "thriving", label: "Thriving", color: "var(--c-accent)" },
  { value: "healthy",  label: "Healthy",  color: "var(--c-text-dim)" },
  { value: "stressed", label: "Stressed", color: "var(--c-warn)" },
  { value: "sick",     label: "Sick",     color: "var(--c-danger)" },
];
export const HEALTH_MAP = Object.fromEntries(HEALTH_OPTIONS.map((o) => [o.value, o]));

// Split a grow's strain roster into active (growing) and archived plants.
export function partitionPlants(survey) {
  const strains = Array.isArray(survey?.strains) ? survey.strains : [];
  const active = [];
  const archived = [];
  for (const p of strains) {
    if (p.status === "harvested" || p.status === "dead") archived.push(p);
    else active.push(p);
  }
  return { active, archived };
}

// Most recent height + health from a plant's log entries (already date DESC).
export function latestMetrics(entries) {
  let height = null;
  let heightUnit = null;
  let health = null;
  let lastDate = null;
  for (const e of entries ?? []) {
    if (lastDate == null) lastDate = e.date;
    if (height == null && e.height != null) { height = e.height; heightUnit = e.height_unit; }
    if (health == null && e.health) health = e.health;
    if (height != null && health != null) break;
  }
  return { height, heightUnit, health, lastDate };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/plants-ui-helpers.test.js`
Expected: PASS.

- [ ] **Step 5: Commit** (hand to user)

```bash
git add src/components/PlantsTab/constants.js test/plants-ui-helpers.test.js
git commit -m "Add Plants tab constants and pure UI helpers with tests"
```

---

### Task 8: usePlantLog hook

**Files:**
- Create: `src/lib/usePlantLog.js`

**Interfaces:**
- Consumes: `api.getPlantLog/addPlantLogEntry/patchPlantLogEntry/deletePlantLogEntry` (Task 6).
- Produces: `usePlantLog(growId, plantId, enabled): { entries, loading, addEntry(entry), editEntry(id, patch), removeEntry(id), reload() }`.

- [ ] **Step 1: Implement the hook**

Create `src/lib/usePlantLog.js`:

```js
import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";

// Loads and mutates a single plant's log. Refetches after each mutation so the
// list stays consistent with the server (entries arrive date DESC).
export function usePlantLog(growId, plantId, enabled) {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(() => {
    if (!growId || !plantId || !enabled) { setEntries([]); return; }
    setLoading(true);
    api.getPlantLog(growId, plantId)
      .then((d) => setEntries(d.entries ?? []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [growId, plantId, enabled]);

  useEffect(() => { reload(); }, [reload]);

  const addEntry = useCallback(async (entry) => {
    await api.addPlantLogEntry(growId, plantId, entry);
    reload();
  }, [growId, plantId, reload]);

  const editEntry = useCallback(async (entryId, patch) => {
    await api.patchPlantLogEntry(growId, plantId, entryId, patch);
    reload();
  }, [growId, plantId, reload]);

  const removeEntry = useCallback(async (entryId) => {
    await api.deletePlantLogEntry(growId, plantId, entryId);
    reload();
  }, [growId, plantId, reload]);

  return { entries, loading, addEntry, editEntry, removeEntry, reload };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/lib/usePlantLog.js
git commit -m "Add usePlantLog hook"
```

---

### Task 9: PlantCard component

**Files:**
- Create: `src/components/PlantsTab/PlantCard.jsx`

**Interfaces:**
- Consumes: `MONO`, `SERIF`, `TYPE_LABEL`, `HEALTH_MAP` (Task 7).
- Produces: `<PlantCard plant currentPhaseLabel metrics onOpen />`. `metrics` is `{ date, height, heightUnit, health } | undefined`.

- [ ] **Step 1: Implement**

Create `src/components/PlantsTab/PlantCard.jsx`:

```jsx
import { motion } from "framer-motion";
import { MONO, SERIF, TYPE_LABEL, HEALTH_MAP } from "./constants.js";

export default function PlantCard({ plant, currentPhaseLabel, metrics, onOpen }) {
  const health = metrics?.health ? HEALTH_MAP[metrics.health] : null;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: 16, borderRadius: 14,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: SERIF, color: "var(--c-text)", lineHeight: 1.2 }}>
          {plant.name || "Unnamed plant"}
        </div>
        {health && (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: health.color, textTransform: "uppercase", flexShrink: 0 }}>
            {health.label}
          </span>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", marginTop: 6, letterSpacing: 0.3 }}>
        {TYPE_LABEL[plant.type] ?? plant.type}
        {plant.photo === false ? " · Auto" : " · Photo"}
        {plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk flower` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
        <span>{currentPhaseLabel ? `Phase: ${currentPhaseLabel}` : "No timeline"}</span>
        {metrics?.height != null && <span>{metrics.height}{metrics.heightUnit || ""}</span>}
      </div>
      {metrics?.date && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 4 }}>
          Last log: {metrics.date}
        </div>
      )}
    </motion.button>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build` → expected success.

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/components/PlantsTab/PlantCard.jsx
git commit -m "Add PlantCard component"
```

---

### Task 10: LogEntryForm component

**Files:**
- Create: `src/components/PlantsTab/LogEntryForm.jsx`

**Interfaces:**
- Consumes: `Label`, `Input`, `RadioGroup`, `MONO` from `../SetupWizard/styleHelpers.jsx`; `HEALTH_OPTIONS` (Task 7).
- Produces: `<LogEntryForm initial onSave onCancel saving />`. `onSave(entry)` where `entry = { date, body, height, heightUnit, health }` (height/health null when blank). `initial` may be `undefined` (add) or an existing entry row (edit).

- [ ] **Step 1: Implement**

Create `src/components/PlantsTab/LogEntryForm.jsx`:

```jsx
import { useState } from "react";
import { Label, Input, RadioGroup, MONO, SERIF } from "../SetupWizard/styleHelpers.jsx";
import { HEALTH_OPTIONS } from "./constants.js";

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function LogEntryForm({ initial, onSave, onCancel, saving }) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initial?.date ?? today);
  const [body, setBody] = useState(initial?.body ?? "");
  const [height, setHeight] = useState(initial?.height != null ? String(initial.height) : "");
  const [heightUnit, setHeightUnit] = useState(initial?.height_unit ?? "in");
  const [health, setHealth] = useState(initial?.health ?? "");

  function submit() {
    const hasHeight = height !== "";
    onSave({
      date,
      body,
      height: hasHeight ? Number(height) : null,
      heightUnit: hasHeight ? heightUnit : null,
      health: health || null,
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><Label>Date</Label><Input type="date" value={date} onChange={setDate} /></div>
      <div>
        <Label>Notes</Label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          placeholder="What did you observe or do?"
          style={{ width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", color: "var(--c-text)", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "12px 14px", fontSize: 16, fontFamily: SERIF, outline: "none", resize: "vertical" }}
        />
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}><Label>Height</Label><Input type="number" value={height} onChange={setHeight} placeholder="optional" /></div>
        <RadioGroup value={heightUnit} onChange={setHeightUnit} options={[{ value: "in", label: "in" }, { value: "cm", label: "cm" }]} />
      </div>
      <div>
        <Label>Health</Label>
        <RadioGroup
          value={health}
          onChange={(v) => setHealth(v === health ? "" : v)}
          options={HEALTH_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={saving} onClick={submit} style={btn("primary", saving)}>
          {saving ? "Saving…" : "Save entry"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build** → `npm run build` (expected success).

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/components/PlantsTab/LogEntryForm.jsx
git commit -m "Add LogEntryForm component"
```

---

### Task 11: AddPlantSheet component

**Files:**
- Create: `src/components/PlantsTab/AddPlantSheet.jsx`

**Interfaces:**
- Consumes: `Label`, `Input`, `RadioGroup`, `NumStepper`, `MONO` from `../SetupWizard/styleHelpers.jsx`.
- Produces: `<AddPlantSheet onSave onCancel saving />`. `onSave(fields)` where `fields = { name, type, photo, flowerWeeks }`.

- [ ] **Step 1: Implement**

Create `src/components/PlantsTab/AddPlantSheet.jsx`:

```jsx
import { useState } from "react";
import { Label, Input, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";

const BLANK = { name: "", type: "hybrid", photo: true, flowerWeeks: 9 };

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function AddPlantSheet({ onSave, onCancel, saving }) {
  const [f, setF] = useState(BLANK);
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const disabled = saving || !f.name.trim();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><Label>Strain name</Label><Input value={f.name} onChange={(v) => up("name", v)} placeholder="e.g. Blue Dream" /></div>
      <div>
        <Label>Type</Label>
        <RadioGroup value={f.type} onChange={(v) => up("type", v)} options={[
          { value: "indica", label: "Indica" }, { value: "sativa", label: "Sativa" }, { value: "hybrid", label: "Hybrid" },
        ]} />
      </div>
      <div>
        <Label>Photoperiod or autoflower?</Label>
        <RadioGroup value={f.photo ? "photo" : "auto"} onChange={(v) => up("photo", v === "photo")} options={[
          { value: "photo", label: "Photoperiod" }, { value: "auto", label: "Autoflower" },
        ]} />
      </div>
      <div><Label>Expected flower time</Label><NumStepper value={f.flowerWeeks} onChange={(v) => up("flowerWeeks", v)} min={6} max={16} label="weeks" /></div>
      <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={disabled} onClick={() => onSave(f)} style={btn("primary", disabled)}>
          {saving ? "Adding…" : "Add plant"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify build** → `npm run build` (expected success).

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/components/PlantsTab/AddPlantSheet.jsx
git commit -m "Add AddPlantSheet component"
```

---

### Task 12: PlantDetail component

**Files:**
- Create: `src/components/PlantsTab/PlantDetail.jsx`

**Interfaces:**
- Consumes: `usePlantLog` (Task 8); `MONO`, `SERIF`, `TYPE_LABEL`, `HEALTH_MAP` (Task 7); `LogEntryForm` (Task 10); lucide icons.
- Produces: `<PlantDetail growId plant currentPhaseLabel harvestLabel onClose onArchive onDelete />`. `onArchive(plant)` and `onDelete(plant)` are called with the plant; the parent performs the API call/confirm.

- [ ] **Step 1: Implement**

Create `src/components/PlantsTab/PlantDetail.jsx`:

```jsx
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Archive } from "lucide-react";
import { usePlantLog } from "../../lib/usePlantLog.js";
import { MONO, SERIF, TYPE_LABEL, HEALTH_MAP } from "./constants.js";
import LogEntryForm from "./LogEntryForm.jsx";

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: "var(--c-text-dim)" }}>{value}</div>
    </div>
  );
}

export default function PlantDetail({ growId, plant, currentPhaseLabel, harvestLabel, onClose, onArchive, onDelete }) {
  const { entries, addEntry, removeEntry } = usePlantLog(growId, plant.id, true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(entry) {
    setSaving(true);
    try { await addEntry(entry); setAdding(false); }
    finally { setSaving(false); }
  }

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 }}
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--c-bg)", overflowY: "auto", paddingBottom: 40 }}
    >
      <div style={{ padding: 16, paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
        <button type="button" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={16} /> PLANTS
        </button>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: SERIF, color: "var(--c-text)" }}>{plant.name || "Unnamed plant"}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-muted)", marginTop: 4 }}>
            {TYPE_LABEL[plant.type] ?? plant.type}{plant.photo === false ? " · Auto" : " · Photo"}{plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk flower` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, marginTop: 16 }}>
          <Meta label="Current phase" value={currentPhaseLabel || "—"} />
          <Meta label="Est. harvest" value={harvestLabel || "—"} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>Log</span>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 18, padding: "7px 14px", color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
              <Plus size={13} /> Add entry
            </button>
          )}
        </div>

        {adding && (
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <LogEntryForm onSave={handleSave} onCancel={() => setAdding(false)} saving={saving} />
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "12px 0" }}>No log entries yet.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => {
            const h = e.health ? HEALTH_MAP[e.health] : null;
            return (
              <div key={e.id} style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)" }}>{e.date}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {h && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: h.color, textTransform: "uppercase" }}>{h.label}</span>}
                    {e.height != null && <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-muted)" }}>{e.height}{e.height_unit || ""}</span>}
                    <button type="button" aria-label="delete entry" onClick={() => removeEntry(e.id)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", cursor: "pointer", padding: 0, display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {e.body && <div style={{ fontFamily: SERIF, fontSize: 15, color: "var(--c-text)", marginTop: 8, whiteSpace: "pre-wrap" }}>{e.body}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button type="button" onClick={() => onArchive(plant)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
            <Archive size={14} /> {plant.status === "growing" ? "Archive" : "Unarchive"}
          </button>
          <button type="button" onClick={() => onDelete(plant)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid rgba(248,113,113,0.3)", color: "var(--c-danger-soft)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </motion.div>
  );
}
```

- [ ] **Step 2: Verify build** → `npm run build` (expected success; confirms lucide icons `ArrowLeft`, `Plus`, `Trash2`, `Archive` resolve).

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/components/PlantsTab/PlantDetail.jsx
git commit -m "Add PlantDetail component"
```

---

### Task 13: PlantsTab screen

**Files:**
- Create: `src/components/PlantsTab/PlantsTab.jsx`

**Interfaces:**
- Consumes: `usePlan` from `../../lib/usePlan.jsx`; `useToday` from `../../lib/dates.js`; `getPhase`, `PHASES` from `../../lib/growData.js`; `api` (Task 6); `partitionPlants`, `MONO` (Task 7); `PlantCard` (Task 9); `PlantDetail` (Task 12); `AddPlantSheet` (Task 11); `ConfirmModal` from `../ConfirmModal.jsx`.
- Produces: `<PlantsTab />` (no props; reads context). Fetches the plant-log summary once per active grow for card metrics.

- [ ] **Step 1: Implement**

Create `src/components/PlantsTab/PlantsTab.jsx`:

```jsx
import { useEffect, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToday } from "../../lib/dates.js";
import { getPhase, PHASES } from "../../lib/growData.js";
import { api } from "../../lib/api.js";
import { MONO, partitionPlants } from "./constants.js";
import PlantCard from "./PlantCard.jsx";
import PlantDetail from "./PlantDetail.jsx";
import AddPlantSheet from "./AddPlantSheet.jsx";
import ConfirmModal from "../ConfirmModal.jsx";

const FULL_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtHarvest(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
  return `${FULL_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function EmptyMsg({ text }) {
  return <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "40px 16px", textAlign: "center" }}>{text}</div>;
}

export default function PlantsTab() {
  const { activeGrowId, survey, config, needsSetup, reload } = usePlan();
  const today = useToday();
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [summary, setSummary] = useState({});

  useEffect(() => {
    let cancelled = false;
    if (!activeGrowId) { setSummary({}); return; }
    api.getPlantLogSummary(activeGrowId)
      .then((d) => { if (!cancelled) setSummary(d.summary ?? {}); })
      .catch(() => { if (!cancelled) setSummary({}); });
    return () => { cancelled = true; };
  }, [activeGrowId, survey]);

  if (needsSetup) return <EmptyMsg text="Finish setting up this grow first." />;

  const { active, archived } = partitionPlants(survey);
  const currentPhaseLabel = config ? (PHASES[getPhase(today, config)]?.label ?? null) : null;
  const harvestLabel = fmtHarvest(config?.hazeHarvest) || fmtHarvest(config?.gdpHarvest) || null;
  const selectedPlant = [...active, ...archived].find((p) => p.id === selectedId) || null;

  async function handleAdd(fields) {
    setSaving(true);
    try { await api.addPlant(activeGrowId, fields); setAdding(false); reload(); }
    finally { setSaving(false); }
  }
  async function handleArchive(plant) {
    const next = plant.status === "growing" ? "harvested" : "growing";
    await api.patchPlant(activeGrowId, plant.id, { status: next });
    reload();
  }
  async function handleDelete(plant) {
    await api.deletePlant(activeGrowId, plant.id);
    setConfirmDelete(null);
    setSelectedId(null);
    reload();
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 16px 14px", paddingTop: "calc(18px + env(safe-area-inset-top, 0px))" }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>Plants</div>
        <button type="button" className="touch-target" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "9px 16px", borderRadius: 20, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5, cursor: "pointer" }}>
          <Plus size={14} /> Add plant
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "0 16px" }}>
        {active.length === 0 && <EmptyMsg text="No plants yet. Add your first one." />}
        {active.map((p) => (
          <PlantCard key={p.id} plant={p} currentPhaseLabel={currentPhaseLabel} metrics={summary[p.id]} onOpen={() => setSelectedId(p.id)} />
        ))}

        {archived.length > 0 && (
          <div style={{ marginTop: 8 }}>
            <button type="button" onClick={() => setShowArchived((s) => !s)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer", padding: "6px 0" }}>
              {showArchived ? "▾" : "▸"} Archived ({archived.length})
            </button>
            {showArchived && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8, opacity: 0.7 }}>
                {archived.map((p) => (
                  <PlantCard key={p.id} plant={p} currentPhaseLabel={null} metrics={summary[p.id]} onOpen={() => setSelectedId(p.id)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {adding && (
          <div style={{ position: "fixed", inset: 0, zIndex: 45, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end" }} onClick={() => !saving && setAdding(false)}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: "100%", background: "var(--c-panel-bg)", borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 16 }}>Add a plant</div>
              <AddPlantSheet onSave={handleAdd} onCancel={() => setAdding(false)} saving={saving} />
            </div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedPlant && (
          <PlantDetail
            key={selectedPlant.id}
            growId={activeGrowId}
            plant={selectedPlant}
            currentPhaseLabel={selectedPlant.status === "growing" ? currentPhaseLabel : null}
            harvestLabel={selectedPlant.status === "growing" ? harvestLabel : null}
            onClose={() => setSelectedId(null)}
            onArchive={handleArchive}
            onDelete={(p) => setConfirmDelete(p)}
          />
        )}
      </AnimatePresence>

      <ConfirmModal
        open={!!confirmDelete}
        tone="destructive"
        title="Delete plant?"
        message={confirmDelete ? `This permanently deletes "${confirmDelete.name || "this plant"}" and its entire log.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDelete && handleDelete(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify build** → `npm run build` (expected success).

- [ ] **Step 3: Commit** (hand to user)

```bash
git add src/components/PlantsTab/PlantsTab.jsx
git commit -m "Add PlantsTab screen"
```

---

### Task 14: Wire PLANTS tab into the shell

**Files:**
- Modify: `src/components/TabBar.jsx`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `PlantsTab` (Task 13).

- [ ] **Step 1: Swap the tab in `TabBar.jsx`**

Change the import line:

```jsx
import { CalendarDays, Sprout, Sparkles, ClipboardList, MoreHorizontal } from "lucide-react";
```

Replace the `today` entry in `TABS`:

```jsx
  { id: "plants",   Icon: Sprout,          label: "PLANTS"   },
```

(So the array reads: calendar, plants, mj, plan, more.)

- [ ] **Step 2: Import PlantsTab in `App.jsx`**

After the `import GrowsListTab from "./components/GrowsListTab.jsx";` line, add:

```jsx
import PlantsTab from "./components/PlantsTab/PlantsTab.jsx";
```

- [ ] **Step 3: Replace the `today` branch in `handleTab`**

In `App.jsx`, replace this block:

```jsx
    if (tabId === "today") {
      setActiveTab("today");
      jumpToday();
    } else if (tabId === "mj") {
```

with:

```jsx
    if (tabId === "plants") {
      setSelected(null);
      setActiveTab("plants");
      if (chatOpen) closeChat();
    } else if (tabId === "mj") {
```

- [ ] **Step 4: Add `plants` to `tabKey` and render it**

Replace:

```jsx
  const tabKey = activeTab === "plan" ? "plan" : activeTab === "more" ? "more" : "calendar";
```

with:

```jsx
  const tabKey = activeTab === "plan" ? "plan" : activeTab === "more" ? "more" : activeTab === "plants" ? "plants" : "calendar";
```

Then, inside the tab-content `<AnimatePresence mode="wait">`, add a new branch BEFORE the final `: (` calendar branch. The existing structure is `{tabKey === "more" ? (...) : tabKey === "plan" ? (...) : (...calendar...)}`. Change the `: (` that precedes the calendar `motion.div` into `: tabKey === "plants" ? (` + a plants block + `) : (`, i.e. insert:

```jsx
          ) : tabKey === "plants" ? (
            <motion.div
              key="plants"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <PlantsTab />
            </motion.div>
          ) : (
```

(directly before the `<motion.div key="calendar" ...>` block).

- [ ] **Step 5: Drop `today` from the DayView overlay condition**

Replace:

```jsx
        {(activeTab === "calendar" || activeTab === "today") && selected && (
```

with:

```jsx
        {activeTab === "calendar" && selected && (
```

- [ ] **Step 6: Verify build + lint**

Run: `npm run build` → expected success.
Run: `npm run lint` → expected no new errors. (`Sun` is no longer imported in TabBar; confirm no unused-import lint error remains. `jumpToday` is still used by `pickDay`/`pickMilestone`, so it stays.)

- [ ] **Step 7: Commit** (hand to user)

```bash
git add src/components/TabBar.jsx src/App.jsx
git commit -m "Replace Today tab with Plants tab"
```

---

### Task 15: Full verification + manual smoke test

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `npm test` (i.e. `node --test`)
Expected: all tests pass, including `test/plants-roster.test.js` and `test/plants-ui-helpers.test.js`.

- [ ] **Step 2: Build + lint clean**

Run: `npm run build` → success.
Run: `npm run lint` → no errors.

- [ ] **Step 3: Apply the migration locally (if a local D1 is configured) and run dev**

Run (local only, non-blocking if no local DB): `npx wrangler d1 execute grow-calendar-db --local --file=./migrations/003_plant_log.sql`
Run: `npm run dev` and exercise:
  - Tab bar shows PLANTS (sprout) where TODAY was; calendar today is still reachable by tapping today on the Calendar.
  - PLANTS lists the active grow's existing plants (ids backfilled on first load).
  - Add plant → appears immediately; the calendar/phases are unchanged.
  - Open a plant → add a log entry with notes + height + health → it appears newest-first; health/height badges render; the card shows the latest health and last-log date after returning.
  - Delete a log entry; archive a plant (moves to Archived); delete a plant (ConfirmModal, destructive tone) removes it and its log.

- [ ] **Step 4: Hand off the remote migration command to the user**

Tell the user to run, BEFORE merging/deploying (a merge auto-deploys):

```
npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/003_plant_log.sql
```

- [ ] **Step 5: Final commit** (hand to user, only if any verification fixes were made)

```bash
git add -A
git commit -m "Per-plant tracking: verification fixes"
```

---

## Self-review notes

- **Spec coverage:** Plants-tab-replaces-Today (Task 14), per-plant dated log with height+health (Tasks 5, 8, 10, 12), add plant without AI/calendar change (Tasks 1, 4), edit/archive/delete plant (Tasks 4, 13), stable ids + backfill (Tasks 1, 4), `plant_log` table via migration + lazy DDL (Tasks 3, 4), health enum + colors (Task 7), today-still-reachable-via-calendar (Task 14), photos deferred (not built). All covered.
- **Type consistency:** `plant.id`/`plant.status` set in Task 1 and consumed in Tasks 4/12/13; log columns `height_unit`/`health` produced by `normalizeLogEntry` (Task 2) and consumed in Tasks 5/10/12; `summary[plantId] = { date, height, heightUnit, health }` produced in Task 5 and consumed by `PlantCard.metrics` (Task 9) via Task 13. Consistent.
- **Card metrics:** the spec's "latest height/health, last-logged date" on a card is satisfied via the single `plant-log-summary` endpoint (Task 5), avoiding an N+1 fetch per plant.
- **No placeholders:** every code step contains complete code; commands have expected output.
