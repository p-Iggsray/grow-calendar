// @ts-check
import { json, error, nowIso, bytesToBase64Url } from "./util.js";
import { loadRawPlan } from "./plan.js";

function genToken() {
  const bytes = new Uint8Array(24); // 24 bytes → 32-char base64url
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

// GET /api/share — return the caller's current token (or null)
export async function getShareToken(env, user) {
  const row = await env.DB.prepare(
    "SELECT token, created_at FROM share_tokens WHERE user_id = ?"
  ).bind(user.id).first();
  return json({ token: row?.token ?? null, createdAt: row?.created_at ?? null });
}

// POST /api/share — create or rotate the token
export async function createShareToken(env, user) {
  const token = genToken();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO share_tokens (token, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`
  ).bind(token, user.id, now).run();
  return json({ token, createdAt: now });
}

// DELETE /api/share — revoke
export async function deleteShareToken(env, user) {
  await env.DB.prepare("DELETE FROM share_tokens WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true });
}

// GET /api/share/:token — public endpoint, no auth required.
// Returns a read-only snapshot: config + generatedPlan + phaseOverrides only.
// No personal info (email, role, logs, media).
export async function getSharedView(env, token) {
  if (!token || token.length > 60) return error(400, "invalid token");

  const row = await env.DB.prepare(
    "SELECT user_id FROM share_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) return error(404, "share link not found or has been revoked");

  const plan = await loadRawPlan(env, row.user_id);
  if (!plan || plan.needsSetup) return error(404, "grow not set up yet");

  return json({
    config: plan.config,
    generatedPlan: plan.generatedPlan,
    phaseOverrides: plan.phaseOverrides,
  });
}
