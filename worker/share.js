// @ts-check
import { json, error, nowIso, bytesToBase64Url } from "./util.js";
import { loadRawPlan } from "./plan.js";
import { loadRawGrows } from "./grows.js";

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
// Returns a task-free read-only snapshot: grow name, season config dates,
// survey basics, and lifecycle. No personal info (email, role, logs, media)
// and no legacy plan blobs (generated_plan/phase_overrides/event_rules).
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
    grow = grows.find(g => g.status === "active" && g.config)
        ?? grows.find(g => g.config)
        ?? null;
  } catch { /* grows table unavailable; fall through to the legacy read */ }

  if (grow) {
    // Lifecycle carries the grower's private notes (finalNotes, dry/cure log
    // notes) - a buddy link gets only the phase and its dates.
    const lc = grow.lifecycle;
    return json({
      growName: grow.displayName || "Grow Calendar",
      status: grow.status,
      config: grow.config,
      survey: surveyBasics(grow.survey),
      lifecycle: lc ? {
        phase: lc.phase ?? null,
        dryStartedAt: lc.dryStartedAt ?? null,
        cureStartedAt: lc.cureStartedAt ?? null,
        finishedAt: lc.finishedAt ?? null,
      } : null,
    });
  }

  // Legacy plan_config fallback: config (plus survey basics) only, never the
  // generated plan or overrides.
  const plan = await loadRawPlan(env, row.user_id);
  if (!plan || plan.needsSetup) return error(404, "grow not set up yet");

  return json({
    growName: "Grow Calendar",
    status: "active",
    config: plan.config,
    survey: surveyBasics(plan.survey),
    lifecycle: null,
  });
}
