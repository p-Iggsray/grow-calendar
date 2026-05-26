# Grow Plan D1 Foundation - Design

Date: 2026-05-25
Status: Approved (design); pending implementation plan
Scope: Sub-project 1 of 2. Sub-project 2 (the MJ assistant) is specced separately and builds on this.

## Goal

Make the grow plan editable and D1-backed without changing any user-visible behavior. Today the plan is a procedural generator hardcoded in the frontend (`src/lib/growData.js`) and hand-duplicated as static text for the AI (`worker/growContext.js`). This sub-project moves the plan's driving inputs into Cloudflare D1 and unifies the generator into a single shared module, so a later sub-project (MJ) can read and edit the plan. When this sub-project is complete, the app must render and behave identically to how it does today.

## Non-goals

- No MJ assistant, no AI tool-calling, no chat changes beyond swapping the AI context source.
- No new visual features, no layout changes.
- No per-user plans. The plan is global (see Key Decisions).
- No Gemini, no model routing. That lives in the MJ sub-project.

## Key decisions

1. **Approach B: shared generator + D1 knobs.** The plan generator stays one pure module imported by both the Vite frontend and the Cloudflare Worker. D1 stores only the knobs (dates + dosing constants) and per-day overrides. The frontend fetches `{config, overrides}` once and runs the generator locally to render, so the rendering path is nearly unchanged and "behaves identically" is easy to verify. Rejected Approach A (move all computation server-side, frontend becomes a dumb renderer) because it is a large rewrite of all five frontend consumers and carries more regression risk for a behavior-preserving refactor.

2. **The plan is global.** It is one grower's 2026 grow. A future second user is a helper viewing the same grow, not running their own. `plan_config` is a single row; `plan_day_overrides` is keyed by date only, not by user. Per-user data (`task_checkoffs`, `day_notes`) is unchanged.

3. **Write endpoints are stubbed now, built in the MJ sub-project.** This sub-project ships only the read path (`GET /api/plan`). Config/override mutation endpoints are designed here but implemented when MJ needs them, to avoid shipping unused endpoints.

4. **Scope refinement during planning (2026-05-25).** Three items below were moved to the MJ sub-project because they are only exercised once the plan can change (the write path, already deferred per decision 3). Doing them in the read-only foundation adds risk and AI-behavior changes for no current benefit:
   - **Dosing extraction.** Foundation `config` holds dates only; dosing stays as inline literals in the generator. `plan_config.config` is a JSON blob, so dosing keys can be added later with no migration.
   - **`buildPlanText` / D1-driven AI context.** `worker/chat.js` and `worker/growContext.js` are untouched in the foundation; the static context stays accurate because the seeded plan equals the hardcoded plan. The worker does not import the generator yet.
   - **Splitting React out of `dates.js`.** Only needed when the worker imports the generator (MJ phase). Foundation keeps `dates.js` as-is.
   See `docs/superpowers/plans/2026-05-25-grow-plan-d1-foundation.md` for the task breakdown.

## Current state (what exists today)

- `src/lib/growData.js` (448 lines): exports `D` (16 driving dates), `PHASES` (colors/labels), `THREATS`, `MILESTONES`, and functions `dpt`, `getNextMilestone`, `getGrowProgress`, `getPhase`, `getThreatsForPhase`, `getDetail`. `getDetail(date)` generates `{title, summary, tasks[], notes}` procedurally from `D` and day-number math, interpolating dates into task text.
- Frontend consumers: `App.jsx`, `Calendar.jsx`, `MilestoneStrip.jsx`, `PhaseLegend.jsx`, `ThreatsReference.jsx` import directly from `growData.js`.
- `worker/growContext.js` (28 lines): a hand-authored static text copy of the plan, injected into the AI system prompt by `worker/chat.js`. Kept in sync manually.
- `worker/index.js`: router. D1 binding is `env.DB`. Existing tables: `users`, `sessions`, `task_checkoffs`, `day_notes`.
- `schema.sql`: D1 schema, applied via `wrangler d1 execute`.

## Architecture

### Shared generator module

Refactor the generator so it no longer closes over the module-level `D` constant. Every function that reads a driving date or dosing value takes a `config` parameter instead:

- `getPhase(date, config)`
- `getDetail(date, config, overrides)` returns `{title, summary, tasks[], notes}` with overrides applied
- `dpt(date, config)`, `getNextMilestone(today, config)`, `getGrowProgress(today, config)`
- `buildMilestones(config)` derives the milestone list from config (replaces the static `MILESTONES` where it references dates)
- `buildPlanText(config, overrides)` renders the full-season AI context string, replacing `worker/growContext.js`

`PHASES` (color hexes, labels) and `THREATS` (static reference copy and phase tags) stay as static exports; they do not depend on dates.

The module must be pure ESM with no DOM, no `import.meta.env`, and no Worker-only APIs, so both Vite and Wrangler/esbuild can bundle it. It may continue to import the pure helpers in `src/lib/dates.js`. Final location to be decided in the implementation plan (a shared path both `src/` and `worker/` import); the constraint is a single source of truth, not its directory.

### Config shape

`config` is the typed object the generator consumes:

- Dates (16): `start`, `transplant`, `calMag`, `feedStart`, `fullDose`, `flush1`, `flush2`, `flush3`, `backyardMove`, `preFlower`, `flowerStart`, `gdpFlush`, `gdpHarvest`, `hazeFlush`, `hazeHarvest`. Stored as ISO `YYYY-MM-DD` strings, parsed to `Date` at the edge of the generator.
- Dosing constants: the nutrient amounts currently inlined in task text (Cal-Mag ml/gal, Big Bloom tbsp/gal, Grow Big tsp/gal, Tiger Bloom tsp/gal, and their half/full/late variants). Enumerated exactly during implementation by extracting every numeric dosing literal from `getDetail`.

The seed values are today's hardcoded constants, so a freshly seeded D1 produces byte-identical output to the current build.

### Override shape

`plan_day_overrides` row per date, JSON payload:

```
{
  "addedTasks":   ["string", ...],   // appended to the generated task list
  "editedTasks":  { "<index>": "string", ... },  // replace generated task at index
  "removedTasks": [<index>, ...],    // drop generated tasks by index
  "note":         "string | null",   // plan-level note for the day (distinct from per-user day_notes)
  "warning":      "string | null"
}
```

Empty/absent override = the day renders exactly as generated. Override application order in `getDetail`: generate base tasks, apply `editedTasks`, drop `removedTasks`, append `addedTasks`. `note`/`warning` attach to the returned detail object.

This `note`/`warning` is plan-level (global, shown to anyone viewing the grow) and is deliberately separate from the existing per-user `day_notes` table, which stays as-is.

## Data model (D1)

```sql
CREATE TABLE IF NOT EXISTS plan_config (
  id          INTEGER PRIMARY KEY CHECK (id = 1),  -- single global row
  config      TEXT NOT NULL,                        -- JSON: dates + dosing
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_day_overrides (
  date        TEXT PRIMARY KEY,   -- YYYY-MM-DD
  payload     TEXT NOT NULL,      -- JSON, shape above
  updated_at  TEXT NOT NULL
);
```

Seeding: an idempotent seed inserts the single `plan_config` row (id=1) with current constants if absent. `plan_day_overrides` starts empty. Seed is safe to run against local and remote D1.

## API surface

- `GET /api/plan` returns `{ config, overrides }`. `config` is the parsed config object; `overrides` is a map of `date -> payload`. Same auth posture as `/api/checkoffs` (authenticated session). If `plan_config` is empty, the worker falls back to the seed defaults so the app never renders an empty plan.
- `PUT /api/plan/config` and override CRUD: designed but not implemented in this sub-project. Stub route entries may be added returning 501, or omitted until MJ. Implementation plan decides which is cleaner.

The AI context for `/api/chat` switches from importing `GROW_CONTEXT` to calling `buildPlanText(config, overrides)` with config/overrides loaded from D1 (falling back to seed defaults).

## Frontend

- New `usePlan()` hook fetches `GET /api/plan` once, exposes `{config, overrides, loading, error}` via a context provider mounted high in the tree (alongside or near `AuthProvider`).
- `App.jsx` calls `getDetail(selected, config, overrides)` and `getPhase(date, config)`, then passes the resulting `detail` down to `DayView` as a prop (DayView itself does not import the generator and needs no change). `Calendar.jsx` calls `getPhase(date, config)`. `MilestoneStrip.jsx`, `PhaseLegend.jsx`, and `ThreatsReference.jsx` switch from importing date-dependent constants/functions to calling them with `config` from context. `PHASES`/`THREATS` static imports can remain.
- `src/lib/api.js` gains `getPlan: () => request("/api/plan")`.
- Loading/error states: while the plan loads, render the existing app shell with a lightweight loading state; on fetch error, surface it the way other API errors are surfaced today.

## Error handling

- Worker: malformed/missing `plan_config` JSON falls back to seed defaults and logs; never 500s the read path.
- Worker: override payloads are validated on read (defensive parse); an unparseable override row is skipped and logged rather than breaking the whole plan.
- Frontend: `usePlan` error does not crash the tree; it shows an error state consistent with existing patterns.

## Testing and verification

- **Golden snapshot:** before refactor, serialize `getDetail(date)` for all 147 days (transplant through haze harvest) to a fixture. After refactor, run the shared generator with the seed config and empty overrides and diff against the fixture. Requirement: byte-identical.
- **Generator unit checks:** phase boundaries on each transition date; override application (add/edit/remove/note/warning) on a sample day; `buildPlanText` contains the same key dates/dosing as today's `growContext.js`.
- **API check:** `GET /api/plan` returns seed config and empty overrides on a fresh DB; returns stored values after a manual override insert.
- **Manual pass:** calendar colors, day view tasks/notes, milestone strip/progress, threats reference, and the AI chat all behave as before, run against local D1 (`wrangler dev` + seeded local DB).

## Migration / deploy steps

1. Add the two tables to `schema.sql`; apply to local D1 (`wrangler d1 execute grow-calendar-db --local --file=./schema.sql`) and, at deploy time, remote (`--remote`).
2. Run the idempotent seed (local, then remote) to insert the `plan_config` row.
3. Deploy worker + frontend together (`npm run deploy`), which the existing GitHub auto-deploy on `main` also performs.

Note: this repo currently has a separate pending remote migration item (the `login_attempts` table from the open rate-limiting PR, and a `day_notes` remote check). Those are unrelated to this sub-project but should be reconciled before the next remote deploy.

## Open items for the implementation plan

- Final shared-module location and how Vite and Wrangler both resolve it.
- Exact enumeration of dosing constants extracted from `getDetail`.
- Whether unused write endpoints are stubbed (501) or omitted this sub-project.
