# Developer Notes

Everything you need to run, modify, or self-host **The Grow Calendar**.

## Stack

- Vite + React 18 (frontend SPA)
- Cloudflare Workers (backend `worker/` directory)
- Cloudflare D1 (SQL database for users, sessions, check-offs)
- Wrangler 4 (deploy tooling)
- Pure CSS media queries for responsive layout (no UI framework)

## Local development

```bash
npm install
npm run dev
```

Or double-click `launch.bat` from File Explorer on Windows.

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
npx wrangler d1 execute grow-calendar-db --remote --command="DELETE FROM users; DELETE FROM sessions; DELETE FROM task_checkoffs;"
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
    Header.jsx, MilestoneStrip.jsx, Calendar.jsx, PhaseLegend.jsx,
    DayView.jsx, ThreatsReference.jsx, LoginGate.jsx, AuthFooter.jsx

worker/                           Backend (Cloudflare Worker)
  index.js                        Router. /api/* hits worker, everything else serves assets.
  auth.js                         Signup, login, logout, me, PBKDF2 hashing, session cookies.
  checkoffs.js                    GET/PUT /api/checkoffs/:date.
  notes.js                        GET/PUT /api/notes/:date.
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
- [ ] Structured grow log (pH, water, feed, temp, humidity)
- [ ] Photo uploads via R2
- [ ] In-app SVG icon replacements for all emojis

## Production build (manual)

```bash
npm run build      # produces dist/
npm run preview    # local preview of the built bundle (frontend only, no Worker)
```

`npm run deploy` does build + wrangler deploy together. The CF auto-deploy runs this command on every push to `main`.
