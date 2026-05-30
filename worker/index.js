// @ts-check
import { error } from "./util.js";
import { signup, login, logout, getMe, currentUser, attachSessionCookie } from "./auth.js";
import { getCheckoffs, putCheckoffs, getMonthCheckoffs } from "./checkoffs.js";
import { getNote, putNote } from "./notes.js";
import { postMj, getMjUsage, getMjHistory, deleteMjHistory } from "./mj.js";
import { getPlan } from "./plan.js";
import { listUsers, approveUser, deleteUser } from "./admin.js";
import { requireApproved, requireAdmin } from "./guard.js";
import { logError, logInfo } from "./log.js";

export default {
  async fetch(request, env, _ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, path);
    } catch (err) {
      logError("worker-uncaught", { path, message: String(err?.message ?? err), stack: err?.stack });
      return error(500, "internal server error");
    }
  },

  async scheduled(_event, env, _ctx) {
    const now = new Date().toISOString();
    const { meta } = await env.DB.prepare(
      "DELETE FROM sessions WHERE expires_at < ?"
    ).bind(now).run();
    logInfo("session-cleanup", { deleted: meta.changes });
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

  if (isMutating(method) && !hasJsonContentType(request)) {
    return error(415, "content-type must be application/json");
  }

  // public auth routes
  if (path === "/api/auth/signup"  && method === "POST") return signup(request, env);
  if (path === "/api/auth/login"         && method === "POST") return login(request, env);
  if (path === "/api/auth/logout"        && method === "POST") return logout(request, env);
  if (path === "/api/auth/me"            && method === "GET")  return getMe(request, env);

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

  if (path === "/api/mj"              && method === "POST")   return postMj(request, env, user);
  if (path === "/api/mj/usage"        && method === "GET")    return getMjUsage(env, user);
  if (path === "/api/mj/history"      && method === "GET")    return getMjHistory(env, user);
  if (path === "/api/mj/history"      && method === "DELETE") return deleteMjHistory(env, user);
  if (path === "/api/plan"      && method === "GET")  return getPlan(env, user);

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

  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    if (method === "GET") return getNote(env, user, date);
    if (method === "PUT") return putNote(request, env, user, date);
  }

  return error(404, "not found");
}
