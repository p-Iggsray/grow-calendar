import { json, error, bytesToBase64Url, safeJsonBounded } from "./util.js";
import { hashPassword, hashToken } from "./auth.js";

// Admin-generated reset links are sent to the user out-of-band (text/DM), so
// give them a comfortable window — there is no self-service email reset.
const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// POST /api/admin/users/:id/reset-link
// Admin-only (gated by the caller). Mints a one-time password-reset token for
// the target user and returns the link for the admin to pass along. Replaces
// any existing token for that user, so only the newest link works.
export async function postAdminResetLink(request, env, targetUserId) {
  const target = await env.DB.prepare(
    "SELECT id, username FROM users WHERE id = ?"
  ).bind(targetUserId).first();
  if (!target) return error(404, "user not found");

  const token = bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").bind(target.id),
    env.DB.prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
    ).bind(await hashToken(token), target.id, expiresAt),
  ]);

  const origin = new URL(request.url).origin;
  return json({ resetUrl: `${origin}?reset=${token}`, expiresAt, username: target.username });
}

export async function postResetPassword(request, env) {
  let body;
  { const p = await safeJsonBounded(request, 1024); if (!p.ok) return error(p.status, p.error); body = p.data; }

  const token       = typeof body?.token       === "string" ? body.token.trim() : "";
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword  : "";

  if (!token) return error(400, "token required");
  if (newPassword.length < 8) return error(400, "password must be at least 8 characters");

  const tokenHash = await hashToken(token);
  const row = await env.DB.prepare(
    "SELECT * FROM password_reset_tokens WHERE token = ?"
  ).bind(tokenHash).first();

  if (!row) return error(400, "invalid or expired reset link");
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(tokenHash).run();
    return error(400, "reset link has expired — please ask the admin for a new one");
  }

  const { salt, hash } = await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .bind(hash, salt, row.user_id),
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(tokenHash),
  ]);

  return json({ ok: true });
}
