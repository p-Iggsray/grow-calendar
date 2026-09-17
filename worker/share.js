// @ts-check
import { cropOf } from "../src/lib/crops.js";
import { json, nowIso, bytesToBase64Url } from "./util.js";
import { loadRawGrows } from "./grows.js";

export const SHARE_TOKEN_RE = /^[A-Za-z0-9_-]{10,60}$/;

function genToken() {
  const bytes = new Uint8Array(24); // 24 bytes -> 32-char base64url
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

// GET /api/share - return the caller's current token (or null)
export async function getShareToken(env, user) {
  const row = await env.DB.prepare(
    "SELECT token, created_at FROM share_tokens WHERE user_id = ?"
  ).bind(user.id).first();
  return json({ token: row?.token ?? null, createdAt: row?.created_at ?? null });
}

// POST /api/share - create or rotate the token
export async function createShareToken(env, user) {
  const token = genToken();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO share_tokens (token, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`
  ).bind(token, user.id, now).run();
  return json({ token, createdAt: now });
}

// DELETE /api/share - revoke
export async function deleteShareToken(env, user) {
  await env.DB.prepare("DELETE FROM share_tokens WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true });
}

// ── What a link is allowed to reach ─────────────────────────────────────────

// A token resolves to one grower and to the exact set of spaces their link
// opens: live spaces that finished setup. An archived space is put away, so it
// never appears on a link even though its record is still on disk.
//
// Every public read route resolves through here and then checks the requested
// space against growIds, so there is exactly one place in the codebase that
// decides what a link can see. Widen it here or nowhere.
export async function shareContext(env, token) {
  if (!SHARE_TOKEN_RE.test(String(token ?? ""))) return null;
  const row = await env.DB.prepare(
    "SELECT user_id FROM share_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) return null;

  let grows = [];
  try {
    grows = (await loadRawGrows(env, row.user_id)).filter((g) => !g.archivedAt && g.survey);
  } catch { /* grows table unavailable: the link resolves to nothing */ }

  return {
    userId: row.user_id,
    grows,
    growIds: new Set(grows.map((g) => g.id)),
  };
}

// ── Redaction ───────────────────────────────────────────────────────────────

// The one thing a link never carries. A share URL has no password and no
// expiry, so anyone it is forwarded to can open it: where the plants physically
// are does not travel with the rest of the record.
//
// Kept: what is grown, the kind of space, and the variety names, which is what
// makes someone else's read of the journal make any sense at all.
export function shareSurvey(survey) {
  if (!survey || typeof survey !== "object") return null;
  const strains = (Array.isArray(survey.strains) ? survey.strains : [])
    .map((s) => ({
      id: typeof s?.id === "string" ? s.id : "",
      name: typeof s?.name === "string" ? s.name : "",
      type: typeof s?.type === "string" ? s.type : "",
    }))
    .filter((s) => s.name);
  return { crop: cropOf(survey), environment: survey.environment ?? null, strains };
}

// Lifecycle carries the grower's closing notes and their dry/cure log notes.
// A link gets the phase and its dates, which is the shape of the finish, not
// what they privately thought of it.
export function shareLifecycle(lc) {
  if (!lc) return null;
  return {
    phase: lc.phase ?? null,
    dryStartedAt: lc.dryStartedAt ?? null,
    cureStartedAt: lc.cureStartedAt ?? null,
    finishedAt: lc.finishedAt ?? null,
  };
}
