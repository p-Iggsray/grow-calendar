// @ts-check
import { json, error, nowIso, bytesToBase64Url } from "./util.js";
import { loadRawGrows } from "./grows.js";
import { loadStageTimeline } from "./stages.js";

function genToken() {
  const bytes = new Uint8Array(24); // 24 bytes → 32-char base64url
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

// Only the shareable survey fields: environment plus strain names/types.
// Location, coordinates, plant ids, and free-form notes stay private.
function surveyBasics(survey) {
  if (!survey || typeof survey !== "object") return null;
  const strains = (Array.isArray(survey.strains) ? survey.strains : [])
    .map(s => ({
      name: typeof s?.name === "string" ? s.name : "",
      type: typeof s?.type === "string" ? s.type : "",
    }))
    .filter(s => s.name);
  return { environment: survey.environment ?? null, strains };
}

// GET /api/share/:token - public endpoint, no auth required.
// Returns a read-only snapshot: grow name, the recorded stage timeline, survey
// basics, and lifecycle. No personal info (email, role, logs, media).
export async function getSharedView(env, token) {
  if (!token || token.length > 60) return error(400, "invalid token");

  const row = await env.DB.prepare(
    "SELECT user_id FROM share_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) return error(404, "share link not found or has been revoked");

  // Prefer the grows table (loadRawGrows auto-migrates legacy plan_config).
  // Tokens are per user, not per grow: share the active grow, else the most
  // recent one that finished setup.
  let grow = null;
  try {
    const grows = await loadRawGrows(env, row.user_id);
    grow = grows.find(g => g.status === "active" && g.survey)
        ?? grows.find(g => g.survey)
        ?? null;
  } catch { /* grows table unavailable */ }

  if (!grow) return error(404, "grow not set up yet");

  // The shared calendar is the recorded stage history, the same source the
  // grower's own calendar reads.
  const { events, firstDate } = await loadStageTimeline(env, row.user_id, grow.id);

  // Lifecycle carries the grower's private notes (finalNotes, dry/cure log
  // notes) - a buddy link gets only the phase and its dates.
  const lc = grow.lifecycle;
  return json({
    growName: grow.displayName || "Grow Calendar",
    status: grow.status,
    stageEvents: events,
    firstDate,
    survey: surveyBasics(grow.survey),
    lifecycle: lc ? {
      phase: lc.phase ?? null,
      dryStartedAt: lc.dryStartedAt ?? null,
      cureStartedAt: lc.cureStartedAt ?? null,
      finishedAt: lc.finishedAt ?? null,
    } : null,
  });
}
