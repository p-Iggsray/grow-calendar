# Grow Calendar

A personal grow calendar for the 2026 outdoor season (1× Grandaddy Purp, 2× Strawberry Haze, Athens OH). Cross-device sync via Cloudflare Workers + D1.

## Stack

- Vite + React 18 (frontend SPA)
- Cloudflare Workers (backend, `worker/` directory)
- Cloudflare D1 (SQL database)
- Wrangler 4 (deploy tooling)

## Local dev

```bash
npm install
npm run dev
```

Frontend dev only (Vite). API calls will 404 locally unless you also run `npx wrangler dev` in a second terminal.

Or double-click `launch.bat` from File Explorer.

## First-time Cloudflare setup

Follow these in order. You only do this once.

### 1. Authenticate wrangler

```bash
npx wrangler login
```

This opens a browser to authorize your Cloudflare account.

### 2. Create the D1 database

```bash
npx wrangler d1 create grow-calendar-db
```

Wrangler prints a `database_id` (a UUID). Copy it.

### 3. Paste the database_id into wrangler.jsonc

Open `wrangler.jsonc` and replace `REPLACE_WITH_DB_ID_FROM_WRANGLER_D1_CREATE` with the UUID from step 2.

### 4. Create the database tables

```bash
npx wrangler d1 execute grow-calendar-db --remote --file=./schema.sql
```

This creates the `users`, `sessions`, and `task_checkoffs` tables on the production D1 database. Run it once.

### 5. Deploy

```bash
npm run deploy
```

This runs `vite build` then `wrangler deploy`. Wrangler prints your live URL (something like `https://grow-calendar.<your-subdomain>.workers.dev`).

### 6. Connect Cloudflare to GitHub for auto-deploy

In the Cloudflare dashboard, find your `grow-calendar` Worker, go to **Settings > Builds > Build configuration**, and:

- Repository: connect to `p-Iggsray/grow-calendar`
- Build command: leave blank (or `npm install`)
- Deploy command: `npm run deploy`
- Root directory: leave blank

Every push to `main` now redeploys automatically.

## Account management

- The **Create Account** button is visible only when zero users exist in the database.
- After you create your account, signup auto-closes.
- To reopen signup later (e.g., to add another user):
  ```bash
  npx wrangler d1 execute grow-calendar-db --remote --command="DELETE FROM users WHERE id = 999"
  ```
  (or any operation that drops the user count to 0). A cleaner option:
  ```bash
  # Add a temp account directly via SQL, or implement an admin endpoint later
  ```
- To wipe your own account and start over:
  ```bash
  npx wrangler d1 execute grow-calendar-db --remote --command="DELETE FROM users; DELETE FROM sessions; DELETE FROM task_checkoffs;"
  ```

## Project layout

```
src/                       Frontend (React)
  main.jsx                 Entry. AuthProvider + Root → LoginGate or App.
  App.jsx                  Authenticated app shell.
  lib/
    dates.js               TODAY, sameDay, daysBetween, formatters.
    growData.js            D dates, PHASES, THREATS, MILESTONES, getPhase, getDetail.
    api.js                 fetch wrappers for /api/*.
    auth.jsx               AuthProvider context + useAuth hook.
    useCheckoffs.js        Per-day check-off state hook with focus refetch.
  components/
    Header.jsx, MilestoneStrip.jsx, Calendar.jsx, PhaseLegend.jsx,
    DetailPanel.jsx, ThreatsReference.jsx, LoginGate.jsx, AuthFooter.jsx

worker/                    Backend (Cloudflare Worker)
  index.js                 Router. /api/* hits worker, everything else serves assets.
  auth.js                  Signup, login, logout, me, PBKDF2 hashing, session cookies.
  checkoffs.js             GET/PUT /api/checkoffs/:date.
  util.js                  JSON helpers, cookie helpers.

schema.sql                 D1 schema. Apply with wrangler d1 execute.
wrangler.jsonc             Worker + D1 + assets config.
launch.bat                 Windows one-click dev launcher.
```

## How sync works

- Each device opens the app, sees the login screen, signs in. The session cookie is set HttpOnly + Secure on the device.
- Check off a task → frontend PUTs `/api/checkoffs/2026-05-23` with the full list of checked indexes for that day → D1 row updated.
- Open the app on another device or refocus the tab → `useCheckoffs` refetches → latest state appears.
- "Sync on focus" not WebSockets, so if both devices are open simultaneously and you click on phone, the laptop sees it the next time the tab regains focus.

## Roadmap

Steps completed: scaffold, deploy pipeline, auth, task check-off sync.

Next:
- Daily notes / journal (per-day free text)
- Structured grow log (pH, water, feed, temp, humidity)
- Photo uploads via R2

## Production build (manual)

```bash
npm run build       # produces dist/
npm run preview     # local preview of the built bundle (frontend only)
```

`npm run deploy` does the build + wrangler deploy together. CI / Cloudflare auto-deploy uses this command.
