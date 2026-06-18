# Per-Plant Tracking + Plants Tab — Design

Date: 2026-06-17
Status: Approved (design), pending implementation plan

## Goal

Replace the `TODAY` tab with a `PLANTS` tab that lists the active grow's plants and lets
the grower:

1. Check on each plant individually (a per-plant detail screen with its own dated log).
2. Add more plants to a grow.
3. Edit and archive plants.

Per-plant **photos are explicitly out of scope for this phase** (Phase 2 — requires R2
infrastructure that does not yet exist). This spec covers a **text + metrics** per-plant
log only.

## Decisions (locked)

- **Data model: Approach A** — extend the existing `survey.strains[]` roster with stable
  IDs and add one new `plant_log` table. The roster stays the single source of truth for
  "which plants are in this grow," so AI plan generation, the Header strain summary, and the
  Grows list keep working unchanged. (Rejected: a dedicated `plants` table, which would create
  two competing rosters and a sync hazard.)
- **Adding a plant does NOT touch the calendar/plan.** No AI generation is triggered on add.
  The plant is added to the roster and immediately gets its own log. The existing calendar,
  phases, and tasks are unchanged. The user can still manually regenerate the plan later.
- **Photos deferred to Phase 2.**
- **`PLANTS` replaces `TODAY` in the tab bar.** Today's daily log remains reachable by tapping
  today on the Calendar, so no functionality is lost.

## Data model

### Roster (existing `survey.strains[]`, extended)

Each strain entry currently has: `name`, `type` (`indica|sativa|hybrid`), `photo` (bool,
photoperiod vs autoflower), `flowerWeeks` (number).

Add two fields:

- `id` — stable plant identifier, format `p_<random>`. **Backfilled automatically** for
  existing grows: a helper `ensurePlantIds(survey)` assigns IDs to any entry missing one and
  persists the survey if it mutated. Runs in the grow read path (`getGrow` / `loadRawGrow`) so
  the client always receives IDs, and defensively inside every plant endpoint.
- `status` — `growing | harvested | dead`, default `growing`. Drives the Archived section.

`plant_id` used by `plant_log` rows = this `id`. IDs are never reused; deleting a plant
removes its roster entry and cascades to its log rows in code.

**Current height/health are NOT stored on the roster entry.** They are derived from the
plant's most recent log entry that carries those fields. Single source of truth, no drift.

### New table: `plant_log`

```sql
CREATE TABLE IF NOT EXISTS plant_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL,
  grow_id     TEXT NOT NULL,
  plant_id    TEXT NOT NULL,
  date        TEXT NOT NULL,            -- YYYY-MM-DD
  body        TEXT NOT NULL DEFAULT '',
  height      REAL,                     -- nullable
  height_unit TEXT,                     -- 'in' | 'cm', nullable
  health      TEXT,                     -- 'thriving'|'healthy'|'stressed'|'sick', nullable
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_plant_log
  ON plant_log(user_id, grow_id, plant_id, date DESC);
```

`grow_id` is included (not just `plant_id`) so all queries are scoped by `(user_id, grow_id,
plant_id)`, consistent with every other per-grow table, and so deleting a grow's data is a
simple scoped delete.

### Health values

`thriving | healthy | stressed | sick`, color-coded green → amber → red using existing CSS
tokens (`--c-accent`, `--c-text-dim`, `--c-warn`, `--c-danger`). Defined once in a
`src/components/PlantsTab/constants.js`.

## Backend

New file `worker/plants.js`, routed from `worker/index.js` alongside the existing
`/api/grows/...` routes. All handlers verify the grow belongs to the authenticated user
(same pattern as `grows.js`). Roster mutations read/modify/write the grow's `survey` JSON;
log mutations hit `plant_log`.

Schema is provisioned **two ways** for safety, matching the existing `ensureMigrated`
convention in `grows.js`:

1. A migration file `migrations/003_plant_log.sql` (run remotely before/at merge).
2. A lazy `CREATE TABLE IF NOT EXISTS plant_log (...)` + index inside `worker/plants.js`,
   invoked on first use so the route self-heals if the migration has not run yet.

### Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/grows/:id/plants` | Add a plant. Body `{name, type, photo, flowerWeeks}`. Appends to `survey.strains` with a new `id`, `status:"growing"`. **No AI call.** Returns the new plant. |
| PATCH | `/api/grows/:id/plants/:plantId` | Edit roster fields (`name`, `type`, `photo`, `flowerWeeks`) and/or `status` (archive = set `harvested`/`dead`). |
| DELETE | `/api/grows/:id/plants/:plantId` | Remove the plant from the roster **and** delete its `plant_log` rows. |
| GET | `/api/grows/:id/plants/:plantId/log` | List the plant's log entries, `date DESC`. |
| POST | `/api/grows/:id/plants/:plantId/log` | Add an entry. Body `{date, body, height?, heightUnit?, health?}`. Defaults `date` to today. |
| PATCH | `/api/grows/:id/plants/:plantId/log/:entryId` | Edit an entry. |
| DELETE | `/api/grows/:id/plants/:plantId/log/:entryId` | Delete an entry. |

Input validation mirrors existing routes: `safeJsonBounded`, date regex `^\d{4}-\d{2}-\d{2}$`,
`type` restricted to the three allowed values, `health` restricted to the four allowed values,
`status` restricted to `growing|harvested|dead`, text length caps on `name`/`body`.

`api.js` (client) gains matching methods: `addPlant`, `patchPlant`, `deletePlant`,
`getPlantLog`, `addPlantLogEntry`, `patchPlantLogEntry`, `deletePlantLogEntry`.

## Frontend

### Tab bar (`src/components/TabBar.jsx`)

Replace `{ id: "today", Icon: Sun, label: "TODAY" }` with
`{ id: "plants", Icon: Sprout, label: "PLANTS" }` (lucide `Sprout`).

### App wiring (`src/App.jsx`)

- `handleTab`: remove the `"today"` branch (and its `jumpToday()` shortcut behavior);
  add a `"plants"` branch that sets `activeTab="plants"`, clears `selected`, and closes chat.
- Add a `"plants"` branch to the tab-content `AnimatePresence` (`tabKey`) that renders
  `<PlantsTab>`, crossfading like the other tabs.
- The DayView overlay condition `activeTab === "calendar" || activeTab === "today"` drops
  `"today"` (now just `"calendar"`).
- Plant selection state (which plant's detail is open) lives **inside `PlantsTab`**, not App,
  to keep App lean.

### Components (new, under `src/components/PlantsTab/`)

- **`PlantsTab.jsx`** — roster of the active grow. Reads `survey.strains` + `config` from
  `usePlan()`. Renders:
  - A header (`PLANTS`) + **+ Add plant** button (styled like the Grows list header).
  - One `PlantCard` per `growing` plant.
  - A collapsed **Archived** section for `harvested`/`dead` plants (log preserved).
  - Empty state when the grow has no plants yet.
  - Owns `selectedPlantId` and renders `PlantDetail` as a slide-up overlay.
- **`PlantCard.jsx`** — name, strain type, the grow's current phase, latest height/health
  badge, last-logged date.
- **`PlantDetail.jsx`** — slide-up overlay (same motion as `DayView`): plant header
  (name/type/flower length), the grow's shared current phase + est. harvest, then the log
  timeline with an inline **add-entry** affordance and per-plant **edit / archive / delete**.
- **`AddPlantSheet.jsx`** — add-plant form reusing wizard field components from
  `SetupWizard/styleHelpers.jsx` (`Label`, `Input`, `RadioGroup`, `NumStepper`).
- **`LogEntryForm.jsx`** — add/edit a log entry (date, body, optional height+unit, optional
  health). Reuses the same field components.
- **`constants.js`** — health enum + color map, shared label/style helpers.

### Hooks / lib

- **`src/lib/usePlantLog.js`** — fetch + mutate a single plant's log (`getPlantLog`,
  add/edit/delete with optimistic-ish refetch). Mirrors the shape of existing hooks like
  `useDayNote` / `useGrowLog`.
- Roster changes (add/edit/archive/delete plant) call the existing `usePlan().reload()` to
  refresh `survey` after the mutation.

## Data flow

1. `usePlan` already loads the active grow's `survey` (with `strains`) and `config`.
   After `ensurePlantIds` runs server-side, every strain entry the client sees has an `id`.
2. `PlantsTab` renders the roster directly from `survey.strains`, partitioned by `status`.
3. Opening a plant → `usePlantLog(growId, plantId)` fetches that plant's `plant_log` rows.
4. Adding/editing a log entry → POST/PATCH → refetch that plant's log.
5. Adding/editing/archiving/deleting a plant → roster endpoint → `usePlan().reload()`.

## Edge cases

- **Grow not set up yet** (`needsSetup`, no `config`/`survey`): App shows the wizard, not the
  Plants tab, so this path is unreachable from `PlantsTab`. `PlantsTab` still guards against a
  null/empty `survey` with an empty state.
- **Empty roster:** empty state with a prominent **+ Add plant**.
- **Missing IDs on legacy grows:** `ensurePlantIds` backfills and persists on read.
- **Delete plant:** removes the roster entry and cascades to delete `plant_log` rows for that
  `plant_id`; UI confirms first (reuse `ConfirmModal`).
- **Archived plants:** hidden from the main list, shown in the collapsed Archived section;
  their log is preserved and still viewable.
- **Per-plant phase/harvest are grow-level (shared) values** by design — we are not building
  per-plant timelines. Each plant still shows its own strain type and flower-week length.

## Out of scope (this phase)

- Photos / any R2 media (Phase 2: provision bucket, upload + serve routes, capture UI).
- Per-plant phase timelines or per-plant harvest math.
- Triggering AI plan regeneration on plant add.

## Affected / new files

**New**
- `migrations/003_plant_log.sql`
- `worker/plants.js`
- `src/components/PlantsTab/PlantsTab.jsx`
- `src/components/PlantsTab/PlantCard.jsx`
- `src/components/PlantsTab/PlantDetail.jsx`
- `src/components/PlantsTab/AddPlantSheet.jsx`
- `src/components/PlantsTab/LogEntryForm.jsx`
- `src/components/PlantsTab/constants.js`
- `src/lib/usePlantLog.js`

**Modified**
- `worker/index.js` (route the new endpoints)
- `worker/grows.js` (call `ensurePlantIds` in the grow read path; export shared helpers if needed)
- `src/lib/api.js` (client methods)
- `src/components/TabBar.jsx` (TODAY → PLANTS)
- `src/App.jsx` (tab handling + render PlantsTab; drop `today` branches)
- `schema.sql` (document the new `plant_log` table)

## Deployment notes

- Run the remote D1 migration **before/at merge** (a PR merge auto-deploys):
  `npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/003_plant_log.sql`
  (User runs this — deploys/remote-mutations are never run by the assistant.)
- The lazy `CREATE TABLE IF NOT EXISTS` in `worker/plants.js` is a safety net if the migration
  is missed.
