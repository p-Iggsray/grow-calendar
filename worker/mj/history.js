// @ts-check
// Conversation thread storage + the GET/DELETE /mj/history handlers.
import { json } from "../util.js";
import { MAX_HISTORY_ROWS } from "./constants.js";

// Lazily add grow_id column + index so existing deployments migrate automatically.
export async function ensureMjThreadSchema(env) {
  try {
    await env.DB.prepare("ALTER TABLE mj_conversations ADD COLUMN grow_id TEXT").run();
  } catch { /* column already exists - normal */ }
  try {
    await env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_mj_conv_user_grow ON mj_conversations(user_id, grow_id, id DESC)"
    ).run();
  } catch { /* index already exists */ }
}

// growId = null → general thread (grow_id IS NULL); string → grow-specific thread
export async function loadHistory(env, userId, limit, growId) {
  const rows = await env.DB.prepare(
    growId
      ? "SELECT role, content, actions FROM mj_conversations WHERE user_id = ? AND grow_id = ? ORDER BY id DESC LIMIT ?"
      : "SELECT role, content, actions FROM mj_conversations WHERE user_id = ? AND grow_id IS NULL ORDER BY id DESC LIMIT ?",
  ).bind(...(growId ? [userId, growId, limit] : [userId, limit])).all();
  return (rows.results ?? []).reverse().map(r => ({
    role: r.role,
    content: r.content,
    actions: r.actions ? JSON.parse(r.actions) : undefined,
  }));
}

export async function saveConversation(env, userId, growId, userContent, assistantContent, actions) {
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, grow_id, role, content) VALUES (?, ?, 'user', ?)",
    ).bind(userId, growId ?? null, userContent),
    env.DB.prepare(
      "INSERT INTO mj_conversations (user_id, grow_id, role, content, actions) VALUES (?, ?, 'assistant', ?, ?)",
    ).bind(userId, growId ?? null, assistantContent, actions.length > 0 ? JSON.stringify(actions) : null),
  ]);
}

export async function getMjHistory(request, env, user) {
  await ensureMjThreadSchema(env);
  const growId = new URL(request.url).searchParams.get("growId") || null;
  const history = await loadHistory(env, user.id, MAX_HISTORY_ROWS, growId);
  return json({ history });
}

export async function deleteMjHistory(request, env, user) {
  await ensureMjThreadSchema(env);
  const growId = new URL(request.url).searchParams.get("growId") || null;
  if (growId) {
    await env.DB.prepare("DELETE FROM mj_conversations WHERE user_id = ? AND grow_id = ?")
      .bind(user.id, growId).run();
  } else {
    await env.DB.prepare("DELETE FROM mj_conversations WHERE user_id = ? AND grow_id IS NULL")
      .bind(user.id).run();
  }
  return json({ ok: true });
}
