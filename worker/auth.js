import {
  json, error, nowIso,
  bytesToBase64, base64ToBytes, bytesToBase64Url,
  parseCookies, sessionCookie, clearSessionCookie, isHttps,
} from "./util.js";

const PBKDF2_ITERATIONS = 100_000;
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MIN_PASSWORD_LENGTH = 8;
const MAX_USERNAME_LENGTH = 32;
const USERNAME_RE = /^[a-zA-Z0-9_-]{2,32}$/;

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_SECONDS = 15 * 60; // 15 minutes

async function hashPassword(password, saltBytes) {
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

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getClientIp(request) {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    "unknown"
  );
}

async function checkRateLimit(env, ip, username) {
  const key = `${ip}:${username.toLowerCase()}`;
  const row = await env.DB.prepare(
    "SELECT attempts, locked_until FROM login_attempts WHERE key = ?",
  ).bind(key).first();

  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    const retryAfter = Math.ceil((new Date(row.locked_until) - Date.now()) / 1000);
    return { blocked: true, retryAfter };
  }
  return { blocked: false };
}

async function recordFailedAttempt(env, ip, username) {
  const key = `${ip}:${username.toLowerCase()}`;
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
  const key = `${ip}:${username.toLowerCase()}`;
  await env.DB.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}

export async function getSignupStatus(env) {
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  return json({ open: (row?.n ?? 0) === 0 });
}

export async function getMe(request, env) {
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");
  return json({ user: { id: user.id, username: user.username, role: user.role, status: user.status } });
}

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

  const userCount = await env.DB.prepare("SELECT COUNT(*) AS n FROM users").first();
  if ((userCount?.n ?? 0) > 0) {
    return error(403, "signup is closed");
  }

  const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
  if (existing) return error(409, "username already taken");

  const { salt, hash } = await hashPassword(password);
  const createdAt = nowIso();
  const result = await env.DB.prepare(
    "INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)",
  ).bind(username, hash, salt, createdAt).run();

  const userId = result.meta.last_row_id;
  return finishLogin(request, env, { id: userId, username, role: "user", status: "pending" });
}

export async function login(request, env) {
  const body = await safeJson(request);
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
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true }, {
    headers: { "set-cookie": clearSessionCookie(isHttps(request)) },
  });
}

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

async function safeJson(request) {
  try { return await request.json(); }
  catch { return null; }
}
