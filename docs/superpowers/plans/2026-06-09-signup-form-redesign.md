# Signup Form Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove email from signup, add first name and last name fields, and move the legal/privacy disclaimer to the signup screen only.

**Architecture:** Changes flow bottom-up through three layers. The worker layer (worker/auth.js) loses email validation and gains first_name/last_name storage. The frontend call chain (api.js, auth.jsx) updates signatures. The form (LoginGate.jsx) swaps fields and conditionally renders the disclaimer. A DB migration adds the two new columns and must be applied to the remote D1 database before the updated worker is deployed.

**Tech Stack:** React (Vite), Cloudflare Workers, D1 (SQLite), Node built-in test runner (`node --test`)

---

### Task 1: Add validateName to worker/auth.js (TDD)

**Files:**
- Modify: `worker/auth.js`
- Test: `test/auth-helpers.test.js`

- [ ] **Step 1: Write the failing tests**

Open `test/auth-helpers.test.js`. Add these tests at the bottom of the file, after the existing `retryAfterSeconds` block. Also add `validateName` to the existing import at the top of the file:

```js
// Updated import line at top of test/auth-helpers.test.js:
import {
  validateUsername,
  validatePassword,
  loginAttemptKey,
  retryAfterSeconds,
  validateName,
} from "../worker/auth.js";
```

```js
// --- validateName -------------------------------------------------------------

test("validateName accepts normal first and last names", () => {
  assert.equal(validateName("Parker", "first name"), null);
  assert.equal(validateName("O'Brien", "last name"), null);
  assert.equal(validateName("A".repeat(50), "first name"), null);
});

test("validateName rejects empty or whitespace-only values", () => {
  assert.match(validateName("", "first name"), /first name required/);
  assert.match(validateName("   ", "last name"), /last name required/);
  assert.match(validateName(null, "first name"), /first name required/);
  assert.match(validateName(undefined, "last name"), /last name required/);
});

test("validateName rejects values over 50 characters", () => {
  assert.match(validateName("A".repeat(51), "first name"), /50 characters/);
  assert.match(validateName("B".repeat(51), "last name"), /50 characters/);
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

```bash
node --test test/auth-helpers.test.js
```

Expected: tests referencing `validateName` fail with `validateName is not a function` or similar.

- [ ] **Step 3: Add validateName to worker/auth.js**

Open `worker/auth.js`. Add this function directly after `validatePassword` (around line 45):

```js
/**
 * @param {unknown} value
 * @param {string} label  e.g. "first name" or "last name"
 * @returns {string | null}
 */
export function validateName(value, label) {
  if (typeof value !== "string" || !value.trim()) return `${label} required`;
  if (value.trim().length > 50) return `${label} must be 50 characters or fewer`;
  return null;
}
```

- [ ] **Step 4: Update the signup handler in worker/auth.js**

Locate the `signup` function (around line 177). Replace its body with the version below. Key changes: remove `email` and `EMAIL_RE`, add `firstName`/`lastName`, update DB insert.

First, delete the `EMAIL_RE` constant near the top of the file (line 16):
```js
// DELETE this line:
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
```

Then replace the `signup` function body:

```js
export async function signup(request, env) {
  const parsed = await safeJsonBounded(request, MAX_AUTH_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  if (!body) return error(400, "invalid json");
  const username  = String(body.username  || "").trim();
  const firstName = String(body.firstName || "").trim();
  const lastName  = String(body.lastName  || "").trim();
  const password  = String(body.password  || "");

  const usernameErr = validateUsername(username);
  if (usernameErr) return error(400, usernameErr);
  const firstNameErr = validateName(firstName, "first name");
  if (firstNameErr) return error(400, firstNameErr);
  const lastNameErr = validateName(lastName, "last name");
  if (lastNameErr) return error(400, lastNameErr);
  const passwordErr = validatePassword(password);
  if (passwordErr) return error(400, passwordErr);

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
    return error(409, "username unavailable");
  }

  const { salt, hash } = await hashPassword(password);
  const createdAt = nowIso();
  const result = await env.DB.prepare(
    "INSERT INTO users (username, first_name, last_name, password_hash, password_salt, created_at, role, status) VALUES (?, ?, ?, ?, ?, ?, 'user', 'pending')",
  ).bind(username, firstName, lastName, hash, salt, createdAt).run();

  await clearRateLimit(env, ip, username);
  const userId = result.meta.last_row_id;
  return finishLogin(request, env, {
    id: userId, username, role: "user", status: "pending",
  });
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

```bash
node --test test/auth-helpers.test.js
```

Expected: all tests pass including the new `validateName` tests.

- [ ] **Step 6: Run the full test suite to check for regressions**

```bash
node --test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add worker/auth.js test/auth-helpers.test.js
git commit -m "feat: replace email with first/last name in signup handler"
```

---

### Task 2: DB migration and schema.sql

**Files:**
- Create: `migrations/002_first_last_name.sql`
- Modify: `schema.sql`

- [ ] **Step 1: Create the migration file**

Create `migrations/002_first_last_name.sql` with this content:

```sql
-- Adds first_name and last_name to the users table.
-- Run against the remote DB before deploying the updated worker:
--   npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/002_first_last_name.sql
ALTER TABLE users ADD COLUMN first_name TEXT;
ALTER TABLE users ADD COLUMN last_name TEXT;
```

- [ ] **Step 2: Update schema.sql**

Open `schema.sql`. In the `CREATE TABLE IF NOT EXISTS users` block, add the two new columns after the `username` line and before `password_hash`. Also add a migration comment at the bottom of the file.

Find this block:

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  email         TEXT
);
```

Replace with:

```sql
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  first_name    TEXT,
  last_name     TEXT,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user',
  status        TEXT NOT NULL DEFAULT 'pending',
  email         TEXT
);
```

Then at the bottom of schema.sql, add this line in the existing migration comments section:

```sql
-- Migration for existing databases: ALTER TABLE users ADD COLUMN first_name TEXT; ALTER TABLE users ADD COLUMN last_name TEXT;
```

- [ ] **Step 3: Commit**

```bash
git add migrations/002_first_last_name.sql schema.sql
git commit -m "feat: add first_name and last_name columns to users schema"
```

---

### Task 3: Update frontend call chain (api.js and auth.jsx)

**Files:**
- Modify: `src/lib/api.js`
- Modify: `src/lib/auth.jsx`

- [ ] **Step 1: Update api.js**

Open `src/lib/api.js`. Find this line (around line 47):

```js
  signup: (username, email, password) =>
    request("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, email, password }) }),
```

Replace with:

```js
  signup: (username, firstName, lastName, password) =>
    request("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, firstName, lastName, password }) }),
```

- [ ] **Step 2: Update auth.jsx**

Open `src/lib/auth.jsx`. Find this block (around line 28):

```js
  const signup = useCallback(async (username, email, password) => {
    const { user } = await api.signup(username, email, password);
    setUser(user);
  }, []);
```

Replace with:

```js
  const signup = useCallback(async (username, firstName, lastName, password) => {
    const { user } = await api.signup(username, firstName, lastName, password);
    setUser(user);
  }, []);
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.js src/lib/auth.jsx
git commit -m "feat: update signup call chain to use first/last name instead of email"
```

---

### Task 4: Update LoginGate.jsx form UI

**Files:**
- Modify: `src/components/LoginGate.jsx`

- [ ] **Step 1: Update state declarations**

Open `src/components/LoginGate.jsx`. Find the state block near the top of `LoginGate` (around line 24):

```js
  const [username,        setUsername]        = useState("");
  const [email,           setEmail]           = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
```

Replace with:

```js
  const [username,        setUsername]        = useState("");
  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]        = useState("");
  const [password,        setPassword]        = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
```

- [ ] **Step 2: Update the signup call inside handleSubmit**

Find this line inside `handleSubmit` (around line 59):

```js
        await signup(username.trim(), email.trim(), password);
```

Replace with:

```js
        await signup(username.trim(), firstName.trim(), lastName.trim(), password);
```

- [ ] **Step 3: Update submitDisabled**

Find this block (around line 81):

```js
  const submitDisabled = busy || (
    mode === "login"  ? (!username || !password) :
    mode === "signup" ? (!username || !email || !password) :
    mode === "reset"  ? (!password || !confirmPassword) :
    false
  );
```

Replace with:

```js
  const submitDisabled = busy || (
    mode === "login"  ? (!username || !password) :
    mode === "signup" ? (!username || !firstName || !lastName || !password) :
    mode === "reset"  ? (!password || !confirmPassword) :
    false
  );
```

- [ ] **Step 4: Swap the email field for first name and last name fields in the form**

Find this block in the JSX (around line 127):

```jsx
            {/* Email — signup only */}
            {mode === "signup" && (
              <Field label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" />
            )}
```

Replace with:

```jsx
            {/* Name fields — signup only */}
            {mode === "signup" && (
              <>
                <Field label="First name" value={firstName} onChange={setFirstName} autoComplete="given-name" />
                <Field label="Last name"  value={lastName}  onChange={setLastName}  autoComplete="family-name" />
              </>
            )}
```

- [ ] **Step 5: Move the legal/privacy block to signup-only**

Find this block near the bottom of the card JSX (around line 196):

```jsx
        {/* Legal / privacy disclaimer — public entry screen */}
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--c-surface-2)", fontFamily: "'Courier New', monospace" }}>
```

The full block runs to the closing `</div>` before the card's closing `</div>`. Wrap the entire block in `{mode === "signup" && (...)}`:

```jsx
        {/* Legal / privacy disclaimer — signup screen only */}
        {mode === "signup" && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--c-surface-2)", fontFamily: "'Courier New', monospace" }}>
            <p style={{ fontSize: 10, lineHeight: 1.6, color: "var(--c-text-faint)", margin: 0 }}>
              For educational and personal record-keeping only — not medical, legal, or professional cultivation advice. Intended for adults of legal age. You are responsible for complying with the cannabis laws in your area.
            </p>
            <details style={{ marginTop: 8 }}>
              <summary style={{ fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", cursor: "pointer", textTransform: "uppercase" }}>Privacy</summary>
              <p style={{ fontSize: 10, lineHeight: 1.6, color: "var(--c-text-faint)", margin: "6px 0 0" }}>
                Your account and grow data are stored privately to run the app and are never sold. AI features send your grow details to Google&apos;s Gemini API to generate replies. Ask the admin to delete your account and data at any time.
              </p>
            </details>
          </div>
        )}
```

- [ ] **Step 6: Commit**

```bash
git add src/components/LoginGate.jsx
git commit -m "feat: add first/last name to signup form, move disclaimer to signup screen"
```

---

### Task 5: Apply migration and smoke test

**Files:** None modified — this is a deployment and verification task.

- [ ] **Step 1: Apply the migration to the remote D1 database**

Run this command (you must run this yourself — it mutates the remote database):

```
npx wrangler d1 execute grow-calendar-db --remote --file=./migrations/002_first_last_name.sql
```

Expected output: success with no errors. If you see "duplicate column name", the columns already exist and you can proceed.

- [ ] **Step 2: Verify the migration applied**

```
npx wrangler d1 execute grow-calendar-db --remote --command="PRAGMA table_info(users);"
```

Expected: the output includes rows for `first_name` and `last_name`.

- [ ] **Step 3: Run the full test suite one last time**

```bash
node --test
```

Expected: all tests pass.

- [ ] **Step 4: Manual browser smoke test**

Start the dev server:

```bash
npm run dev
```

Then in the browser:

1. Open the app. Confirm the login screen shows no disclaimer text at the bottom.
2. Click "Need an account? Request one". Confirm:
   - The form now shows: Username, First name, Last name, Password (in that order).
   - No Email field is present.
   - The legal/privacy disclaimer appears at the bottom.
3. Fill in all four fields and submit. Confirm the pending screen appears (signup creates an account with `status: pending`).
4. Switch back to the login screen. Confirm the disclaimer is gone again.
