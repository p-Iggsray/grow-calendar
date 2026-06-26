// @ts-check
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

  // Delete all of the user's data explicitly rather than relying on FK cascade:
  // D1 does not always enforce foreign keys, and the per-day tables are rebuilt
  // at runtime (perDayScope.js). Filter to tables that actually exist so this
  // works across DBs at different migration states, then run as one batch.
  const existing = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table'",
  ).all();
  const names = new Set((existing.results ?? []).map(r => r.name));
  const stmts = USER_OWNED_TABLES
    .filter(t => names.has(t))
    .map(t => env.DB.prepare(`DELETE FROM ${t} WHERE user_id = ?`).bind(targetId));
  stmts.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId));
  await env.DB.batch(stmts);
  return json({ ok: true });
}

// Every table that stores rows keyed by user_id, deleted when an account is
// removed (GDPR "delete my data"). Order doesn't matter — it's one batch.
const USER_OWNED_TABLES = [
  "sessions", "password_reset_tokens", "share_tokens", "push_subscriptions",
  "task_checkoffs", "task_notes", "day_notes", "grow_log", "plant_log",
  "plan_day_overrides", "plan_config", "grows", "mj_conversations",
  "mj_usage", "plan_gen_usage", "client_errors",
];
