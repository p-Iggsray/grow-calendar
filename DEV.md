# Developer Notes

Everything you need to run, modify, or self-host **The Grow Calendar**.

## Stack

- Vite + React 18 (frontend SPA)
- Cloudflare Workers (backend `worker/` directory)
- Cloudflare D1 (SQL database for users, sessions, check-offs, daily notes)
- Anthropic API (Claude Haiku 4.5) for the in-app grow assistant
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

The floating "MJ" button opens a chat backed by the Anthropic API. MJ answers questions about the grow AND takes actions on your behalf: checking tasks off and appending to your daily notes. The Worker holds the API key as a secret and never exposes it to the browser.

**Local:** create a gitignored `.dev.vars` file in the project root:

```
ANTHROPIC_API_KEY=sk-ant-...
```

`wrangler dev` reads it automatically. Without it, `/api/mj` returns a friendly "MJ is not configured yet" message.

**Production:** set the secret once, then deploy:

```bash
npx wrangler secret put ANTHROPIC_API_KEY
```

Model: Claude Haiku 4.5 (`claude-haiku-4-5`), non-streaming, via a tool-use loop in `worker/mj.js`. Conversations are ephemeral (in memory, cleared on reload). The system prompt carries a generated season overview (`buildPlanText`, derived live from the D1 plan config) plus today's date. MJ reads per-day specifics on demand with its `get_day` tool and acts with `set_tasks_done` and `append_note` (notes are appended, never overwritten). It touches the `task_checkoffs`, `day_notes`, and `plan_config`/`plan_day_overrides` tables, which must exist in the target environment before deploying.

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

Creates `users`, `sessions`, and `task_checkoffs` tables on the production D1 database.

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

## Account management

The **Create Account** UI was removed after the initial user signed up. The backend `signup` endpoint still exists but auto-rejects with 403 once any user row exists.

**Wipe and reset:**
```bash
npx wrangler d1 execute grow-calendar-db --remote --command="DELETE FROM users; DELETE FROM sessions; DELETE FROM task_checkoffs; DELETE FROM day_notes;"
```

After running this, you'd need to temporarily re-add the signup UI to bootstrap a new account, then remove it again.

## Project layout

```
src/                              Frontend (React)
  main.jsx                        Entry. AuthProvider + Root → LoginGate or App.
  App.jsx                         Authenticated app shell.
  styles.css                      Responsive layout breakpoints + scrollbar styling.
  lib/
    dates.js                      TODAY, sameDay, daysBetween, formatters.
    growData.js                   Phase dates, PHASES, THREATS, MILESTONES, getPhase, getDetail.
    api.js                        fetch wrappers for /api/*.
    auth.jsx                      AuthProvider context + useAuth hook.
    useCheckoffs.js               Per-day check-off state hook with focus refetch.
    useDayNote.js                 Per-day note state hook with debounced autosave.
  components/
    Header.jsx, MilestoneStrip.jsx, Calendar.jsx, PhaseLegend.jsx, DayView.jsx,
    ChatPanel.jsx, ThreatsReference.jsx, LoginGate.jsx, AuthFooter.jsx

worker/                           Backend (Cloudflare Worker)
  index.js                        Router. /api/* hits worker, everything else serves assets.
  auth.js                         Signup, login, logout, me, PBKDF2 hashing, session cookies.
  checkoffs.js                    GET/PUT /api/checkoffs/:date + readCheckoffs/writeCheckoffs helpers.
  notes.js                        GET/PUT /api/notes/:date + readNote/writeNote helpers.
  plan.js                         GET /api/plan + loadRawPlan helper.
  mj.js                           POST /api/mj - MJ's Anthropic tool-use loop and tool executor.
  mj-logic.js                     Pure MJ helpers (merge checkoffs, append note, day view) + tool schemas.
  util.js                         JSON helpers, cookie helpers.

public/
  icon.svg                        App icon (PWA, favicon, apple-touch-icon).
  manifest.webmanifest            PWA manifest.
assets/
  banner.svg                      Animated README hero banner.
  divider.svg                     Animated README section divider.

schema.sql                        D1 schema. Apply with wrangler d1 execute.
wrangler.jsonc                    Worker + D1 + assets config.
launch.bat                        Windows one-click dev launcher.
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
- [x] In-app AI grow assistant (Claude Haiku 4.5)
- [ ] Structured grow log (pH, water, feed, temp, humidity)
- [ ] Photo uploads via R2
- [ ] In-app SVG icon replacements for all emojis

## Production build (manual)

```bash
npm run build      # produces dist/
npm run preview    # local preview of the built bundle (frontend only, no Worker)
```

`npm run deploy` does build + wrangler deploy together. The CF auto-deploy runs this command on every push to `main`.
