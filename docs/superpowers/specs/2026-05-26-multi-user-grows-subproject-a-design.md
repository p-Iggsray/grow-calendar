# Sub-project A: Multi-tenant foundation + approval gate

Design spec. Part of the multi-user epic (GitHub #90); this is sub-project A (#91).

## Goal

Turn the single-user app into a multi-user app with an owner-approval (request-to-join) workflow and fully isolated per-user data. At the end of A:

- A friend can self-register and is created in a `pending` state.
- A pending user can log in but only sees a "waiting for approval" holding screen.
- The owner (admin) approves or rejects pending requests and can remove existing members.
- Each approved user has their own isolated grow: their own plan config and per-day overrides, check-offs, notes, and MJ context.
- A per-user daily MJ cap bounds the owner's shared-key Anthropic cost.

No AI plan generation and no plan editor in A. New users get a copy of the existing GDP/Haze plan. Those are sub-projects B (#92) and C (#93).

## Out of scope

- Generic/configurable plan engine and plan editor (B).
- MJ onboarding interview that builds a plan (C).
- Cloudflare AI Gateway integration (#94).
- Password reset / change password, email, account self-service beyond signup.

## Current state (baseline)

- `worker/auth.js`: signup returns 403 once any user exists; the Create Account UI was removed. `currentUser` returns `{ id, username }`. Login rate limiting exists via the `login_attempts` table.
- `worker/index.js`: flat router. `/api/*` routes; everything else serves static assets.
- Data: `task_checkoffs` and `day_notes` are per-user (`user_id`). `plan_config` is a single global row (`id INTEGER PRIMARY KEY CHECK (id = 1)`); `plan_day_overrides` is global (PK `date`). `worker/plan.js` `loadRawPlan(env)` reads the global plan; `worker/mj.js` calls `loadRawPlan(env)` and otherwise scopes by `user.id`.
- Frontend: `src/main.jsx` `Root` shows Splash while loading, `LoginGate` if no user, else `PlanProvider` + `App`. `src/lib/auth.jsx` holds `user` from `api.me()`. `src/lib/usePlan.jsx` fetches the plan once on mount. `src/lib/api.js` already has `signup` and `signupStatus` wrappers.
- Production D1 already has all tables and one user (the owner). The `ANTHROPIC_API_KEY` secret is not yet set (separate, tracked).

## Data model

### `users` (add two columns)

```sql
ALTER TABLE users ADD COLUMN role   TEXT NOT NULL DEFAULT 'user';   -- 'user' | 'admin'
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'; -- 'pending' | 'approved'
```

`ALTER TABLE ADD COLUMN` is supported by SQLite/D1 and is non-destructive.

### `plan_config` (rebuild: per-user)

The `CHECK (id = 1)` single-row constraint and the `id` PK must go. SQLite cannot drop a CHECK or change a PK in place, so this is a table rebuild (create new, copy, drop old, rename).

```sql
CREATE TABLE plan_config_new (
  user_id    INTEGER PRIMARY KEY,
  config     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- existing single global row migrates to the owner (see migration)
DROP TABLE plan_config;
ALTER TABLE plan_config_new RENAME TO plan_config;
```

### `plan_day_overrides` (rebuild: per-user)

PK becomes composite `(user_id, date)`.

```sql
CREATE TABLE plan_day_overrides_new (
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
DROP TABLE plan_day_overrides;
ALTER TABLE plan_day_overrides_new RENAME TO plan_day_overrides;
```

### `mj_usage` (new: per-user daily MJ cap)

```sql
CREATE TABLE IF NOT EXISTS mj_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,        -- YYYY-MM-DD in America/New_York, matches MJ's "today"
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Migration (preserves production data)

Order matters; run as one migration file:

1. Add `role`/`status` columns to `users`.
2. Mark the existing owner: `UPDATE users SET role='admin', status='approved'` for the single existing user (by lowest `id`, which is the owner).
3. Rebuild `plan_config`: create `plan_config_new`, copy the existing global row assigning `user_id` = owner id (`INSERT INTO plan_config_new (user_id, config, updated_at) SELECT <ownerId>, config, updated_at FROM plan_config WHERE id = 1`), drop/rename.
4. Rebuild `plan_day_overrides`: copy existing rows with `user_id` = owner id (currently 0 rows in prod), drop/rename.
5. Create `mj_usage`.

This is the first real use of a numbered migrations directory (relates to #54). Migration files live in `migrations/` and are applied to local and remote D1 explicitly. `schema.sql` is updated to the new shape for fresh environments.

## Backend (worker)

### Auth changes (`worker/auth.js`)

- `currentUser` selects and returns `role` and `status` in addition to `id`, `username`.
- `getMe`, `login`, and `signup` responses include `{ id, username, role, status }`.
- `signup`: remove the "403 if any user exists" gate. New rows are created with `role='user'`, `status='pending'`. Signup still issues a session (so the new user lands logged-in on the holding screen). Apply the same per-IP+username rate-limit pattern used by login to signup (prevents signup spam).

### Gating helpers (`worker/auth.js` or a small `worker/guard.js`)

- `requireApproved(user)`: returns a 403 (`{ error: "pending approval" }`) if `user` is null or `status !== 'approved'`.
- `requireAdmin(user)`: returns a 403 if `user` is null or `role !== 'admin'`.

### Router (`worker/index.js`)

- Public auth routes (`signup-status`, `signup`, `login`, `logout`, `me`) stay open.
- App routes (`/api/plan`, `/api/checkoffs/*`, `/api/notes/*`, `/api/mj`) require an approved user. A pending user hitting any of these gets 403.
- New admin routes (all require admin):
  - `GET /api/admin/users` -> `[{ id, username, role, status, created_at }]`, ordered pending-first then by created_at.
  - `POST /api/admin/users/:id/approve` -> sets `status='approved'`.
  - `DELETE /api/admin/users/:id` -> deletes the user (serves both Reject for pending and Remove for approved). FK `ON DELETE CASCADE` removes their sessions, check-offs, notes, plan, overrides, and mj_usage.

### Admin guards

- Cannot delete yourself.
- Cannot delete the last remaining admin (defensive; there is one admin today).

### Per-user plan isolation (`worker/plan.js`, `worker/mj.js`)

- `loadRawPlan(env, userId)` queries `plan_config WHERE user_id = ?` and `plan_day_overrides WHERE user_id = ?`.
- Lazy seeding: if the user has no `plan_config` row, insert a copy of `DEFAULT_CONFIG` (`{ user_id, config: JSON.stringify(DEFAULT_CONFIG), updated_at: now }`) and return it. This covers newly approved users without special-casing the approval step, and the owner's row already exists from migration.
- `getPlan` passes `user.id`. `worker/mj.js` updates its `loadRawPlan(env)` call to `loadRawPlan(env, user.id)`.

### Per-user MJ rate limit (`worker/mj.js`)

- After auth + approved check, before calling Anthropic: read/increment `mj_usage` for `(user.id, today)` where `today` is the same `America/New_York` date MJ already computes.
- Constant `MJ_DAILY_LIMIT` (default 50 messages/user/day; one-line tunable). Admins are exempt (no cap).
- Over the cap returns 429 with a friendly message; the frontend surfaces it via the existing toast/error path. The counter increments on accepted requests only.

## Frontend

### Routing (`src/main.jsx` `Root`)

- `loading` -> Splash (unchanged).
- no user -> `LoginGate` (now with signup toggle).
- user with `status === 'pending'` -> new `PendingScreen`.
- user with `status === 'approved'` -> `PlanProvider` + `App` (unchanged).

### `LoginGate` (`src/components/LoginGate.jsx`)

- Add a "Request an account" toggle that switches the form to signup (username + password) using the existing `api.signup` wrapper. On success, `auth.login`-style state set with the returned pending user; `Root` then renders `PendingScreen`. Reuse the existing field styling.

### `PendingScreen` (new component)

- Message: request received, waiting for the owner to approve. Includes a Log out button. Styled to match `LoginGate`.

### Admin entry + panel

- `Header` (`src/components/Header.jsx`) shows an Admin control only when `user.role === 'admin'`.
- `AdminPanel` (new component): in-app view (state toggle in `App`, since there is no router). Two sections:
  - Pending Requests: username + requested-at, with Approve and Reject buttons.
  - Members: approved users with a Remove button (Remove is disabled for the current user and the last admin).
- Actions call the admin API and refresh the list. Uses the existing toast for success/error.

### API wrappers (`src/lib/api.js`)

- `adminListUsers()` -> `GET /api/admin/users`
- `approveUser(id)` -> `POST /api/admin/users/:id/approve`
- `deleteUser(id)` -> `DELETE /api/admin/users/:id`

## Security considerations

- Approval is enforced server-side on every app route, not just hidden in the UI. The holding screen is UX; `requireApproved` is the control.
- Admin routes enforced server-side via `requireAdmin`; the admin UI being hidden is not the control.
- Signup is rate-limited like login to prevent spam account creation.
- Deletes cascade via FKs so no orphaned per-user rows remain.
- Self-delete and last-admin-delete are blocked to avoid lockout.
- The Anthropic key remains a Worker secret, shared, never exposed to the browser; the per-user cap limits abuse of the shared key.

## Testing (node --test, matching existing suite)

- signup creates a `pending`, `role='user'` account and issues a session.
- a pending user is blocked (403) from `/api/plan`, `/api/checkoffs`, `/api/notes`, `/api/mj`.
- non-admin is blocked (403) from all `/api/admin/*` routes.
- approve flips `status` to `approved` and unblocks app routes.
- delete cascades (sessions/checkoffs/notes/plan/overrides/mj_usage gone) and is blocked for self and last admin.
- plan isolation: two approved users have independent `plan_config`/overrides; lazy seeding creates a default plan on first read.
- MJ rate limit: the (N+1)th request in a day returns 429 for a non-admin; admin is exempt; counter rolls over by date.

## Deployment / rollout

1. Land code + migration behind PRs to `main`.
2. Apply the migration to local D1, run the test suite.
3. Apply the migration to remote D1 (`npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/<file>.sql`). This preserves the existing owner and their plan.
4. Cloudflare auto-deploys on push to `main`.
5. Set `ANTHROPIC_API_KEY` (separate prerequisite) so MJ answers for everyone.

## Decisions made (alternatives weighed)

- Role/status as columns on `users` rather than a separate table: simplest for this scale, no joins.
- Lazy plan seeding on first read rather than at approval time: less special-casing, no orphan plans for rejected users.
- Central gating helpers rather than per-route inline checks: one place to reason about access.
- One `DELETE` endpoint serving both Reject and Remove rather than two endpoints: same operation (delete user + cascade).
- In-app admin view rather than a separate page/router: the SPA has no router; a state toggle is the lightest fit.
- Per-user MJ cap via a dedicated `mj_usage` table rather than overloading `login_attempts`: clearer semantics, independent lifecycle.
