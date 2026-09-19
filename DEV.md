# Developer Notes

Everything you need to run, modify, or self-host **Black Cat Botanicals**.

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

The two commands above run a frontend-only or local-DB stack (see below). To instead run the **exact deployed build against the real production database**, use `./launch.sh`. It installs dependencies if needed, checks your Cloudflare login, builds the production bundle, runs the Worker via `wrangler dev --remote`, and opens your browser at http://localhost:8787. WARNING: this writes to live production data with no undo.

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

Sign in with those at http://localhost:5173 (`npm run dev`) or http://localhost:8787 (`npx wrangler dev`). Note: `launch.sh` uses the remote production database, not this local one.

If your local database is fresh and has no accounts yet, create one once via the signup endpoint (it only works while no user exists):

```bash
curl.exe http://localhost:8787/api/auth/signup -X POST -H "content-type: application/json" -d "{\"username\":\"test\",\"password\":\"testpass123\"}"
```

Your real production login is different and lives in the remote database.

## MJ (AI grow assistant)

The floating "MJ" button opens a chat backed by Google Gemini 2.5. MJ answers
questions about the grow AND acts on it: writing the journal, logging water and
conditions, managing the plant roster, editing the grow profile and driving the
post-harvest lifecycle. The Worker holds the API key as a secret and never
exposes it to the browser.

### Model

Everyone hits `gemini-2.5-flash` via the free-tier Generative Language API,
using the single shared `GEMINI_API_KEY` secret. Admins get `gemini-2.5-pro`
first with Flash behind it (see **Failing safely** for when that fallback is
allowed to run). If the key is missing, `/api/mj` returns a friendly "MJ is not
configured yet" message.

`CF_AI_GATEWAY_URL`, when set, routes calls through a Cloudflare AI Gateway
instead of straight to Google.

### The in-chat usage bar

The MJ chat header shows today's counts. It is fed by:

- `GET /api/mj/usage` when the chat opens
- the `usage` field on the final SSE frame of each `POST /api/mj`

Both return `{ date, proCount, proLimit, flashCount, flashLimit, userCount,
userLimit }`. See **Quota, and what actually counts** below for what those
numbers now mean, because the flash count went up when it started counting
honestly.

If Gemini's own quota is exhausted at Google's end, MJ says she has hit today's
limit rather than reporting an error.

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

Streaming (SSE), via a tool-calling loop in `worker/mj/`. `chat.js` validates
the request, enforces quota, assembles context and runs the loop;
`providers/gemini.js` is the Gemini adapter; `mj-logic.js` holds the persona,
the crop briefs and the tool schemas as pure data.

Conversations are **persisted**, in `mj_conversations`, one thread per grow plus
a general thread (`grow_id IS NULL`). The last 20 messages are replayed as
context. `MJ_TOOLS` declares 19 tools: nine read (`get_day`, `get_week`, `get_grow_log`,
`get_grow_info`, `get_environment`, `get_plant_log`, `search_journal`,
`get_photos`, `get_photo`) and ten write (listed in `MJ_WRITE_TOOLS`).

### Letting MJ look at photographs

`get_photos` returns up to `MJ_PHOTO_BATCH` (6) thumbnails for a date range or
one plant, and `get_photo` returns a single image at full resolution. Stored
thumbnails are 480px, which carries colour, canopy and vigour but not
trichomes, so the persona tells her to fetch a full image before judging
detail.

**The images cannot travel inside the tool result.** On Gemini 2.5 a
`functionResponse` is JSON, and an image nested in it is invisible to the model
(multimodal function responses are a Gemini 3 feature). They are sent as
**sibling `inlineData` parts in the same turn** as the `functionResponse`, which
is how a 2.5 model receives an image at all.

The mechanism: `executeTool` takes a `shown` array, pushes `{mimeType, data}`
into it, and `runGemini` appends those as sibling parts after the function
responses. `test/mj-tool-images.test.js` asserts the shape of what actually
goes on the wire, including that no base64 is smuggled into the JSON result,
where 2.5 would read it as a meaningless string and bill for it anyway.

Two deliberate properties:

- **The metadata is the answer on its own.** Every result carries the date,
  grow day, plant and a `viewable` flag whether or not the image attaches. If a
  photo cannot be shown, the tool says so and the persona tells her to admit it
  rather than describe a picture she was not given.
- **Images live for one turn.** They are in `contents` while she reasons and
  are never written to `mj_conversations`; her written observations are the
  durable part. Replaying pictures into every later turn would inflate each one
  to re-send something she has already described in words.

`photosForRange` thins its results to one per day before filling the batch, so
a range always reads as a spread of days rather than forty shots of harvest
day, and returns them oldest first so position in the sequence means position
in time.

### Searching the journal

`search_journal` wraps `searchJournalRows` in `worker/journal.js`, the same
function behind the journal's own search box, so MJ and the app can never
disagree about what the record says. It matters for quota as much as for
quality: "when did I last see mites" used to mean walking days one at a time,
and every one of those days was a whole request against a budget of 250.

### Prompt order is load-bearing

Gemini 2.5 caches **implicitly**: no API call, no flag, nothing to enable. It
matches the prefix of a request against recent ones and discounts what repeats
by 90%. So the whole optimisation is prompt order.

`buildSystemSegments` returns two segments and the first must never vary by
anything but the crop:

| Segment | Contents | Approx tokens |
|---|---|---|
| stable | persona + crop brief | 2,580 |
| (alongside) | `MJ_TOOLS` declarations | 3,660 |
| volatile | stage timeline, roster, weather, log, stats, today's date | varies |

That ~6,240 tokens repeats on every turn **and on every iteration of the tool
loop**, so an eight-step answer used to re-send about 50,000 tokens of
identical text.

`test/mj-prompt-cache.test.js` asserts the stable segment is byte-identical
across days, stage histories, growers and spaces, and fails the build if a date
appears in it. That test exists because the stage timeline used to live in the
stable block and quietly broke the prefix every time anything was recorded.

### Quota, and what actually counts

**Everything is counted in requests to Google, never in chat messages.** One
message is a tool loop that can make up to `MAX_TOOL_ITERATIONS` (6) round
trips, so the two are not the same unit. Treating them as one is how the old
ceiling came to be wrong by a factor of six.

This project's real free-tier quota for `gemini-2.5-flash`, read off the Cloud
Console quotas page rather than from documentation (published figures disagree
with each other):

| Quota | Value |
|---|---|
| requests/day | 250 |
| requests/minute | 10 |
| tokens/minute | 250,000 |

Requests bind first: at ten a minute the app uses roughly 89,000 tokens a
minute, well inside the token allowance. So `worker/limits.js` divides up
requests:

| Constant | Value | Meaning |
|---|---|---|
| `GEMINI_DAILY_LIMIT` | 250 | the whole day, all users |
| `GEMINI_PRO_DAILY_LIMIT` | 25 | global pro requests/day |
| `PER_USER_DAILY_REQUESTS` | 60 | one grower's share |
| `ADMIN_DAILY_REQUESTS` | 180 | the owner's share |
| `RESERVED_FOR_OTHERS` | 40 | what an admin can never spend |

Admins used to bypass every check. That was harmless against 1500 requests a
day and is not against 250: one long afternoon would leave the app dead for
everyone else until midnight ET. They now get a large budget rather than an
unlimited one, and cannot touch the reserve.

A turn reserves one request before the model call, so concurrent messages
cannot all slip past the cap, then corrects the figure to what it actually
cost: a six-step turn costs five more, and a turn that never reached Google
gives the reservation back. `runGemini` reports the count through a
caller-owned `usage` counter rather than a return value, so the figure survives
a failure; requests made before something broke still reached Google. Each
model is charged its own share, since Pro's ceiling is far tighter.

The global check requires a whole turn's headroom (`+ MAX_TOOL_ITERATIONS`),
because a turn cannot be stopped part way once it has started making requests.

A 429 is retried once after `GEMINI_RETRY_AFTER_MS`, since mid-answer it is
usually the per-minute window rather than the daily one.

**Rough shape of a day:** a simple question is 1 request, a typical one about
3, a deep one up to 6. So 250 requests is roughly 80 ordinary conversations or
40 heavy ones, shared across everyone.

### Failing safely

- **Timeouts measure silence, not duration.** A total timeout would kill the
  long thoughtful answer that is worth waiting for. Nothing before the response
  opens is a dead connection (`GEMINI_CONNECT_TIMEOUT_MS`, 20s); a gap that long
  mid-stream is one that died without saying so (`GEMINI_IDLE_TIMEOUT_MS`, 45s).
- **The Pro-to-Flash fallback stops once anything has been written.** Retrying a
  turn re-runs its tools, which is free for reads and wrong for writes. The turn
  is flagged as having written *before* the tool runs, and such a turn is saved
  to history with its actions so they can still be undone.
- **Context blocks fail soft but never silently.** Losing one costs MJ knowledge
  without costing the reply; each logs when it happens.

### Measuring her: the eval suite

MJ is ~3,000 tokens of persona plus nineteen tool schemas, and until this
existed there was no way to tell whether editing a line made her better or
worse. Two tiers, because they cost differently.

**Free, and part of `npm test`.** `test/mj-persona.test.js` checks the things
that are true of the prompt itself: every tool has a usable description and a
well-formed schema, every required parameter exists, MJ is told about every
tool she has, the persona never promises a tool that does not exist, and
neither the persona nor any tool description contains an em dash when she is
told never to use one. These catch the drift that is invisible until she is
live. `test/mj-eval-harness.test.js` tests the harness's own judging, because a
suite that reports green through a broken checker is worse than no suite.

**Paid, and run deliberately.**

```bash
npm run eval                  # the hard checks
npm run eval -- --grade       # also judge whether each answer is any good
npm run eval -- --case day-zero --verbose
```

Twelve golden cases in `eval/cases.js`, run against the real model with the
real persona, the real tool declarations and the real tool executor. Only the
database is a stand-in: `eval/fixture.js` is a fixed grow with known answers
(mites on 2026-08-02, watering logged in litres, day 0 at 2026-06-01), because
a suite running against live data would change its verdicts whenever you logged
something.

Each case can claim four kinds of thing:

| Claim | Catches |
|---|---|
| `expectTools` / `forbidTools` | a persona edit quietly changing how she works |
| `mustMatch` / `mustNotMatch` | a rule the persona states outright being broken |
| `maxRequests` | an edit that costs two more requests per answer |
| `grade` | whether the answer is actually useful, judged by a model |

The grader is separate on purpose. Its verdict is reported beside the hard
checks rather than folded into them, because a case can pass every rule and
still read badly, and because the grader is itself unverified judgement. An
unparseable grader answer is `unknown`, never a silent pass.

A full graded run is at most ~54 requests against a daily allowance of 250, and
usually far fewer, since most answers take one or two. The runner prints the
ceiling before it starts and the real spend at the end, and exits non-zero if
any hard check failed.

### What MJ is told about the weather

Her context carries the grow's **own** weather, resolved from `survey.lat/lon`,
read cache-only so no National Weather Service round trip sits in front of a
reply. A space with no location gets no weather rather than somebody else's, a
forecast older than six hours is dropped rather than read out as current, and
anything over twenty minutes old says how old it is.

What the space *is* decides how much she hears: outdoors the sky is the record
so the full forecast applies, while an indoor or greenhouse space gets severe
weather alerts only. A tent does not care about tomorrow's high; it does care
about the ice storm that will take the power out.

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

`010_grow_archive.sql` adds `grows.archived_at`, which is what archiving a grow
space sets. `011_grow_rundown.sql` adds `grows.rundown_at`, which a delete has to
present. Neither removes anything: existing spaces come out unarchived and with
no rundown yet, which simply means one has to be generated before they can be
deleted. `worker/grows.js` self-heals both columns on databases created before
they existed, so applying the files by hand is optional.

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
  main.jsx                        Entry. AuthProvider + Root, then LoginGate or App.
  App.jsx                         Authenticated app shell. Lazy-loads heavy panels (chat, wizard, admin, stats, map).
  styles.css                      Responsive layout breakpoints + scrollbar styling.
  lib/
    dates-core.js / dates.js      Pure date helpers; dates.js adds the useToday hook.
    growData.js                   Barrel for lib/growdata/: PHASES, THREATS, getPhase, getDetail, milestones.
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
  archive.js                      Archiving a grow space, the archive's caps, the
                                  rundown gate, and the deletes it lets through.

eval/                             MJ's golden set. Run with npm run eval; costs
                                  real requests, so it is not in npm test.
  cases.js                        Twelve cases and what each one claims.
  fixture.js                      A fixed grow with known answers.
  judge.js                        Deciding whether a case passed (unit tested).
  grade.js                        The model-graded half, and its rubric.
  run.mjs                         The runner and its scorecard.
  report.js                       The rundown: a space's whole record as one
                                  printable, self-contained HTML document.
  mj.js                           Barrel for worker/mj/: POST /api/mj, usage, history, undo.
  mj/                             MJ modules: chat handler, context builders, tool executor, usage, history, undo.
  mj-logic.js                     Pure MJ helpers (merge checkoffs, append note, day view) + tool schemas.
  providers/gemini.js             Gemini API adapter (request shaping, SSE parsing).
  util.js                         JSON helpers, cookie helpers, bounded JSON body reader.

public/
  icon.svg                        App icon (PWA, favicon, apple-touch-icon).
  manifest.webmanifest            PWA manifest.
  sw.js                           Service worker: caches the app shell, passes API calls through.
  icon-32.png, icon-180.png,
  icon-192.png, icon-512.png      Rasterised launcher icons. Regenerate with node scripts/icons.mjs.
assets/
  banner.svg                      Animated README hero banner.
  social-preview.svg              GitHub social preview card.
  shots/                          Real screenshots used in the README.

schema.sql                        D1 schema for fresh environments. Apply with wrangler d1 execute.
migrations/                       One-time numbered migrations for existing databases.
wrangler.jsonc                    Worker + D1 + assets config.
launch.sh                         One-click launcher: builds and runs the deployed app against the production DB.
```

## The archive

Retiring a grow space archives it: `grows.archived_at` gets a timestamp, and
clearing that timestamp puts the space back exactly as it was. Everything it
ever wrote stays in the database. That is the ordinary way to be finished with a
space, and it loses nothing.

A space can also be deleted outright, which is final. That is gated on saving
the space's rundown first, so what is lost is the app's copy and not the record.
See **Deleting, and the rundown** below.

Archived spaces drop off the environments list into a collapsed **Archived**
section, and out of the calendar switcher, MJ's context and share links
entirely. `usePlan` exposes `liveGrows` and `archivedGrows` alongside the full
`grows` list; only the environments list asks for the archived ones. Archiving
the last space you have left is refused, because there would be no list to
reach the archive through afterwards.

`archived_at` is deliberately separate from `status`: a harvested space stays
harvested while it is put away, and comes back harvested. (The `abandoned`
status is now shown as **Stopped**, since "Archived" means the archive.)

### Deleting, and the rundown

Deleting a space IS allowed, and it is final: `DELETE /api/grows/:id` removes the
space and every row keyed to it. What makes it allowed is the rundown.

`GET /api/grows/:id/report` builds the space's whole record as one self-contained
printable HTML file: setup and profile, the plant roster with each plant's own
timeline, every recorded stage change, time in each stage, the journal day by
day, every custom event, the imported sensor series rolled up per day, the
drying and curing log with final weight, a dated contact sheet of every
photograph, any day records left over from before the daily log replaced them,
and season stats. Photographs are thumbnails: full images run to ~700 KB each
and would put a 300-photo grow past 200 MB.

Building that file stamps `grows.rundown_at` and hands the same timestamp back
in an `x-rundown-at` response header. `DELETE /api/grows/:id` refuses with
`409 { code: "rundown_required" }` unless its body carries a `rundownAt` that
matches the stored stamp AND is younger than `RUNDOWN_VALID_MS` (30 minutes, in
`src/lib/archive.js`). So the only route to a delete is: have the app build the
file, take it, then delete within the half hour.

This proves the app produced the file and handed it over. It cannot prove the
file reached your disk, and nothing in a browser can. The freshness window is
what stops a rundown taken in March authorising a delete in September.

`downloadRundown` in `src/lib/rundown.js` is the single client path: it fetches,
saves the blob, and returns the token. Settings' **Export report** row uses it
too, so there is one report and not two that could drift apart.

### The caps, and the one delete left

The archive is the one place the record grows without bound, so it has two
ceilings in `src/lib/archive.js`:

- `ARCHIVE_MAX_SPACES` (20 spaces)
- `ARCHIVE_MAX_BYTES` (2.5 GB of D1's 5 GB, measured across every grow-scoped
  table; journal photos are base64 in D1 and are nearly the whole figure)

Whichever is reached first, archiving something new makes room by dropping the
spaces archived longest ago. That drop is never silent, and it is gated exactly
like a plain delete:

1. `POST /api/grows/:id/archive` answers the first call with
   `409 { code: "archive_full", evict: [...] }` naming which spaces would go.
2. `ArchiveGrowConfirm` lists them by name and size, each with its own Save the
   rundown button.
3. Calling again with `{ evict: true, rundowns: { [growId]: token } }` needs a
   valid, fresh token for EVERY space in that list. A missing or stale one
   returns `409 { code: "rundown_required", needRundown: [...] }` and nothing
   happens at all: not the eviction, and not the archiving that prompted it.

A space larger than the whole budget empties the archive and is archived anyway,
because refusing to keep the thing just archived would be the one outcome nobody
asked for. Its rundowns are still required first.

`planEviction`, `archiveFullness` and `rundownIsFresh` are pure and tested in
`test/grow-archive.test.js`; the filename rules are in
`test/rundown-file.test.js`. The eviction itself (`purgeGrow` in
`worker/archive.js`) clears every grow-scoped table before the `grows` row, so a
failure part-way leaves a space that still exists rather than orphan rows.

Endpoints: `GET /api/archive`, `POST /api/grows/:id/archive`,
`POST /api/grows/:id/unarchive`, `GET /api/grows/:id/report`,
`DELETE /api/grows/:id`.

## Photographs: stored as base64, served as bytes

Photos live in D1 as base64 data URLs. That is fine as storage and ruinous as a
payload, so **a list of photographs is a list of ids**. The picture itself comes
from `/api/photos/:id/:size`, which answers with real bytes under
`private, max-age=31536000, immutable` (true: an id names one picture and will
never name another).

| Payload | Before | After |
|---|---|---|
| journal day, 6 photos | 0.29 MB | 0.4 KB |
| journal day, 20 photos | 0.96 MB | 1.3 KB |
| plant timeline, 100 shots | 4.78 MB | 6.6 KB |
| plant timeline, 300 shots | 14.33 MB | 20.1 KB |

Three things follow from it. The browser caches each picture, so reopening a day
costs nothing. `loading="lazy"` finally does something: against a data URL the
bytes had already arrived, so there was nothing to defer. And React diffs ids
rather than megabyte-long strings.

The queries do not select `thumb` either, so D1 stops reading ~49 KB a row to
answer a list.

`photoUrl()` in `src/lib/photoUrl.js` builds the URL; `test/photo-payload.test.js`
asserts that no list response carries bytes and that the queries do not read the
column. The strain library has always worked this way, which is where the
pattern came from.

Two places still handle base64 on purpose: the rundown in `worker/report.js`
embeds thumbnails because the file has to be self-contained, and MJ's
`get_photos` needs the bytes to hand to Gemini.

## Who can reach anything

Everything in here is the owner's. Exactly four things answer without a
session, and `test/public-surface.test.js` is the lock on that list: a route
added above the session gate in `worker/index.js` fails the suite, so opening a
fifth public surface takes a deliberate edit to that test rather than a patch
that lands in the wrong half of a file.

| Public | What it is | What it holds back |
| --- | --- | --- |
| `/api/health` | the database is up | everything else |
| `/api/auth/*` | the door | 401 without credentials |
| `/api/share/:token` | the friend link | see **The friend view** |
| `/s/:code` | one variety's reference page | every word of your record |

Below the gate, `currentUser` then `requireOwner` run before any route
dispatches. `requireOwner` is the only definition of "me" in the codebase and
answers 404, never 403, so a stranger holding a session learns nothing about
what exists. A session that is not the owner's is deleted the moment it is
used. Cookies are `HttpOnly`, `Secure` on HTTPS, `SameSite=Lax`, and mutating
requests must declare `application/json`, which a cross-site `<form>` cannot.

Nothing is offered to a search engine: `robots.txt`, an `X-Robots-Tag` header
on every response, and a `noindex` meta tag, because robots.txt alone is
advisory and a share link pasted into a forum gets fetched by crawlers that
never read it.

### Mushrooms are not shareable, at all

Nothing about a mushroom grow leaves this app. Two independent gates, because
one gate is not a gate:

1. **The link.** `shareContext` keeps only spaces whose crop is
   `SHAREABLE_CROP`. A tub is not in the switcher, its days answer 404 when
   named directly, and its photographs are not fetchable even with a photo id.
2. **The catalog.** `recordStrains` takes the whole survey and returns early
   for anything that is not cannabis, so a mushroom variety's name never
   reaches `strain_catalog`, which is the one table in this app with a public
   face. `ensureStrainPrivacy` sweeps out anything recorded before that gate
   existed, reading which names are mushrooms from the grower's own surveys
   since the catalog predates the crop column. `getStrainPage` refuses a
   non-cannabis row again on the way out.

Both are **allowlists of one crop, never a list of excluded ones**. A crop
added to the app later is private until somebody deliberately edits
`SHAREABLE_CROP` and `PUBLIC_CROP`, rather than public until somebody
remembers to exclude it. `test/privacy-cutoff.test.js` asserts the shape as
well as the behaviour.

### The strain page is addressed by a code, not a name

`/s/` used to be `/s/<strain name>`. That leaked the only thing it had: a word
is guessable, so anyone could walk a list of variety names and read back which
ones answered 200. In a single-person app, that catalog is one person's shelf.

The address is now a random `page_code` minted per variety and stored on its
catalog row. It is handed out by `GET /api/strains/page-code?name=...`, which
is owner-only, and it reaches the world only by being printed on that variety's
own label. An existing row keeps the code it already handed out, so a label
printed last year still scans. A variety with no public page answers `null` and
its label prints with no QR at all rather than a dead one, and the label sheet
says which of the two reasons it is.

The page itself never touched a user row and still does not: no rating, no
notes, no dates, no spaces, no session.

## The friend view

`/share/:token` is a read-only window onto a grower's journal, opened by a link
and nothing else. No session, no cookie, no account.

It used to show one auto-picked grow as a single non-interactive month: the
stage colours and nothing behind them. Now it opens the journal itself.

### What a link reaches

One token per grower, every live space behind it, switched from the header.
The rules live in exactly one function, `shareContext` in `worker/share.js`,
and every public read route resolves through it before touching anything:

- **Live spaces only.** Archiving a space takes it off the link, photographs
  and all, without deleting a thing.
- **A space that never finished setup** is not on the link either.
- **A space id the link does not reach answers 404, never 403.** A 403 would
  confirm the id exists.

Widen the surface there or nowhere.

### What never travels

| Kept out | Where it is dropped |
| --- | --- |
| Location, coordinates | `shareSurvey` |
| Closing notes, dry/cure log notes | `shareLifecycle` |
| Reminders and to-dos (`grow_events`) | never queried by `getShareDay` |
| MJ conversations | no route reads them |

`test/share-scope.test.js` asserts each of these, including that no location
string survives anywhere in the spaces payload. The share sheet in the app
states the same list to the grower, because a link has no password and no
expiry: whoever it is forwarded to can open it.

### The routes

All GET, all public, all under `worker/shareView.js`:

```
/api/share/:token                                 the spaces this link opens
/api/share/:token/grows/:id/month/YYYY-MM         which days hold anything
/api/share/:token/grows/:id/day/YYYY-MM-DD        one day, whole
/api/share/:token/grows/:id/timeline?before=      the grow back to front, paged
/api/share/:token/grows/:id/photos?offset=        every picture, paged
/api/share/:token/photos/:photoId/(thumb|full)    the bytes
```

Two rules they all follow. **Nothing writes.** And **nothing calls upstream**:
a public URL must never be a way to spend somebody's weather or model quota, so
a shared day reports the climate already written into its log rather than
fetching any. The photo route exists because `/api/photos/:id/:size` is
session-authorised and a friend has no session; it additionally checks the
picture belongs to a space the link reaches.

An unmatched path under `/api/share/` answers 404 rather than falling through
to the session check, which used to tell a friend with a mistyped link that
they were "not authenticated".

### The client

`src/components/Buddy/` is its own small app, lazy-loaded as a separate chunk
so the grower does not download it to open their own calendar. It deliberately
does **not** reuse `src/components/Journal/`: those are 2,900 lines of editors
wired to write hooks, and threading a `readOnly` flag through them is how a
write control eventually leaks onto a public page. It reuses the pure helpers
instead, the same `recordRows`, `summarizeEntry` and `stageOnDate` the owner's
own pages read through, so the two views cannot drift.

The whole state of a read lives in the URL (`?g=` space, `?t=` tab, `?d=` day,
encoded by `src/lib/shareRoute.js`), which is what makes the phone's back
button step back through what somebody just read, and what makes one day of one
space a link they can pass on.

`openingMonth` in that same file decides where the calendar lands. Today's
month is the wrong answer for any grow that is not currently running: a link to
a grow that finished in June opened on September and showed a blank grid. It
lands on the month of the last thing written in the space instead, which is why
the spaces payload carries `lastDate`.

## Reduced motion

The device asks for less motion; the app listens in two halves, because there
are two kinds of animation here and CSS can only reach one of them.

**The JavaScript half.** Twenty-five components animate with framer-motion.
Four of them asked whether the device wanted motion; the other twenty-one slid,
scaled and flew regardless. The `* { transition: none !important }` in
`styles.css` never touched any of them, because framer-motion animates by
writing inline styles from JavaScript, so there is no CSS transition there to
cancel.

One line fixes all of them, in `src/main.jsx`:

```jsx
<MotionConfig reducedMotion="user">
```

When the device asks for less, framer-motion drops transform and layout
animations and leaves opacity alone. That distinction is the whole point:
**reduced motion is not no motion.** A thing that fades is telling you it
changed; a thing that slides across the screen is what makes people ill.

Elements snap to their target rather than sticking at their starting transform,
which is the failure worth knowing about. Measured on the share sheet, which
springs up from `y: "100%"`:

```
                 40ms   90ms  160ms  300ms  700ms
no-preference    307    131     16     -6      0     a real slide, with overshoot
reduce             0      0      0      0      0     already there, not stranded
```

It wraps the friend view too. That runs on somebody else's device and their
setting counts.

**The CSS half** stays in the `@media (prefers-reduced-motion: reduce)` block:
the today-cell pulse, the skeleton shimmer, and every transition.

### Spinners breathe rather than freeze

A frozen spinner beside the word "Importing" reads as a hung app, so under
reduced motion `.spin` swaps its rotation for `spinner-pulse`, which fades
between 1 and 0.35 opacity. Opacity only, because a pulse that scales is still
movement.

The rotation had to become a class first. It was written inline at three call
sites, and **an inline style beats every stylesheet rule**, so the
reduced-motion block was powerless over it. Same trap the focus rings were in.
`test/reduced-motion.test.js` now fails on any inline `animation:` in `src/`.

While moving it: the label sheet had `className="spin"` with no `.spin` rule
anywhere in the codebase, so that spinner had been sitting perfectly still next
to the word "Saving" since it was written. There is a test that every class the
app spins has a rule behind it.

## Focus rings

One rule in `src/styles.css` draws the ring for the whole app:

```css
:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}
```

`:focus-visible` is the important half. It fires for keyboard and switch
navigation, and for text entry however it was focused, so a pointer user never
sees a ring from a plain button press. Hazel is 7.8:1 against the page and
7.1:1 against a card, well past the 3:1 WCAG asks of a non-text indicator.

The app used to set `outline: "none"` in 24 inline styles and replace it in
exactly one place, so tab navigation was invisible nearly everywhere. Those are
gone. Do not add them back: an inline style outranks any stylesheet selector, so
one of them silently disables the global rule for that control and no amount of
CSS wins it back without `!important`.

The single exception is the MJ composer, where the pill and the textarea read as
one control. The pill takes `:focus-within`, and only then may the textarea drop
its own ring. `test/focus-ring.test.js` enforces the whole arrangement: no inline
suppression at all, and a stylesheet rule may drop a ring only when its own
selector has a `:focus-within` replacement.

## Backup and restore

Settings has a **Back up everything** row. It downloads `GET /api/backup.json`:
every space, journal entry, daily log, check-off, plan override, strain rating
and MJ conversation, as one JSON file. It says how long it has been since the
last one on that device, and turns amber past a month.

What is deliberately not in it:

- **Photo images.** The rows come out with their dates and plants, but not the
  base64. At the documented caps that is up to 784 MB per grow, and the pictures
  are already in the camera roll.
- **Anything that could sign somebody in.** Sessions, reset tokens and push
  subscriptions are left out. So are share tokens: unlike the other two those
  are stored unhashed, and a backup file travels.
- **The account row.** It is in the file as `account`, for reference. Its
  password columns are NOT NULL and are not backed up, so inserting it could
  only fail, and in wrangler one failed statement aborts the whole file.

### Restoring

```bash
node scripts/restore.mjs black-cat-backup-2026-09-09.json > restore.sql
npx wrangler d1 execute grow-calendar-db --local --file=./restore.sql
```

Drop `--local` to write the real database. Sign the account up first: the script
does not create it, and the restored rows are keyed to a `user_id` that has to
exist.

Every statement is `INSERT OR REPLACE`, so a restore fills gaps and overwrites
collisions and never empties a table you still wanted. Photo rows come back with
a 1x1 transparent PNG in `data` and `thumb`, because those columns are NOT NULL:
the journal knows a photo was taken that day and shows a blank tile.

This round trip is tested, not assumed. `test/backup.test.js` runs the restore
script and checks the placeholder, the escaping, and that it never emits a
DELETE.

## How sync works

- Each device signs in. Session cookie is set HttpOnly + Secure on the device.
- Check off a task. The frontend PUTs `/api/checkoffs/YYYY-MM-DD` with the full list of checked indexes for that day, and D1 upserts.
- Open the app on another device or refocus the tab. `useCheckoffs` refetches and the latest state appears.
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
