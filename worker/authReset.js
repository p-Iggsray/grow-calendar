import { json, error, safeJsonBounded } from "./util.js";
import { hashPassword, hashToken } from "./auth.js";

// Redeems a one-time password-reset token. There is no in-app way to mint one
// any more (that lived in the deleted admin panel), so a token has to be
// inserted into password_reset_tokens directly.

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
    return error(400, "reset link has expired - please ask the admin for a new one");
  }

  const { salt, hash } = await hashPassword(newPassword);

  await env.DB.batch([
    env.DB.prepare("UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?")
      .bind(hash, salt, row.user_id),
    env.DB.prepare("DELETE FROM password_reset_tokens WHERE token = ?").bind(tokenHash),
  ]);

  return json({ ok: true });
}
