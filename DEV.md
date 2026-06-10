# Developer Notes

Everything you need to run, modify, or self-host **The Grow Calendar**.

## Stack

- Vite + React 18 (frontend SPA)
- Cloudflare Workers (backend `worker/` directory)
- Cloudflare D1 (SQL database for users, sessions, check-offs, daily notes)
- Google Gemini (`gemini-2.5-flash`, free tier) for the MJ assistant (all users)
- Wrangler 4 (deploy tooling)
- Pure CSS media queries for responsive layout (no UI framework)

## Local development

```bash
npm install
npm run dev
```

Or just double-click `launch.bat` on Windows. It installs dependencies if needed, ensures the local database tables exist, then opens two windows (the Cloudflare Worker on :8787 and the Vite dev server) and points your browser at http://localhost:5173. Easiest way to run the full stack locally.

`npm run dev` alone is frontend-only (Vite). For a full local stack (frontend + API + local D1), run two terminals:

```bash
npm run dev        # terminal 1: Vite on http://localhost:5173 (hot reload)
npx wrangler dev   # terminal 2: Worker + miniflare D1 on http://localhost:8787
```

Open http://localhost:5173. Vite proxies `/api/*` to the Worker on port 8787 (see `vite.config.js`), so login and check-off/notes sync work against the local D1. Running `npm run dev` without the Worker makes every `/api/*` call return 404.

First time only, create the local D1 tables:

```bash
npx wrangler d1 execute grow-calendar-db --local --file=./schema.sql
```

### Logging in locally

The local database is separate from production and has its own accounts. A test account already exists locally:

- Username: `test`
- Password: `testpass123`

Sign in with those at http://localhost:5173 (launch.bat) or http://localhost:8787 (wrangler dev only).

If your local database is fresh and has no accounts yet, create one once via the signup endpoint (it only works while no user exists):

```bash
curl.exe http://localhost:8787/api/auth/signup -X POST -H "content-type: application/json" -d "{\"username\":\"test\",\"password\":\"testpass123\"}"
```

Your real production login is different and lives in the remote database.

## MJ (AI grow assistant)

The floating "MJ" button opens a chat backed by Google Gemini 2.5 Flash. MJ answers questions about the grow AND takes actions on your behalf: checking tasks off and appending to your daily notes. The Worker holds the API key as a secret and never exposes it to the browser.

### Model

All users hit `gemini-2.5-flash` via the free-tier Generative Language API, using the single shared `GEMINI_API_KEY` secret. If the key is missing, `/api/mj` returns a friendly "MJ is not configured yet" message.

### Usage tracking and the in-chat usage bar

There is no per-user daily cap. Instead, each call increments the `mj_usage` D1 table and the MJ chat header shows a small usage bar that reflects today's aggregate request count against `GEMINI_DAILY_LIMIT` (defined in `worker/mj.js`, currently `1500` — the documented Gemini API free-tier RPD for `gemini-2.5-flash`). Bump the constant if Google changes the limit.

The bar is fed by:

- `GET /api/mj/usage` (called when the chat opens) returning `{ date, count, limit }`
- The `usage` field on each `POST /api/mj` response (refreshes the bar after every send)

If Gemini's own free-tier quota is exhausted at Google's end, MJ returns a "hit today's limit, try again later" message instead of an error.

### Local setup

Create a gitignored `.dev.vars` file in the project root:

```
GEMINI_API_KEY=...
```

`wrangler dev` reads it automatically.

### Production setup

Set the secret once, then deploy:

```bash
npx wrangler secret put GEMINI_API_KEY
```

### How MJ works

Non-streaming, via a tool-use loop in `worker/mj.js`. Conversations are ephemeral (in memory, cleared on reload). The system prompt carries a generated season overview (`buildPlanText`, derived live from the D1 plan config) plus today's date. MJ reads per-day specifics on demand with its `get_day` tool and acts with `set_tasks_done` and `append_note` (notes are appended, never overwritten). It touches the `task_checkoffs`, `day_notes`, `plan_config`/`plan_day_overrides`, and `mj_usage` tables, which must exist in the target environment before deploying.

## First-time Cloudflare setup

You only do this once per environment. All commands run from the project root.

### 1. Authenticate wrangler

```bash
npx wrangler login
```

Opens a browser to authorize your Cloudflare account.

### 2. Create the D1 database

```bash
npx wrangler d1 create grow-calendar-db
```

Wrangler prints a `database_id` (a UUID). Copy it.

### 3. Paste the database_id into `wrangler.jsonc`

Open `wrangler.jsonc` and replace `REPLACE_WITH_DB_ID_FROM_WRANGLER_D1_CREATE` with the UUID from step 2.

### 4. Apply the schema

```bash
npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql
```

Creates all current tables on the production D1 database (`users`, `sessions`, `login_attempts`, `task_checkoffs`, `day_notes`, `plan_config`, `plan_day_overrides`, `mj_usage`).

### 5. Deploy

```bash
npm run deploy
```

Runs `vite build` then `wrangler deploy`. Wrangler prints your live URL.

### 6. Connect Cloudflare to GitHub for auto-deploy

In the Cloudflare dashboard, find your `grow-calendar` Worker, go to **Settings > Builds > Build configuration**, and:

- Repository: connect to your GitHub repo
- Build command: leave blank (or `npm install`)
- Deploy command: `npm run deploy`
- Root directory: leave blank

Every push to `main` redeploys automatically.

## Database migrations

**Fresh environment:** apply `schema.sql` once to create all current tables:

```bash
# local
npx wrangler d1 execute grow-calendar-db --local --file=./schema.sql
# remote production
npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql
```

**Existing database (upgrading):** apply numbered files in `migrations/` in order. Each file is a one-time migration - not re-runnable. Take a remote backup before applying to production:

```bash
npx wrangler d1 export grow-calendar-db --remote --output=./backup-before-migration.sql
```

Then apply:

```bash
# local
npx wrangler d1 execute grow-calendar-db --local --file=./migrations/0001_multi_tenant.sql
# remote production
npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/0001_multi_tenant.sql
```

`0001_multi_tenant.sql` adds `role` and `status` to `users`, makes `plan_config` and `plan_day_overrides` per-user (keyed by `user_id`), adds the `mj_usage` table, and promotes the original owner (lowest `user_id`) to `role='admin'`, `status='approved'`.

**Note on `login_attempts`:** This table was originally added to existing databases via a one-off root-level SQL file (applied in production before the migrations/ system existed; the file has since been deleted). It is now included directly in `schema.sql` so fresh environments get it automatically. Existing databases already have it.

## Account management

Self-signup is open. Anyone who reaches the login screen can click **Request an account** to submit a signup. New accounts are created in a `pending` state immediately.

Pending users can log in, but they only see a "waiting for approval" holding screen. They have no access to the app or any API endpoints until an admin approves them.

The **admin** (owner) is the user with `role='admin'` - the original/first user, promoted automatically by the migration. Admins see a **MEMBERS** button in the app header that opens an in-app panel listing pending requests and existing members. From there the admin can:

- **Approve** a pending request (grants full access)
- **Reject** a pending request (permanently deletes that user and all their data)
- **Remove** an existing member (permanently deletes that user and all their data)

Reject and Remove both cascade: the user row deletion cascades through sessions, task_checkoffs, day_notes, plan_config, plan_day_overrides, and mj_usage.

Each user has a fully isolated grow: their own plan config, per-day overrides, check-offs, notes, and MJ usage. When a new user is approved and first loads the app, the backend auto-seeds them a copy of the default plan.

**Wipe and reset:**
```bash
npx wrangler d1 execute grow-calendar-db --remote --command="DELETE FROM users; DELETE FROM sessions; DELETE FROM login_attempts; DELETE FROM task_checkoffs; DELETE FROM day_notes; DELETE FROM plan_config; DELETE FROM plan_day_overrides; DELETE FROM mj_usage;"
```

After wiping, re-seed the first admin manually:

```bash
# 1. Sign up via the login screen to create the user row
# 2. Promote that user to admin in D1
npx wrangler d1 execute grow-calendar-db --remote --command="UPDATE users SET role='admin', status='approved' WHERE id=(SELECT MIN(id) FROM users);"
```

## Project layout

```
src/                              Frontend (React)
  main.jsx                        Entry. AuthProvider + Root → LoginGate or App.
  App.jsx                         Authenticated app shell. Lazy-loads heavy panels (chat, wizard, admin, stats, map).
  styles.css                      Responsive layout breakpoints + scrollbar styling.
  lib/
    dates-core.js / dates.js      Pure date helpers; dates.js adds the useToday hook.
    growData.js                   Barrel for lib/growdata/ — PHASES, THREATS, getPhase, getDetail, milestones.
    growdata/                     Plan engine modules: phases, threats, phase math, milestones, detail generator.
    api.js                        fetch wrappers for /api/*.
    auth.jsx                      AuthProvider context + useAuth hook.
    use*.js                       Per-concern data hooks (checkoffs, notes, plan, stats, weather, theme, ...).
  components/
    ChatPanel/                    MJ chat: panel shell, bubbles, thread strip, usage bar, helpers.
    DayView/                      Day overlay: task rows, state picker, edit sheets, log entries, weather card.
    SetupWizard/                  New-grow wizard: one file per step + shared controls.
    Header.jsx, Calendar.jsx, MilestoneStrip.jsx, TabBar.jsx, MoreScreen.jsx,
    GrowsListTab.jsx, MjReviewPanel.jsx, AdminPanel.jsx, StatsScreen.jsx,
    GardenMap.jsx, BuddyView.jsx, ShareSheet.jsx, LoginGate.jsx, ...

worker/                           Backend (Cloudflare Worker)
  index.js                        Router. /api/* hits worker, everything else serves assets.
  auth.js / authReset.js          Signup, login, sessions, PBKDF2 hashing, admin reset links.
  checkoffs.js, notes.js,         One module per resource: GET/PUT handlers + helpers.
  growLog.js, grows.js, plan.js,
  planSetup.js, stats.js, share.js
  mj.js                           Barrel for worker/mj/ — POST /api/mj, usage, history, undo.
  mj/                             MJ modules: chat handler, context builders, tool executor, usage, history, undo.
  mj-logic.js                     Pure MJ helpers (merge checkoffs, append note, day view) + tool schemas.
  providers/gemini.js             Gemini API adapter (request shaping, SSE parsing).
  util.js                         JSON helpers, cookie helpers, bounded JSON body reader.

public/
  icon.svg                        App icon (PWA, favicon, apple-touch-icon).
  manifest.webmanifest            PWA manifest.
  sw.js                           Service worker: runtime caching + push notifications.
assets/
  banner.svg                      Animated README hero banner.
  divider.svg                     Animated README section divider.

schema.sql                        D1 schema for fresh environments. Apply with wrangler d1 execute.
migrations/                       One-time numbered migrations for existing databases.
wrangler.jsonc                    Worker + D1 + assets config.
launch.bat / launch.sh            One-click local dev launchers (Windows / WSL).
```

## How sync works

- Each device signs in. Session cookie is set HttpOnly + Secure on the device.
- Check off a task → frontend PUTs `/api/checkoffs/YYYY-MM-DD` with the full list of checked indexes for that day → D1 upserts.
- Open the app on another device or refocus the tab → `useCheckoffs` refetches → latest state appears.
- "Sync on focus", not WebSockets. If both devices are open simultaneously and you click on phone, the laptop sees it the next time the tab regains focus.

## Auth model

- PBKDF2 with SHA-256, 100,000 iterations, 16-byte salt
- Salt + hash stored base64 in `users` table
- Session token: 32 random bytes, base64url-encoded, stored in `sessions` table with 30-day TTL
- Cookie: `HttpOnly`, `Secure` (in HTTPS), `SameSite=Lax`, 30-day Max-Age
- No third-party auth dependencies

## Roadmap

- [x] Scaffold + Cloudflare deploy pipeline
- [x] Passcode-style auth (later swapped for username/password)
- [x] Task check-off sync (D1)
- [x] Responsive layout (phone / tablet / desktop)
- [x] PWA manifest + custom icon
- [x] Daily notes / journal
- [x] Full-screen day view (tasks, notes, threats)
- [x] In-app AI grow assistant (Gemini 2.5 Flash free tier, shared key, usage bar in chat)
- [ ] Structured grow log (pH, water, feed, temp, humidity)
- [ ] Photo uploads via R2
- [ ] In-app SVG icon replacements for all emojis

## Production build (manual)

```bash
npm run build      # produces dist/
npm run preview    # local preview of the built bundle (frontend only, no Worker)
```

`npm run deploy` does build + wrangler deploy together. The CF auto-deploy runs this command on every push to `main`.
