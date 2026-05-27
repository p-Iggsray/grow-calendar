# Multi-tenant Foundation (Sub-project A1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make The Grow Calendar multi-user with a self-signup + owner-approval workflow and fully isolated per-user data, while preserving the owner's live production grow.

**Architecture:** Cloudflare Worker (`worker/`) + D1 (SQLite) backend, React SPA frontend (`src/`). Add `role`/`status` to `users`; make `plan_config` and `plan_day_overrides` per-user; gate API routes centrally in the router (approved users for app routes, admin for admin routes); add admin endpoints + an in-app admin panel; route the frontend on auth status (pending users see a holding screen).

**Tech Stack:** Cloudflare Workers, D1, Wrangler 4, React 18, Vite 5, `node --test`.

**Out of scope (Plan A2):** per-user MJ model routing (owner → Claude, others → free Gemini) and the per-user MJ daily cap. In A1, `/api/mj` is gated to approved users and continues to use the existing Anthropic path for everyone.

**Spec:** `docs/superpowers/specs/2026-05-26-multi-user-grows-subproject-a-design.md` (GitHub #91, epic #90).

---

## File structure

**Created:**
- `migrations/0001_multi_tenant.sql` — one-time schema migration (role/status, per-user plan tables, mj_usage, owner backfill).
- `worker/guard.js` — pure access predicates + 403 response helpers (`isApproved`, `isAdmin`, `requireApproved`, `requireAdmin`).
- `worker/admin.js` — admin endpoints (`listUsers`, `approveUser`, `deleteUser`) + pure `canDeleteUser` guard.
- `src/components/PendingScreen.jsx` — "waiting for approval" holding screen.
- `src/components/AdminPanel.jsx` — owner admin view (pending requests + members).
- `test/guard.test.js`, `test/admin-logic.test.js`, `test/plan-seed.test.js` — unit tests for the pure logic.

**Modified:**
- `schema.sql` — updated to the new multi-tenant shape for fresh environments.
- `worker/auth.js` — `currentUser`/`getMe`/`login`/`signup` carry `role`+`status`; signup reopens as `pending` and is rate-limited.
- `worker/index.js` — central user fetch + gating + admin/app route wiring; handlers receive `user`.
- `worker/plan.js` — `loadRawPlan(env, userId)` + lazy default-plan seeding; `getPlan(env, user)`.
- `worker/checkoffs.js`, `worker/notes.js` — handlers accept `(env, user, ...)` instead of calling `currentUser` themselves; keep `readCheckoffs/writeCheckoffs/readNote/writeNote` helpers unchanged.
- `worker/mj.js` — `postMj(request, env, user)` accepts the user; `loadRawPlan(env, user.id)`.
- `src/lib/api.js` — `adminListUsers`, `approveUser`, `deleteUser` wrappers.
- `src/lib/auth.jsx` — add `signup` to the auth context.
- `src/main.jsx` — `Root` routes on `user.status`.
- `src/components/LoginGate.jsx` — add a "Request an account" signup mode.
- `src/components/Header.jsx` — admin entry visible only to admins; opens the admin panel.
- `src/App.jsx` — top-level view toggle to show `AdminPanel`.
- `DEV.md` — account model + migrations + multi-tenant notes.

---

## Task 1: Schema migration (preserving the live grow)

**Files:**
- Create: `migrations/0001_multi_tenant.sql`
- Modify: `schema.sql`

- [ ] **Step 1: Write the migration file**

Create `migrations/0001_multi_tenant.sql`:

```sql
-- 0001_multi_tenant.sql
-- One-time migration. NOT re-runnable (table rebuilds). Take a backup first.
-- Preserves the existing owner (lowest user id), their plan_config row, and
-- their plan_day_overrides. task_checkoffs and day_notes are untouched.

-- 1. users gains role + status (additive; existing rows backfill with defaults)
ALTER TABLE users ADD COLUMN role   TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';

-- 2. promote the original owner
UPDATE users SET role = 'admin', status = 'approved'
WHERE id = (SELECT MIN(id) FROM users);

-- 3. plan_config -> per-user (rebuild: drop CHECK(id=1) + change PK)
CREATE TABLE plan_config_new (
  user_id    INTEGER PRIMARY KEY,
  config     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO plan_config_new (user_id, config, updated_at)
SELECT (SELECT MIN(id) FROM users), config, updated_at
FROM plan_config WHERE id = 1;
DROP TABLE plan_config;
ALTER TABLE plan_config_new RENAME TO plan_config;

-- 4. plan_day_overrides -> per-user (rebuild: composite PK)
CREATE TABLE plan_day_overrides_new (
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
INSERT INTO plan_day_overrides_new (user_id, date, payload, updated_at)
SELECT (SELECT MIN(id) FROM users), date, payload, updated_at
FROM plan_day_overrides;
DROP TABLE plan_day_overrides;
ALTER TABLE plan_day_overrides_new RENAME TO plan_day_overrides;

-- 5. per-user daily MJ usage counter (used by Plan A2; created now)
CREATE TABLE IF NOT EXISTS mj_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- [ ] **Step 2: Update `schema.sql` to the new shape (fresh environments)**

In `schema.sql`, add `role`/`status` to the `users` table, replace the `plan_config` and `plan_day_overrides` definitions, and add `mj_usage`:

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending'
);
```

Replace the existing `plan_config` and `plan_day_overrides` blocks with the per-user versions:

```sql
CREATE TABLE IF NOT EXISTS plan_config (
  user_id    INTEGER PRIMARY KEY,
  config     TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plan_day_overrides (
  user_id    INTEGER NOT NULL,
  date       TEXT NOT NULL,
  payload    TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mj_usage (
  user_id INTEGER NOT NULL,
  date    TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
```

- [ ] **Step 3: Apply the migration to LOCAL D1**

Run: `npx wrangler d1 execute grow-calendar-db --local --file=./migrations/0001_multi_tenant.sql`
Expected: completes with no error; reports several statements executed.

- [ ] **Step 4: Verify local schema and owner backfill**

Run:
```
npx wrangler d1 execute grow-calendar-db --local --command "SELECT id, username, role, status FROM users;"
```
Expected: the local `test` user shows `role=admin`, `status=approved` (it is the lowest id). If the local DB had no users, that is fine; create one later via signup.

Run:
```
npx wrangler d1 execute grow-calendar-db --local --command "SELECT user_id FROM plan_config;"
```
Expected: a `user_id` matching the owner (or zero rows if local had no plan_config; lazy seeding in Task 6 handles fresh users).

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_multi_tenant.sql schema.sql
git commit -m "feat: multi-tenant D1 migration (role/status, per-user plan tables, mj_usage)"
```

---

## Task 2: `currentUser`, `getMe`, and login carry role + status

**Files:**
- Modify: `worker/auth.js`

- [ ] **Step 1: Include role/status in `currentUser`**

In `worker/auth.js`, change the `currentUser` query and return value:

```js
export async function currentUser(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.session;
  if (!token) return null;

  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.role, u.status, s.expires_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).bind(token).first();

  if (!row) return null;
  if (new Date(row.expires_at) < new Date()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.id, username: row.username, role: row.role, status: row.status };
}
```

- [ ] **Step 2: Return role/status from `getMe`**

```js
export async function getMe(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  return json({ user: { id: user.id, username: user.username, role: user.role, status: user.status } });
}
```

- [ ] **Step 3: Thread role/status through login via `finishLogin`**

Change `finishLogin` to take a user object and echo role/status:

```js
async function finishLogin(request, env, user) {
  const token = newSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(token, user.id, createdAt, expiresAt).run();

  return json({ user: { id: user.id, username: user.username, role: user.role, status: user.status } }, {
    headers: { "set-cookie": sessionCookie(token, SESSION_TTL_SECONDS, isHttps(request)) },
  });
}
```

Update the `login` user query to select role/status and call `finishLogin` with the full user:

```js
  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, role, status FROM users WHERE username = ?",
  ).bind(username).first();
```
and at the end of a successful login:
```js
  await clearRateLimit(env, ip, username);
  return finishLogin(request, env, {
    id: user.id, username: user.username, role: user.role, status: user.status,
  });
```

- [ ] **Step 4: Verify with a local run**

Start the worker: `npx wrangler dev` (separate terminal).
Run (using the existing local `test` account):
```
curl.exe -i http://localhost:8787/api/auth/login -X POST -H "content-type: application/json" -d "{\"username\":\"test\",\"password\":\"testpass123\"}"
```
Expected: 200 with body containing `"role":"admin","status":"approved"` and a `set-cookie` session.

- [ ] **Step 5: Commit**

```bash
git add worker/auth.js
git commit -m "feat: carry role/status through currentUser, getMe, and login"
```

---

## Task 3: Reopen signup as pending + rate-limit it

**Files:**
- Modify: `worker/auth.js`

- [ ] **Step 1: Rewrite `signup` to create pending users (no single-user gate) with rate limiting**

Replace the `signup` function body in `worker/auth.js`:

```js
export async function signup(request, env) {
  const body = await safeJson(request);
  if (!body) return error(400, "invalid json");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!USERNAME_RE.test(username)) {
    return error(400, "username must be 2-32 chars, letters/numbers/underscore/hyphen only");
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return error(400, `password must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(env, ip, username);
  if (rateCheck.blocked) {
    return json(
      { error: "too many attempts, please try again later" },
      { status: 429, headers: { "retry-after": String(rateCheck.retryAfter) } },
    );
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) {
    await recordFailedAttempt(env, ip, username);
    return error(409, "username already taken");
  }

  const { salt, hash } = await hashPassword(password);
  const createdAt = nowIso();
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, password_salt, created_at, role, status) VALUES (?, ?, ?, ?, 'user', 'pending')",
  ).bind(username, hash, salt, createdAt).run();

  await clearRateLimit(env, ip, username);
  const userId = result.meta.last_row_id;
  return finishLogin(request, env, {
    id: userId, username, role: "user", status: "pending",
  });
}
```

Note: the first-ever user is still created `pending`; the owner was promoted by the migration, and there is no automatic admin promotion at signup. `getSignupStatus` is now effectively always open; leave it as-is (harmless) for the frontend.

- [ ] **Step 2: Verify signup creates a pending user**

With `npx wrangler dev` running:
```
curl.exe -i http://localhost:8787/api/auth/signup -X POST -H "content-type: application/json" -d "{\"username\":\"friend1\",\"password\":\"friendpass123\"}"
```
Expected: 200 with `"role":"user","status":"pending"` and a session cookie.

Confirm a second signup also succeeds as pending:
```
curl.exe -i http://localhost:8787/api/auth/signup -X POST -H "content-type: application/json" -d "{\"username\":\"friend2\",\"password\":\"friendpass123\"}"
```
Expected: 200, `"status":"pending"`. (Old behavior would have returned 403.)

- [ ] **Step 3: Commit**

```bash
git add worker/auth.js
git commit -m "feat: reopen signup creating pending users, rate-limited"
```

---

## Task 4: Gating helpers (pure) + tests

**Files:**
- Create: `worker/guard.js`
- Test: `test/guard.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/guard.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { isApproved, isAdmin } from "../worker/guard.js";

test("isApproved is true only for approved users", () => {
  assert.equal(isApproved({ status: "approved" }), true);
  assert.equal(isApproved({ status: "pending" }), false);
  assert.equal(isApproved(null), false);
});

test("isAdmin is true only for admin role", () => {
  assert.equal(isAdmin({ role: "admin" }), true);
  assert.equal(isAdmin({ role: "user" }), false);
  assert.equal(isAdmin(null), false);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/guard.test.js`
Expected: FAIL — cannot find module `../worker/guard.js`.

- [ ] **Step 3: Implement `worker/guard.js`**

```js
import { error } from "./util.js";

export function isApproved(user) {
  return !!user && user.status === "approved";
}

export function isAdmin(user) {
  return !!user && user.role === "admin";
}

// Return a Response to short-circuit with, or null when allowed.
export function requireApproved(user) {
  return isApproved(user) ? null : error(403, "pending approval");
}

export function requireAdmin(user) {
  return isAdmin(user) ? null : error(403, "admin only");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/guard.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add worker/guard.js test/guard.test.js
git commit -m "feat: add access-gating helpers with tests"
```

---

## Task 5: Centralize auth + gating in the router; handlers accept `user`

**Files:**
- Modify: `worker/index.js`, `worker/checkoffs.js`, `worker/notes.js`, `worker/plan.js`, `worker/mj.js`

- [ ] **Step 1: Update handler signatures to accept the user (remove internal `currentUser`)**

In `worker/checkoffs.js`, change the two route handlers to accept `(env, user, date)` / `(request, env, user, date)` and delete their own `currentUser`/401 logic. Keep `readCheckoffs`/`writeCheckoffs` helpers unchanged. Example:

```js
export async function getCheckoffs(env, user, date) {
  const checked = await readCheckoffs(env, user.id, date);
  return json({ checked });
}

export async function putCheckoffs(request, env, user, date) {
  const body = await safeJson(request);
  if (!body || !Array.isArray(body.checked)) return error(400, "checked must be an array");
  await writeCheckoffs(env, user.id, date, body.checked);
  return json({ ok: true });
}
```
(Preserve the existing validation/body parsing details already in the file; only the signature and the removal of the internal `currentUser` lookup change.)

In `worker/notes.js`, do the same for `getNote(env, user, date)` and `putNote(request, env, user, date)`.

In `worker/plan.js`, change `getPlan` (full implementation lands in Task 6) to `getPlan(env, user)`.

In `worker/mj.js`, change the signature to `export async function postMj(request, env, user)` and delete its internal `const user = await currentUser(...)` plus the `if (!user) return error(401, ...)` lines (the router now guarantees an approved user).

- [ ] **Step 2: Rewrite the router with central user fetch + gating**

Replace `route()` in `worker/index.js` and update imports:

```js
import { error } from "./util.js";
import { getSignupStatus, signup, login, logout, getMe, currentUser } from "./auth.js";
import { getCheckoffs, putCheckoffs } from "./checkoffs.js";
import { getNote, putNote } from "./notes.js";
import { postMj } from "./mj.js";
import { getPlan } from "./plan.js";
import { listUsers, approveUser, deleteUser } from "./admin.js";
import { requireApproved, requireAdmin } from "./guard.js";

// ... default export unchanged ...

async function route(request, env, path) {
  const method = request.method;

  // public auth routes
  if (path === "/api/auth/signup-status" && method === "GET")  return getSignupStatus(env);
  if (path === "/api/auth/signup"        && method === "POST") return signup(request, env);
  if (path === "/api/auth/login"         && method === "POST") return login(request, env);
  if (path === "/api/auth/logout"        && method === "POST") return logout(request, env);
  if (path === "/api/auth/me"            && method === "GET")  return getMe(request, env);

  // everything below requires a session
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

  // admin routes
  if (path === "/api/admin/users" && method === "GET") {
    const gate = requireAdmin(user); if (gate) return gate;
    return listUsers(env);
  }
  const approveMatch = path.match(/^\/api\/admin\/users\/(\d+)\/approve$/);
  if (approveMatch && method === "POST") {
    const gate = requireAdmin(user); if (gate) return gate;
    return approveUser(env, Number(approveMatch[1]));
  }
  const adminUserMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch && method === "DELETE") {
    const gate = requireAdmin(user); if (gate) return gate;
    return deleteUser(env, user, Number(adminUserMatch[1]));
  }

  // app routes require an approved user
  const gate = requireApproved(user); if (gate) return gate;

  if (path === "/api/mj"   && method === "POST") return postMj(request, env, user);
  if (path === "/api/plan" && method === "GET")  return getPlan(env, user);

  const checkoffsMatch = path.match(/^\/api\/checkoffs\/(\d{4}-\d{2}-\d{2})$/);
  if (checkoffsMatch) {
    const date = checkoffsMatch[1];
    if (method === "GET") return getCheckoffs(env, user, date);
    if (method === "PUT") return putCheckoffs(request, env, user, date);
  }

  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    if (method === "GET") return getNote(env, user, date);
    if (method === "PUT") return putNote(request, env, user, date);
  }

  return error(404, "not found");
}
```

Note: `worker/admin.js` (Task 5b below) and `getPlan(env, user)` (Task 6) must exist for the worker to boot. Implement them in the next two tasks; if running the dev server between tasks, temporarily comment the `admin.js` import and its routes.

- [ ] **Step 3: Verify app routes reject a pending user**

With `npx wrangler dev` running, log in as the pending `friend1` (capture the cookie), then call an app route. Quick check:
```
curl.exe -i http://localhost:8787/api/plan -X GET -H "cookie: session=PASTE_FRIEND1_SESSION"
```
Expected: 403 `{"error":"pending approval"}`. The owner (`test`) session against `/api/plan` should still work once Task 6 lands.

- [ ] **Step 4: Commit**

```bash
git add worker/index.js worker/checkoffs.js worker/notes.js worker/plan.js worker/mj.js
git commit -m "refactor: central auth + approval gating in router; handlers take user"
```

---

## Task 5b: Admin endpoints + delete guard (pure) + tests

**Files:**
- Create: `worker/admin.js`, `test/admin-logic.test.js`

- [ ] **Step 1: Write the failing test for the delete guard**

Create `test/admin-logic.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteUser } from "../worker/admin.js";

test("cannot delete yourself", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 1, targetRole: "admin", adminCount: 2 });
  assert.equal(r.ok, false);
});

test("cannot delete the last admin", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 2, targetRole: "admin", adminCount: 1 });
  assert.equal(r.ok, false);
});

test("can delete another non-admin user", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 2, targetRole: "user", adminCount: 1 });
  assert.equal(r.ok, true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/admin-logic.test.js`
Expected: FAIL — cannot find module `../worker/admin.js`.

- [ ] **Step 3: Implement `worker/admin.js`**

```js
import { json, error } from "./util.js";

// Pure guard: returns { ok: true } or { ok: false, reason }.
export function canDeleteUser({ actingId, targetId, targetRole, adminCount }) {
  if (actingId === targetId) return { ok: false, reason: "you cannot delete your own account" };
  if (targetRole === "admin" && adminCount <= 1) {
    return { ok: false, reason: "cannot delete the last admin" };
  }
  return { ok: true };
}

export async function listUsers(env) {
  const res = await env.DB.prepare(
    `SELECT id, username, role, status, created_at
     FROM users
     ORDER BY (status = 'pending') DESC, created_at ASC`,
  ).all();
  return json({ users: res.results || [] });
}

export async function approveUser(env, targetId) {
  const target = await env.DB.prepare("SELECT id FROM users WHERE id = ?").bind(targetId).first();
  if (!target) return error(404, "user not found");
  await env.DB.prepare("UPDATE users SET status = 'approved' WHERE id = ?").bind(targetId).run();
  return json({ ok: true });
}

export async function deleteUser(env, actingUser, targetId) {
  const target = await env.DB.prepare("SELECT id, role FROM users WHERE id = ?").bind(targetId).first();
  if (!target) return error(404, "user not found");

  const adminRow = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM users WHERE role = 'admin'",
  ).first();

  const verdict = canDeleteUser({
    actingId: actingUser.id,
    targetId,
    targetRole: target.role,
    adminCount: adminRow?.n ?? 0,
  });
  if (!verdict.ok) return error(409, verdict.reason);

  // FKs cascade sessions, task_checkoffs, day_notes, plan_config,
  // plan_day_overrides, and mj_usage.
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
  return json({ ok: true });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/admin-logic.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify admin endpoints end-to-end**

With `npx wrangler dev` running and the `worker/admin.js` import enabled in `index.js`:
- As owner (`test` session): `curl.exe -i http://localhost:8787/api/admin/users -H "cookie: session=OWNER_SESSION"` → 200 with `friend1`/`friend2` listed `pending`.
- As `friend1` (pending): same call → 403 `admin only`.
- Approve: `curl.exe -i http://localhost:8787/api/admin/users/<friend1Id>/approve -X POST -H "cookie: session=OWNER_SESSION"` → 200; then `friend1` calling `/api/plan` succeeds (after Task 6).
- Delete: `curl.exe -i http://localhost:8787/api/admin/users/<friend2Id> -X DELETE -H "cookie: session=OWNER_SESSION"` → 200; the user disappears from the list.
- Self-delete guard: owner deleting own id → 409.

- [ ] **Step 6: Commit**

```bash
git add worker/admin.js test/admin-logic.test.js
git commit -m "feat: admin endpoints (list/approve/delete) with last-admin and self guards"
```

---

## Task 6: Per-user plan isolation + lazy default seeding

**Files:**
- Modify: `worker/plan.js`, `worker/mj.js`
- Test: `test/plan-seed.test.js`

- [ ] **Step 1: Write the failing test for the seed-row builder**

Create `test/plan-seed.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSeedConfigJson } from "../worker/plan.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

test("buildSeedConfigJson serializes DEFAULT_CONFIG verbatim", () => {
  const json = buildSeedConfigJson();
  assert.deepEqual(JSON.parse(json), DEFAULT_CONFIG);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/plan-seed.test.js`
Expected: FAIL — `buildSeedConfigJson` is not exported.

- [ ] **Step 3: Implement per-user `loadRawPlan` with lazy seeding in `worker/plan.js`**

```js
import { json } from "./util.js";
import { DEFAULT_CONFIG } from "../src/lib/planConfig.js";

export function buildSeedConfigJson() {
  return JSON.stringify(DEFAULT_CONFIG);
}

// GET /api/plan -> { config, overrides } for the given user.
export async function loadRawPlan(env, userId) {
  let row = await env.DB.prepare(
    "SELECT config FROM plan_config WHERE user_id = ?",
  ).bind(userId).first();

  if (!row?.config) {
    // Lazy-seed a fresh user with a copy of the default plan.
    const now = new Date().toISOString();
    const seed = buildSeedConfigJson();
    await env.DB.prepare(
      "INSERT OR IGNORE INTO plan_config (user_id, config, updated_at) VALUES (?, ?, ?)",
    ).bind(userId, seed, now).run();
    row = { config: seed };
  }

  let config = DEFAULT_CONFIG;
  try { config = JSON.parse(row.config); }
  catch { console.error("plan_config JSON parse failed; using defaults"); }

  const overrides = {};
  const res = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ?",
  ).bind(userId).all();
  for (const r of (res.results || [])) {
    try { overrides[r.date] = JSON.parse(r.payload); }
    catch { console.error("skipping unparseable override", r.date); }
  }
  return { config, overrides };
}

export async function getPlan(env, user) {
  const { config, overrides } = await loadRawPlan(env, user.id);
  return json({ config, overrides });
}
```

- [ ] **Step 4: Update MJ to load the per-user plan**

In `worker/mj.js`, change the plan load inside `postMj` to pass the user id:

```js
  const raw = await loadRawPlan(env, user.id);
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/plan-seed.test.js`
Expected: PASS.

- [ ] **Step 6: Verify isolation end-to-end**

With `npx wrangler dev` running, owner (`test`) `GET /api/plan` returns the migrated dates. Approve `friend1` (Task 5b), then `friend1` `GET /api/plan` returns the DEFAULT_CONFIG dates and creates their `plan_config` row:
```
npx wrangler d1 execute grow-calendar-db --local --command "SELECT user_id FROM plan_config ORDER BY user_id;"
```
Expected: one row per user that has loaded their plan.

- [ ] **Step 7: Commit**

```bash
git add worker/plan.js worker/mj.js test/plan-seed.test.js
git commit -m "feat: per-user plan storage with lazy default-plan seeding"
```

---

## Task 7: Frontend API wrappers

**Files:**
- Modify: `src/lib/api.js`

- [ ] **Step 1: Add admin wrappers**

In `src/lib/api.js`, add to the `api` object (after `getPlan`):

```js
  adminListUsers: () => request("/api/admin/users"),
  approveUser: (id) => request(`/api/admin/users/${id}/approve`, { method: "POST" }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
```

- [ ] **Step 2: Verify the build still compiles**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.js
git commit -m "feat: admin API wrappers (list/approve/delete users)"
```

---

## Task 8: Auth context exposes signup

**Files:**
- Modify: `src/lib/auth.jsx`

- [ ] **Step 1: Add a `signup` action to the provider**

In `src/lib/auth.jsx`, add alongside `login`:

```js
  const signup = useCallback(async (username, password) => {
    const { user } = await api.signup(username, password);
    setUser(user);
  }, []);
```
and include `signup` in the context value:
```js
    <AuthContext.Provider value={{ user, loading, login, signup, logout, refresh }}>
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.jsx
git commit -m "feat: expose signup from the auth context"
```

---

## Task 9: Route on status; add PendingScreen

**Files:**
- Modify: `src/main.jsx`
- Create: `src/components/PendingScreen.jsx`

- [ ] **Step 1: Create `src/components/PendingScreen.jsx`**

```jsx
import { useAuth } from "../lib/auth.jsx";

export default function PendingScreen() {
  const { user, logout } = useAuth();
  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0a1a0d 0%, #1a3a1e 50%, #0d2410 100%)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 16, color: "#f0ebe0",
    }}>
      <div style={{
        width: "100%", maxWidth: 420, textAlign: "center",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 14, padding: "30px 24px",
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🌱</div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "#e8f5e3", marginBottom: 10 }}>
          Request received
        </div>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#c8d8c8" }}>
          Thanks, {user?.username}. Your account is waiting for the owner to approve it.
          Check back soon — once you are approved you will have full access to your grow.
        </p>
        <button
          onClick={logout}
          style={{
            marginTop: 18, padding: "9px 16px",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 10, color: "#cbd5cb",
            fontFamily: "'Courier New', monospace", fontSize: 12,
            letterSpacing: 1, cursor: "pointer",
          }}>
          LOG OUT
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Route on status in `src/main.jsx`**

Add the import and branch in `Root`:

```jsx
import PendingScreen from "./components/PendingScreen.jsx";
// ...
function Root() {
  const { user, loading } = useAuth();
  if (loading) return <Splash />;
  if (!user) return <LoginGate />;
  if (user.status !== "approved") return <PendingScreen />;
  return (
    <PlanProvider>
      <App />
    </PlanProvider>
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/main.jsx src/components/PendingScreen.jsx
git commit -m "feat: pending users see a holding screen until approved"
```

---

## Task 10: Signup mode in LoginGate

**Files:**
- Modify: `src/components/LoginGate.jsx`

- [ ] **Step 1: Add a login/signup mode toggle**

In `src/components/LoginGate.jsx`, pull `signup` from auth and add a `mode` state. Replace the component's auth call and add a toggle below the submit button.

At the top of `LoginGate`:
```jsx
  const { login, signup } = useAuth();
  const [mode, setMode] = useState("login"); // "login" | "signup"
```
Change the submit handler to branch:
```jsx
    try {
      if (mode === "signup") await signup(username.trim(), password);
      else await login(username.trim(), password);
    } catch (err) {
      setError(err.message || "something went wrong");
    } finally {
      setBusy(false);
    }
```
Change the submit button label:
```jsx
            {busy ? "..." : mode === "signup" ? "REQUEST ACCOUNT" : "LOG IN"}
```
Add a toggle directly after the `</form>` close (still inside the card):
```jsx
        <button
          type="button"
          onClick={() => { setError(""); setMode(mode === "login" ? "signup" : "login"); }}
          style={{
            marginTop: 14, width: "100%", background: "none", border: "none",
            color: "#5a8a5a", fontFamily: "'Courier New', monospace",
            fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>
          {mode === "login" ? "Need an account? Request one" : "Have an account? Log in"}
        </button>
```

- [ ] **Step 2: Verify end-to-end in the running app**

Run the full stack (`launch.bat`, or `npm run dev` + `npx wrangler dev`). At the login screen, click "Need an account? Request one", submit a new username/password, and confirm you land on the PendingScreen. Then log in as the owner, approve that user (after Task 11), and confirm they reach the app.

- [ ] **Step 3: Commit**

```bash
git add src/components/LoginGate.jsx
git commit -m "feat: request-an-account signup mode on the login screen"
```

---

## Task 11: Admin entry in Header + AdminPanel

**Files:**
- Modify: `src/components/Header.jsx`, `src/App.jsx`
- Create: `src/components/AdminPanel.jsx`

- [ ] **Step 1: Create `src/components/AdminPanel.jsx`**

```jsx
import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api.js";
import { useAuth } from "../lib/auth.jsx";

export default function AdminPanel({ onClose }) {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { users } = await api.adminListUsers();
      setUsers(users);
      setError("");
    } catch (err) {
      setError(err.message || "could not load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  async function act(fn, id) {
    try { await fn(id); await refresh(); }
    catch (err) { setError(err.message || "action failed"); }
  }

  const pending = users.filter(u => u.status === "pending");
  const members = users.filter(u => u.status === "approved");

  return (
    <div style={{ padding: 16, maxWidth: 560, margin: "0 auto", color: "#1a2e1a" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Members</h2>
        <button onClick={onClose} style={btn}>Close</button>
      </div>

      {error && <div style={errBox}>{error}</div>}
      {loading ? <div>Loading…</div> : (
        <>
          <Section title={`Pending requests (${pending.length})`}>
            {pending.length === 0 && <Empty>No pending requests.</Empty>}
            {pending.map(u => (
              <Row key={u.id} name={u.username} sub={`requested ${u.created_at?.slice(0,10) || ""}`}>
                <button style={btnGreen} onClick={() => act(api.approveUser, u.id)}>Approve</button>
                <button style={btnRed} onClick={() => act(api.deleteUser, u.id)}>Reject</button>
              </Row>
            ))}
          </Section>

          <Section title={`Members (${members.length})`}>
            {members.map(u => (
              <Row key={u.id} name={u.username} sub={u.role === "admin" ? "admin" : "member"}>
                {u.id !== user.id && u.role !== "admin" && (
                  <button style={btnRed} onClick={() => act(api.deleteUser, u.id)}>Remove</button>
                )}
              </Row>
            ))}
          </Section>
        </>
      )}
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "#5a8a5a", marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}
function Row({ name, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 12px", border: "1px solid #d8e6d8", borderRadius: 10, marginBottom: 8 }}>
      <div>
        <div style={{ fontWeight: 700 }}>{name}</div>
        <div style={{ fontSize: 12, color: "#6b836b" }}>{sub}</div>
      </div>
      <div style={{ display: "flex", gap: 8 }}>{children}</div>
    </div>
  );
}
function Empty({ children }) {
  return <div style={{ fontSize: 13, color: "#6b836b", fontStyle: "italic" }}>{children}</div>;
}
const btn = { padding: "6px 12px", border: "1px solid #c2d2c2", borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 13 };
const btnGreen = { ...btn, background: "#16a34a", color: "#fff", border: "none" };
const btnRed = { ...btn, background: "#dc2626", color: "#fff", border: "none" };
const errBox = { background: "#fde8e8", border: "1px solid #f5b5b5", color: "#a11", borderRadius: 8, padding: "8px 10px", marginBottom: 12, fontSize: 13 };
```

- [ ] **Step 2: Add the admin view toggle in `src/App.jsx`**

Add a view state and render the panel when active. Near the top of the `App` component body:
```jsx
import { useState } from "react";
import { useAuth } from "./lib/auth.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
// inside App():
  const { user } = useAuth();
  const [showAdmin, setShowAdmin] = useState(false);
  if (showAdmin) return <AdminPanel onClose={() => setShowAdmin(false)} />;
```
Pass an opener to the Header where it is rendered:
```jsx
  <Header onOpenAdmin={user.role === "admin" ? () => setShowAdmin(true) : null} />
```
(If `App` already destructures other context or props, merge these additions rather than duplicating.)

- [ ] **Step 3: Add the admin button in `src/components/Header.jsx`**

Accept the `onOpenAdmin` prop and render a small button only when it is provided:
```jsx
export default function Header({ onOpenAdmin, /* existing props */ }) {
  // ... existing header content ...
  // place near the existing header controls:
  {onOpenAdmin && (
    <button
      onClick={onOpenAdmin}
      title="Manage members"
      style={{
        background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
        borderRadius: 8, color: "#cbe6cb", fontSize: 12, padding: "5px 10px",
        cursor: "pointer", fontFamily: "'Courier New', monospace", letterSpacing: 1,
      }}>
      MEMBERS
    </button>
  )}
}
```
(Match the placement to the existing Header layout; if the Header has a controls row with logout, add the button there.)

- [ ] **Step 4: Verify end-to-end**

Run the full stack. As the owner, confirm a MEMBERS button appears, opens the panel, lists pending `friend1`, and Approve moves them to Members. Log in as `friend1` in another browser/profile and confirm they now reach the app with their own (default) plan. Confirm a non-admin never sees the MEMBERS button and `GET /api/admin/users` returns 403 for them.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/components/Header.jsx src/components/AdminPanel.jsx
git commit -m "feat: owner admin panel for approving and managing members"
```

---

## Task 12: Update DEV.md

**Files:**
- Modify: `DEV.md`

- [ ] **Step 1: Replace the "Account management" section**

Document the new model: self-signup creates pending accounts; the owner approves/rejects/removes via the in-app MEMBERS panel (admin only); the owner is the user with `role='admin'`. Note the migrations directory and how to apply `migrations/0001_multi_tenant.sql` locally and remotely. Add a one-line note that per-user MJ model routing (owner Claude / friends free Gemini) and the MJ daily cap arrive in Plan A2, and that until A2 ships, any approved user's MJ usage bills the owner's `ANTHROPIC_API_KEY`.

- [ ] **Step 2: Commit**

```bash
git add DEV.md
git commit -m "docs: document multi-tenant accounts, approval flow, and migrations"
```

---

## Task 13: Full local test pass

**Files:** none (verification)

- [ ] **Step 1: Run the whole unit suite**

Run: `npm test`
Expected: all tests pass, including `test/guard.test.js`, `test/admin-logic.test.js`, `test/plan-seed.test.js`, and the pre-existing `test/mj-logic.test.js`, `test/plan-text.test.js`.

- [ ] **Step 2: Build check**

Run: `npm run build`
Expected: build succeeds with no errors.

- [ ] **Step 3: Manual smoke (full stack)**

Run `launch.bat` (or `npm run dev` + `npx wrangler dev`). Walk the full flow: request an account → pending screen → owner approves → new user lands in app with their own default plan → owner removes a member → that member is logged out on next request. Confirm the owner's own plan/check-offs/notes are unchanged throughout.

---

## Task 14: Production rollout (owner-run, data-preserving)

**Files:** none (operational)

This task changes production. Run it deliberately; the backup is mandatory.

- [ ] **Step 1: Export a full remote backup (restore point)**

Run: `npx wrangler d1 export grow-calendar-db --remote --output ./backup-pre-A1.sql`
Expected: a SQL dump is written. Keep this file.

- [ ] **Step 2: Rehearse the migration on a copy**

Create a scratch local DB from the backup and run the migration against it, then verify the owner row, plan dates, check-offs, and notes survive:
```
npx wrangler d1 execute grow-calendar-db --local --file=./backup-pre-A1.sql
npx wrangler d1 execute grow-calendar-db --local --file=./migrations/0001_multi_tenant.sql
npx wrangler d1 execute grow-calendar-db --local --command "SELECT id, username, role, status FROM users; SELECT user_id FROM plan_config; SELECT COUNT(*) AS notes FROM day_notes; SELECT COUNT(*) AS checks FROM task_checkoffs;"
```
Expected: owner is `admin`/`approved`; `plan_config` has the owner's row; note/check-off counts match what you expect from production.

- [ ] **Step 3: Merge A1 to main**

Open a PR from `claude/multi-tenant-foundation` to `main`, get it green, and merge. Cloudflare auto-deploys the Worker on merge.

- [ ] **Step 4: Apply the migration to remote D1**

Run: `npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/0001_multi_tenant.sql`
Expected: completes without error.

- [ ] **Step 5: Verify production immediately**

- Owner logs in successfully on the live site.
- The calendar renders the same season and dates as before.
- A known previously checked-off day still shows checked; a known note still reads back.
- `GET /api/plan` (as owner) returns the same driving dates as `backup-pre-A1.sql` held.

If any check fails, restore: recreate the database contents from `backup-pre-A1.sql` (or use D1 Time Travel: `npx wrangler d1 time-travel restore grow-calendar-db --timestamp <pre-migration ISO time>`), and investigate before retrying.

- [ ] **Step 6: (Deferred) secrets and friends**

Do NOT approve non-owner users yet. Per-user free-Gemini routing lands in Plan A2; until then an approved user's MJ would use the owner's Claude key. The owner may set `ANTHROPIC_API_KEY` now for their own MJ. `GEMINI_API_KEY` and opening MJ to friends happen in A2.

---

## Self-review notes

- **Spec coverage:** role/status + owner promotion (T1, T2), reopened pending signup + rate limit (T3), central gating + requireApproved/requireAdmin (T4, T5), admin list/approve/delete with self/last-admin guards (T5b), per-user plan isolation + lazy seed + MJ plan load (T6), frontend status routing + pending screen + signup mode + admin panel + api wrappers (T7-T11), data-preservation backup/rehearse/verify rollout (T14). MJ model routing + daily cap are intentionally deferred to Plan A2 and called out in the header and T14.
- **Placeholders:** none; each code step shows complete code. The Header/App steps say to merge into existing layout because those files' surrounding markup is project-specific; the added code itself is complete.
- **Type consistency:** user object shape `{ id, username, role, status }` is consistent across `currentUser`, `getMe`, `login`, `signup`, the router, handlers, and the frontend. `loadRawPlan(env, userId)` signature is updated at both call sites (`getPlan`, `postMj`). `canDeleteUser({ actingId, targetId, targetRole, adminCount })` matches its test and its caller in `deleteUser`.
