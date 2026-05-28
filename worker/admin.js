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

  // FKs cascade sessions, task_checkoffs, day_notes, plan_config,
  // plan_day_overrides, and mj_usage.
  await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetId).run();
  return json({ ok: true });
}
