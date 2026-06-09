// @ts-check
import {
  json, error, nowIso,
  bytesToBase64, base64ToBytes, bytesToBase64Url,
  parseCookies, sessionCookie, clearSessionCookie, isHttps,
  safeJsonBounded,
} from "./util.js";

const MAX_AUTH_REQUEST_BYTES = 1024;

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MIN_PASSWORD_LENGTH = 8;
const USERNAME_RE = /^[a-zA-Z0-9_-]{2,32}$/;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

/**
 * Pure input validators - exported for unit testing.
 * Return null on success, an error message on failure.
 * @param {unknown} username
 * @returns {string | null}
 */
export function validateUsername(username) {
  if (typeof username !== "string") return "username required";
  const trimmed = username.trim();
  if (!USERNAME_RE.test(trimmed)) {
    return "username must be 2-32 chars, letters/numbers/underscore/hyphen only";
  }
  return null;
}
/**
 * @param {unknown} password
 * @returns {string | null}
 */
export function validatePassword(password) {
  if (typeof password !== "string") return "password required";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

/**
 * Stable composite key for login_attempts. Lowercased so attempts against
 * 'Alice' and 'ALICE' from the same IP share a counter.
 * @param {string} ip
 * @param {string} username
 * @returns {string}
 */
export function loginAttemptKey(ip, username) {
  return `${ip}:${String(username).toLowerCase()}`;
}

/**
 * Pure helper around the DB-resident lockout row. Returns null when the
 * lockout has expired or there's no lock.
 * @param {string | null | undefined} lockedUntilIso
 * @param {number} nowMs
 * @returns {number | null}
 */
export function retryAfterSeconds(lockedUntilIso, nowMs) {
  if (!lockedUntilIso) return null;
  const until = Date.parse(lockedUntilIso);
  if (!Number.isFinite(until) || until <= nowMs) return null;
  return Math.ceil((until - nowMs) / 1000);
}

// Sliding session rotation: every authenticated request whose session is older
// than this threshold gets a fresh token. Caps the replay window of a stolen
// cookie to ~SESSION_ROTATE_AFTER_MS from the moment of theft, without forcing
// the user to log back in. The OLD token stays valid for ROTATION_GRACE_MS so
// concurrent in-flight requests from other tabs don't get bumped to 401.
export const SESSION_ROTATE_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const ROTATION_GRACE_MS = 60 * 1000; // 60 seconds

export function shouldRotate(createdAtIso, nowMs) {
  const created = Date.parse(createdAtIso);
  if (!Number.isFinite(created)) return false;
  return nowMs - created >= SESSION_ROTATE_AFTER_MS;
}

export async function hashPassword(password, saltBytes) {
  const salt = saltBytes || crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256,
  );
  return { salt: bytesToBase64(salt), hash: bytesToBase64(new Uint8Array(bits)) };
}

function newSessionToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

// Session and reset tokens are stored hashed at rest, so a database read can't
// be used to impersonate a user or hijack a reset. The high-entropy token only
// ever lives in the cookie / reset URL; we look up by its SHA-256.
export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

async function checkRateLimit(env, ip, username) {
  const key = loginAttemptKey(ip, username);
  const row = await env.DB.prepare(
    "SELECT attempts, locked_until FROM login_attempts WHERE key = ?",
  ).bind(key).first();

  const retryAfter = retryAfterSeconds(row?.locked_until, Date.now());
  if (retryAfter !== null) return { blocked: true, retryAfter };
  return { blocked: false };
}

async function recordFailedAttempt(env, ip, username) {
  const key = loginAttemptKey(ip, username);
  const now = nowIso();

  await env.DB.prepare(`
    INSERT INTO login_attempts (key, attempts, locked_until, updated_at)
    VALUES (?, 1, NULL, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = attempts + 1,
      locked_until = NULL,
      updated_at = excluded.updated_at
  `).bind(key, now).run();

  const row = await env.DB.prepare(
    "SELECT attempts FROM login_attempts WHERE key = ?",
  ).bind(key).first();

  if ((row?.attempts ?? 0) >= MAX_LOGIN_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + LOCKOUT_SECONDS * 1000).toISOString();
    await env.DB.prepare(
      "UPDATE login_attempts SET locked_until = ? WHERE key = ?",
    ).bind(lockedUntil, key).run();
  }
}

async function clearRateLimit(env, ip, username) {
  const key = loginAttemptKey(ip, username);
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

export async function getMe(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  return json({ user: { id: user.id, username: user.username, role: user.role, status: user.status } });
}

export async function signup(request, env) {
  const parsed = await safeJsonBounded(request, MAX_AUTH_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  if (!body) return error(400, "invalid json");
  const username = String(body.username || "").trim();
  const email    = String(body.email    || "").trim().toLowerCase();
  const password = String(body.password || "");

  const usernameErr = validateUsername(username);
  if (usernameErr) return error(400, usernameErr);
  if (!email || !EMAIL_RE.test(email)) return error(400, "valid email required");
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
    // Don't volunteer that the username exists. Rate-limit (above) caps bulk
    // enumeration. Generic phrasing slows targeted probing without breaking UX.
    await recordFailedAttempt(env, ip, username);
    return error(409, "username unavailable");
  }

  const { salt, hash } = await hashPassword(password);
  const createdAt = nowIso();
  const result = await env.DB.prepare(
    "INSERT INTO users (username, email, password_hash, password_salt, created_at, role, status) VALUES (?, ?, ?, ?, ?, 'user', 'pending')",
  ).bind(username, email, hash, salt, createdAt).run();

  await clearRateLimit(env, ip, username);
  const userId = result.meta.last_row_id;
  return finishLogin(request, env, {
    id: userId, username, role: "user", status: "pending",
  });
}

export async function login(request, env) {
  const parsed = await safeJsonBounded(request, MAX_AUTH_REQUEST_BYTES);
  if (!parsed.ok) return error(parsed.status, parsed.error);
  const body = parsed.data;
  if (!body) return error(400, "invalid json");
  const username = String(body.username || "").trim();
  const password = String(body.password || "");
  if (!username || !password) return error(400, "username and password required");

  const ip = getClientIp(request);
  const rateCheck = await checkRateLimit(env, ip, username);
  if (rateCheck.blocked) {
    return json(
      { error: "too many failed attempts, please try again later" },
      { status: 429, headers: { "retry-after": String(rateCheck.retryAfter) } },
    );
  }

  const user = await env.DB.prepare(
    "SELECT id, username, password_hash, password_salt, role, status FROM users WHERE username = ?",
  ).bind(username).first();

  if (!user) {
    await hashPassword(password, base64ToBytes("AAAAAAAAAAAAAAAAAAAAAA=="));
    await recordFailedAttempt(env, ip, username);
    return error(401, "invalid credentials");
  }

  const { hash } = await hashPassword(password, base64ToBytes(user.password_salt));
  if (!constantTimeEqual(hash, user.password_hash)) {
    await recordFailedAttempt(env, ip, username);
    return error(401, "invalid credentials");
  }

  await clearRateLimit(env, ip, username);
  return finishLogin(request, env, {
    id: user.id, username: user.username, role: user.role, status: user.status,
  });
}

export async function logout(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.session;
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(await hashToken(token)).run();
  }
  return json({ ok: true }, {
    headers: { "set-cookie": clearSessionCookie(isHttps(request)) },
  });
}

export async function currentUser(request, env) {
  const cookies = parseCookies(request.headers.get("cookie"));
  const token = cookies.session;
  if (!token) return null;
  const tokenHash = await hashToken(token);

  const row = await env.DB.prepare(`
    SELECT u.id, u.username, u.role, u.status, s.expires_at, s.created_at
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).bind(tokenHash).first();

  if (!row) return null;
  const nowMs = Date.now();
  if (new Date(row.expires_at).getTime() < nowMs) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(tokenHash).run();
    return null;
  }

  const base = { id: row.id, username: row.username, role: row.role, status: row.status };
  if (!shouldRotate(row.created_at, nowMs)) return base;

  // Rotate: issue a new token, mark the old one to expire after the grace
  // window. Two parallel tabs will both still authenticate during the grace.
  const newToken = newSessionToken();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SESSION_TTL_SECONDS * 1000).toISOString();
  const oldGraceEnd = new Date(nowMs + ROTATION_GRACE_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
    ).bind(await hashToken(newToken), row.id, createdAt, expiresAt),
    env.DB.prepare(
      "UPDATE sessions SET expires_at = ? WHERE token = ? AND expires_at > ?",
    ).bind(oldGraceEnd, tokenHash, oldGraceEnd),
  ]);
  return { ...base, rotateTo: newToken };
}

// Used by the router to layer a rotated session cookie on top of whatever
// response the handler produced. No-op if the session didn't rotate.
export function attachSessionCookie(response, request, newToken) {
  if (!newToken) return response;
  const copy = new Response(response.body, response);
  copy.headers.append("set-cookie", sessionCookie(newToken, SESSION_TTL_SECONDS, isHttps(request)));
  return copy;
}

async function finishLogin(request, env, user) {
  const token = newSessionToken();
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  ).bind(await hashToken(token), user.id, createdAt, expiresAt).run();

  return json({ user: { id: user.id, username: user.username, role: user.role, status: user.status } }, {
    headers: { "set-cookie": sessionCookie(token, SESSION_TTL_SECONDS, isHttps(request)) },
  });
}

