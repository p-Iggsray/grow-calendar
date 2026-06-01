import { json, error, bytesToBase64Url } from "./util.js";
import { hashPassword, getClientIp } from "./auth.js";
import { sendPasswordResetEmail } from "./email.js";
import { logError } from "./log.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 15 * 60;

async function isRateLimited(env, ip) {
  const key = `reset:${ip}`;
  const row = await env.DB.prepare(
    "SELECT locked_until FROM login_attempts WHERE key = ?"
  ).bind(key).first();
  if (!row?.locked_until) return false;
  return new Date(row.locked_until).getTime() > Date.now();
}

async function recordAttempt(env, ip) {
  const key = `reset:${ip}`;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO login_attempts (key, attempts, locked_until, updated_at)
    VALUES (?, 1, NULL, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = attempts + 1, locked_until = NULL, updated_at = excluded.updated_at
  `).bind(key, now).run();
  const row = await env.DB.prepare("SELECT attempts FROM login_attempts WHERE key = ?").bind(key).first();
  if ((row?.attempts ?? 0) >= RATE_LIMIT_MAX) {
    const lockedUntil = new Date(Date.now() + RATE_LIMIT_WINDOW_SECONDS * 1000).toISOString();
    await env.DB.prepare("UPDATE login_attempts SET locked_until = ? WHERE key = ?").bind(lockedUntil, key).run();
  }
}

export async function postForgotPassword(request, env) {
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || !EMAIL_RE.test(email)) return error(400, "valid email required");

  const ip = getClientIp(request);
  if (await isRateLimited(env, ip)) return error(429, "too many requests, please try again later");
  await recordAttempt(env, ip);

  // Always return the same response — prevents email enumeration.
  const success = json({ ok: true });

  const user = await env.DB.prepare(
    "SELECT id FROM users WHERE lower(email) = ?"
  ).bind(email).first();
  if (!user) return success;

  // One active token per user at a time.
  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(user.id),
    env.DB.prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).bind(token, user.id, expiresAt),
  ]);

  const origin = new URL(request.url).origin;
  const resetUrl = `${origin}?reset=${token}`;

  try {
    await sendPasswordResetEmail(env, { to: email, resetUrl });
  } catch (err) {
    logError("reset-email-send-failed", { message: String(err?.message) });
  }

  return success;
}

export async function postResetPassword(request, env) {
  let body;
  try { body = await request.json(); } catch { return error(400, "invalid json"); }

  const token       = typeof body?.token       === "string" ? body.token.trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword  : "";

  if (!token) return error(400, "token required");
  if (newPassword.length < 8) return error(400, "password must be at least 8 characters");

  const row = await env.DB.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ?"
  ).bind(token).first();

  if (!row) return error(400, "invalid or expired reset link");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(token).run();
    return error(400, "reset link has expired — please request a new one");
  }

  const { salt, hash } = await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .bind(hash, salt, row.user_id),
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(token),
  ]);

  return json({ ok: true });
}
