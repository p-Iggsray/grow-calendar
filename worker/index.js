import { error } from "./util.js";
import { getSignupStatus, signup, login, logout, getMe } from "./auth.js";
import { getCheckoffs, putCheckoffs } from "./checkoffs.js";
import { getNote, putNote } from "./notes.js";
import { postChat } from "./chat.js";

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (!path.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    try {
      return await route(request, env, path);
    } catch (err) {
      console.error("worker error", err);
      return error(500, "internal server error");
    }
  },
};

async function route(request, env, path) {
  const method = request.method;

  if (path === "/api/auth/signup-status" && method === "GET")  return getSignupStatus(env);
  if (path === "/api/auth/signup"        && method === "POST") return signup(request, env);
  if (path === "/api/auth/login"         && method === "POST") return login(request, env);
  if (path === "/api/auth/logout"        && method === "POST") return logout(request, env);
  if (path === "/api/auth/me"            && method === "GET")  return getMe(request, env);
  if (path === "/api/chat" && method === "POST") return postChat(request, env);

  const checkoffsMatch = path.match(/^\/api\/checkoffs\/(\d{4}-\d{2}-\d{2})$/);
  if (checkoffsMatch) {
    const date = checkoffsMatch[1];
    if (method === "GET") return getCheckoffs(request, env, date);
    if (method === "PUT") return putCheckoffs(request, env, date);
  }

  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    if (method === "GET") return getNote(request, env, date);
    if (method === "PUT") return putNote(request, env, date);
  }

  return error(404, "not found");
}
