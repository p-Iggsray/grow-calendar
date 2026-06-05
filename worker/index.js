// @ts-check
import { error } from "./util.js";
import { signup, login, logout, getMe, currentUser, attachSessionCookie } from "./auth.js";
import { postForgotPassword, postResetPassword } from "./authReset.js";
import { getCheckoffs, putCheckoffs, getMonthCheckoffs } from "./checkoffs.js";
import { getTaskNotes, putTaskNote } from "./taskNotes.js";
import { getNote, putNote } from "./notes.js";
import { getGrowLog, putGrowLog, exportGrowLogCsv } from "./growLog.js";
import { postMj, getMjUsage, getMjHistory, deleteMjHistory, postMjUndo } from "./mj.js";
import { postMjReview } from "./mjReview.js";
import { getHealth, postClientError } from "./health.js";
import { getWeather } from "./weather.js";
import { getPushVapidKey, postPushSubscribe, deletePushSubscribe, getPushToday, sendDailyReminders } from "./push.js";
import { getPlan, patchPlanConfig, putPlanPhase, deletePlanPhase } from "./plan.js";
import { postPlanSetup, postPlanRegenerate } from "./planSetup.js";
import { listUsers, approveUser, deleteUser } from "./admin.js";
import { getStats } from "./stats.js";
import { requireApproved, requireAdmin } from "./guard.js";
import { logError, logInfo } from "./log.js";
import { getShareToken, createShareToken, deleteShareToken, getSharedView } from "./share.js";

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) {
      // Service worker file must never be cached by the browser so new deploys
      // are detected on the very next open, not after the HTTP cache expires.
      if (path === "/sw.js") {
        const res = await env.ASSETS.fetch(request);
        const fresh = new Response(res.body, res);
        fresh.headers.set("Cache-Control", "no-cache, no-store");
        return fresh;
      }
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, path);
    } catch (err) {
      logError("worker-uncaught", { path, message: String(err?.message ?? err), stack: err?.stack });
      return error(500, "internal server error");
    }
  },

  async scheduled(event, env, _ctx) {
    if (event.cron === "0 3 * * *") {
      const now = new Date().toISOString();
      const { meta } = await env.DB.prepare(
        "DELETE FROM sessions WHERE expires_at < ?"
      ).bind(now).run();
      logInfo("session-cleanup", { deleted: meta.changes });
    } else if (event.cron === "0 12 * * *") {
      await sendDailyReminders(env);
    }
  },
};

// Defense-in-depth against form-based CSRF: any mutating request must declare
// application/json. SameSite=Lax already blocks cross-origin POST cookies, but
// requiring JSON makes a <form>-driven attack impossible too (forms can't send
// application/json without a CORS preflight that we don't honor).
function isMutating(method) {
  return method === "POST" || method === "PUT" || method === "DELETE" || method === "PATCH";
}
function hasJsonContentType(request) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  return ct.startsWith("application/json");
}

async function route(request, env, path) {
  const method = request.method;

  // Binary media uploads send the file's own content-type, not application/json.
  const isBinaryUpload = path === "/api/media/upload" && method === "POST";
  if (isMutating(method) && !isBinaryUpload && !hasJsonContentType(request)) {
    return error(415, "content-type must be application/json");
  }

  // public routes (no auth required)
  if (path === "/api/health" && method === "GET") return getHealth(env);
  const shareViewMatch = path.match(/^\/api\/share\/([A-Za-z0-9_-]{10,60})$/);
  if (shareViewMatch && method === "GET") return getSharedView(env, shareViewMatch[1]);

  // public auth routes
  if (path === "/api/auth/signup"          && method === "POST") return signup(request, env);
  if (path === "/api/auth/login"           && method === "POST") return login(request, env);
  if (path === "/api/auth/logout"          && method === "POST") return logout(request, env);
  if (path === "/api/auth/me"              && method === "GET")  return getMe(request, env);
  if (path === "/api/auth/forgot-password" && method === "POST") return postForgotPassword(request, env);
  if (path === "/api/auth/reset-password"  && method === "POST") return postResetPassword(request, env);

  // everything below requires a session
  const user = await currentUser(request, env);
  if (!user) return error(401, "not authenticated");

  // Sliding rotation: currentUser may have minted a new session token. Attach
  // it to whatever response the handler returns, so the browser's cookie
  // catches up on this same round-trip.
  const response = await authenticatedRoute(request, env, path, method, user);
  return attachSessionCookie(response, request, user.rotateTo);
}

async function authenticatedRoute(request, env, path, method, user) {
  // admin routes
  if (path === "/api/admin/users" && method === "GET") {
    const gate = requireAdmin(user); if (gate) return gate;
    return listUsers(env);
  }
  const approveMatch = path.match(/^\/api\/admin\/users\/(\d+)\/approve$/);
  if (approveMatch && method === "POST") {
    const gate = requireAdmin(user); if (gate) return gate;
    return approveUser(env, Number(approveMatch[1]));
  }
  const adminUserMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (adminUserMatch && method === "DELETE") {
    const gate = requireAdmin(user); if (gate) return gate;
    return deleteUser(env, user, Number(adminUserMatch[1]));
  }

  // app routes require an approved user
  const gate = requireApproved(user); if (gate) return gate;

  if (path === "/api/weather"          && method === "GET")    return getWeather(env);
  if (path === "/api/push/vapid-key"   && method === "GET")    return getPushVapidKey(env);
  if (path === "/api/push/subscribe"   && method === "POST")   return postPushSubscribe(request, env, user);
  if (path === "/api/push/subscribe"   && method === "DELETE") return deletePushSubscribe(request, env, user);
  if (path === "/api/push/today"       && method === "GET")    return getPushToday(env, user);
  if (path === "/api/mj"              && method === "POST")   return postMj(request, env, user);
  if (path === "/api/mj/review"       && method === "POST")   return postMjReview(request, env, user);
  if (path === "/api/mj/undo"         && method === "POST")   return postMjUndo(request, env, user);
  if (path === "/api/mj/usage"        && method === "GET")    return getMjUsage(env, user);
  if (path === "/api/mj/history"      && method === "GET")    return getMjHistory(env, user);
  if (path === "/api/mj/history"      && method === "DELETE") return deleteMjHistory(env, user);
  if (path === "/api/plan"           && method === "GET")   return getPlan(env, user);
  if (path === "/api/plan/setup"     && method === "POST")  return postPlanSetup(request, env, user);
  if (path === "/api/plan/regenerate"&& method === "POST")  return postPlanRegenerate(request, env, user);
  if (path === "/api/plan/config"    && method === "PATCH") return patchPlanConfig(request, env, user);
  const planPhaseMatch = path.match(/^\/api\/plan\/phase\/([a-z_]+)$/);
  if (planPhaseMatch) {
    const phase = planPhaseMatch[1];
    if (method === "PUT")    return putPlanPhase(request, env, user, phase);
    if (method === "DELETE") return deletePlanPhase(env, user, phase);
  }
  if (path === "/api/errors"    && method === "POST") return postClientError(request, env, user);

  if (path === "/api/stats"         && method === "GET")  return getStats(env, user);

  if (path === "/api/share" && method === "GET")    return getShareToken(env, user);
  if (path === "/api/share" && method === "POST")   return createShareToken(env, user);
  if (path === "/api/share" && method === "DELETE") return deleteShareToken(env, user);

  if (path === "/api/checkoffs" && method === "GET") {
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    if (!month) return error(400, "month query param required, e.g. ?month=2026-08");
    return getMonthCheckoffs(env, user, month);
  }

  const checkoffsMatch = path.match(/^\/api\/checkoffs\/(\d{4}-\d{2}-\d{2})$/);
  if (checkoffsMatch) {
    const date = checkoffsMatch[1];
    if (method === "GET") return getCheckoffs(env, user, date);
    if (method === "PUT") return putCheckoffs(request, env, user, date);
  }

  const taskNoteMatch = path.match(/^\/api\/task-notes\/(\d{4}-\d{2}-\d{2})\/(\d+)$/);
  if (taskNoteMatch) {
    const date = taskNoteMatch[1];
    const taskIndex = Number(taskNoteMatch[2]);
    if (method === "GET") return getTaskNotes(env, user, date);
    if (method === "PUT") return putTaskNote(request, env, user, date, taskIndex);
  }
  const taskNotesDateMatch = path.match(/^\/api\/task-notes\/(\d{4}-\d{2}-\d{2})$/);
  if (taskNotesDateMatch && method === "GET") return getTaskNotes(env, user, taskNotesDateMatch[1]);

  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    if (method === "GET") return getNote(env, user, date);
    if (method === "PUT") return putNote(request, env, user, date);
  }

  if (path === "/api/grow-log/export.csv" && method === "GET") return exportGrowLogCsv(env, user);

  const growLogMatch = path.match(/^\/api\/grow-log\/(\d{4}-\d{2}-\d{2})$/);
  if (growLogMatch) {
    const date = growLogMatch[1];
    if (method === "GET") return getGrowLog(env, user, date);
    if (method === "PUT") return putGrowLog(request, env, user, date);
  }

  return error(404, "not found");
}
