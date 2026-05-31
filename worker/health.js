// @ts-check
import { json } from "./util.js";
import { safeJsonBounded } from "./util.js";

export async function getHealth(env) {
  let dbOk = false;
  try {
    await env.DB.prepare("SELECT 1").first();
    dbOk = true;
  } catch {}
  return json({ ok: dbOk, ts: new Date().toISOString() });
}

const MAX_ERR_BYTES = 8192;

export async function postClientError(request, env, user) {
  // Always return ok — errors here must never cascade into UI failures.
  try {
    const parsed = await safeJsonBounded(request, MAX_ERR_BYTES);
    if (!parsed.ok) return json({ ok: true });
    const { message, stack, url } = parsed.data ?? {};
    if (typeof message !== "string" || !message.trim()) return json({ ok: true });
    await env.DB.prepare(
      "INSERT INTO client_errors (user_id, ts, message, stack, url) VALUES (?, ?, ?, ?, ?)",
    ).bind(
      user?.id ?? null,
      new Date().toISOString(),
      message.slice(0, 1000),
      typeof stack === "string" ? stack.slice(0, 2000) : null,
      typeof url === "string" ? url.slice(0, 500) : null,
    ).run();
  } catch {}
  return json({ ok: true });
}
