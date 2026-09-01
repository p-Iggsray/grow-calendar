// @ts-check
import { error } from "./util.js";
import { signup, login, logout, getMe, currentUser, attachSessionCookie } from "./auth.js";
import { postResetPassword } from "./authReset.js";
import { ensurePerDayGrowScope, resolveGrowId } from "./perDayScope.js";
import { getNote, putNote } from "./notes.js";
import { getJournalDay, getJournalMonth, getJournalTimeline, searchJournal, getJournalWeather } from "./journal.js";
import { autoLogWeather } from "./weatherDays.js";
import { getGrowLog, putGrowLog, exportGrowLogCsv , getMonthGrowLog } from "./growLog.js";
import { postMj, getMjUsage, getMjHistory, deleteMjHistory, postMjUndo } from "./mj.js";
import { getHealth, postClientError } from "./health.js";
import { getWeather } from "./weather.js";
import { listGrows, createGrow, getGrow, patchGrow, deleteGrow, patchGrowLifecycle, setupGrow } from "./grows.js";
import { listGrowEvents, createGrowEvent, patchGrowEvent, deleteGrowEvent } from "./events.js";
import { createJournalPhoto, getJournalPhoto, deleteJournalPhoto, listPlantPhotos } from "./photos.js";
import { importEnvReadings, getEnvSummary, getEnvDay, clearEnv } from "./env.js";
import { getReverseGeocode, getGeocodeSearch } from "./geocode.js";
import { listStrains } from "./strains.js";
import { getStageTimeline } from "./stages.js";
import { addPlant, patchPlant, deletePlant, listPlantLog, addPlantLogEntry, patchPlantLogEntry, deletePlantLogEntry, plantLogSummary, dailyLogForPlant } from "./plants.js";
import { getGrowReport } from "./report.js";
import { getStats } from "./stats.js";
import { requireApproved } from "./guard.js";
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
    try {
      if (event.cron === "0 3 * * *") {
        const now = new Date().toISOString();
        const { meta } = await env.DB.prepare(
          "DELETE FROM sessions WHERE expires_at < ?"
        ).bind(now).run();
        logInfo("session-cleanup", { deleted: meta.changes });
      }
      // Both runs auto-log the weather: 12:00 UTC (morning ET) finalizes
      // yesterday and seeds today; 03:00 UTC (late evening ET) captures the
      // day's final high/low before midnight.
      const written = await autoLogWeather(env);
      if (written > 0) logInfo("auto-weather", { written });
    } catch (err) {
      logError("scheduled-uncaught", { cron: event.cron, message: String(err?.message ?? err), stack: err?.stack });
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

  if (isMutating(method) && !hasJsonContentType(request)) {
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
  // app routes require an approved user
  const gate = requireApproved(user); if (gate) return gate;

  // Ensure the per-day tables are grow-scoped before any handler touches them.
  await ensurePerDayGrowScope(env);

  if (path === "/api/weather"          && method === "GET")    return getWeather(request, env, user);
  if (path === "/api/mj"              && method === "POST")   return postMj(request, env, user);
  if (path === "/api/mj/undo"         && method === "POST")   return postMjUndo(request, env, user);
  if (path === "/api/mj/usage"        && method === "GET")    return getMjUsage(env, user);
  if (path === "/api/mj/history"      && method === "GET")    return getMjHistory(request, env, user);
  if (path === "/api/mj/history"      && method === "DELETE") return deleteMjHistory(request, env, user);
  if (path === "/api/errors"    && method === "POST") return postClientError(request, env, user);

  if (path === "/api/stats"         && method === "GET")  return getStats(env, user, await resolveGrowId(env, user, new URL(request.url)));
  if (path === "/api/geocode/reverse" && method === "GET") return getReverseGeocode(request, env, user);
  if (path === "/api/geocode/search"  && method === "GET") return getGeocodeSearch(request, env, user);
  if (path === "/api/strains"         && method === "GET") return listStrains(env, user);

  if (path === "/api/grows" && method === "GET")  return listGrows(env, user);
  if (path === "/api/grows" && method === "POST") return createGrow(request, env, user);
  const growMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)$/);
  if (growMatch) {
    const growId = growMatch[1];
    if (method === "GET")    return getGrow(env, user, growId);
    if (method === "PATCH")  return patchGrow(request, env, user, growId);
    if (method === "DELETE") return deleteGrow(env, user, growId);
  }
  const growLifecycleMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/lifecycle$/);
  if (growLifecycleMatch && method === "PATCH") return patchGrowLifecycle(request, env, user, growLifecycleMatch[1]);
  const envImportMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/env\/import$/);
  if (envImportMatch && method === "POST") return importEnvReadings(request, env, user, envImportMatch[1]);
  const envSummaryMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/env\/summary$/);
  if (envSummaryMatch && method === "GET") return getEnvSummary(env, user, envSummaryMatch[1]);
  const envDayMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/env\/day\/(\d{4}-\d{2}-\d{2})$/);
  if (envDayMatch && method === "GET") return getEnvDay(env, user, envDayMatch[1], envDayMatch[2]);
  const envClearMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/env$/);
  if (envClearMatch && method === "DELETE") return clearEnv(env, user, envClearMatch[1]);
  const growSetupMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/setup$/);
  if (growSetupMatch && method === "POST") return setupGrow(request, env, user, growSetupMatch[1]);
  // Custom calendar events: single-day entries shown on the month grid and in
  // each day's journal.
  const growEventsMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/events(?:\/([A-Za-z0-9_]+))?$/);
  if (growEventsMatch) {
    const gid = growEventsMatch[1];
    const eventId = growEventsMatch[2];
    if (method === "GET"    && !eventId) return listGrowEvents(env, user, gid, new URL(request.url));
    if (method === "POST"   && !eventId) return createGrowEvent(request, env, user, gid);
    if (method === "PATCH"  &&  eventId) return patchGrowEvent(request, env, user, gid, eventId);
    if (method === "DELETE" &&  eventId) return deleteGrowEvent(env, user, gid, eventId);
  }

  // Journal photos: attached to a day's journal page.
  const photosMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/photos(?:\/([A-Za-z0-9_]+))?$/);
  if (photosMatch) {
    const gid = photosMatch[1];
    const photoId = photosMatch[2];
    if (method === "POST"   && !photoId) return createJournalPhoto(request, env, user, gid);
    if (method === "GET"    &&  photoId) return getJournalPhoto(env, user, gid, photoId);
    if (method === "DELETE" &&  photoId) return deleteJournalPhoto(env, user, gid, photoId);
  }

  const plantsMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants$/);
  if (plantsMatch && method === "POST") return addPlant(request, env, user, plantsMatch[1]);
  const plantMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)$/);
  if (plantMatch) {
    const gId = plantMatch[1];
    const pId = plantMatch[2];
    if (method === "PATCH")  return patchPlant(request, env, user, gId, pId);
    if (method === "DELETE") return deletePlant(env, user, gId, pId);
  }

  const stagesMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/stages$/);
  if (stagesMatch && method === "GET") return getStageTimeline(env, user, stagesMatch[1]);

  const plantPhotosMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/photos$/);
  if (plantPhotosMatch && method === "GET") return listPlantPhotos(env, user, plantPhotosMatch[1], plantPhotosMatch[2]);

  const plantSummaryMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plant-log-summary$/);
  if (plantSummaryMatch && method === "GET") return plantLogSummary(env, user, plantSummaryMatch[1]);
  const plantDailyMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/daily$/);
  if (plantDailyMatch && method === "GET") return dailyLogForPlant(env, user, plantDailyMatch[1], plantDailyMatch[2]);
  const plantLogMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/log$/);
  if (plantLogMatch) {
    const gId = plantLogMatch[1];
    const pId = plantLogMatch[2];
    if (method === "GET")  return listPlantLog(env, user, gId, pId);
    if (method === "POST") return addPlantLogEntry(request, env, user, gId, pId);
  }
  const plantLogEntryMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/plants\/([A-Za-z0-9_]+)\/log\/(\d+)$/);
  if (plantLogEntryMatch) {
    const gId = plantLogEntryMatch[1];
    const pId = plantLogEntryMatch[2];
    const eId = Number(plantLogEntryMatch[3]);
    if (method === "PATCH")  return patchPlantLogEntry(request, env, user, gId, pId, eId);
    if (method === "DELETE") return deletePlantLogEntry(env, user, gId, pId, eId);
  }
  const growReportMatch = path.match(/^\/api\/grows\/([A-Za-z0-9]+)\/report$/);
  if (growReportMatch && method === "GET") return getGrowReport(env, user, growReportMatch[1]);

  if (path === "/api/share" && method === "GET")    return getShareToken(env, user);
  if (path === "/api/share" && method === "POST")   return createShareToken(env, user);
  if (path === "/api/share" && method === "DELETE") return deleteShareToken(env, user);

  if (path === "/api/grow-log/month" && method === "GET") {
    const url = new URL(request.url);
    return getMonthGrowLog(env, user, await resolveGrowId(env, user, url), url.searchParams.get("month"));
  }
  const notesMatch = path.match(/^\/api\/notes\/(\d{4}-\d{2}-\d{2})$/);
  if (notesMatch) {
    const date = notesMatch[1];
    const growId = await resolveGrowId(env, user, new URL(request.url));
    if (method === "GET") return getNote(env, user, growId, date);
    if (method === "PUT") return putNote(request, env, user, growId, date);
  }

  if (path === "/api/grow-log/export.csv" && method === "GET")
    return exportGrowLogCsv(env, user, await resolveGrowId(env, user, new URL(request.url)));

  const growLogMatch = path.match(/^\/api\/grow-log\/(\d{4}-\d{2}-\d{2})$/);
  if (growLogMatch) {
    const date = growLogMatch[1];
    const growId = await resolveGrowId(env, user, new URL(request.url));
    if (method === "GET") return getGrowLog(env, user, growId, date);
    if (method === "PUT") return putGrowLog(request, env, user, growId, date);
  }

  if (path === "/api/journal/month" && method === "GET") {
    const url = new URL(request.url);
    const growId = await resolveGrowId(env, user, url);
    return getJournalMonth(env, user, growId, url.searchParams.get("month"));
  }

  if (path === "/api/journal/timeline" && method === "GET") {
    const url = new URL(request.url);
    const growId = await resolveGrowId(env, user, url);
    return getJournalTimeline(env, user, growId, url.searchParams.get("before"), url.searchParams.get("limit"));
  }

  if (path === "/api/journal/search" && method === "GET") {
    const url = new URL(request.url);
    const growId = await resolveGrowId(env, user, url);
    return searchJournal(env, user, growId, url.searchParams.get("q"));
  }

  const journalWeatherMatch = path.match(/^\/api\/journal\/weather\/(\d{4}-\d{2}-\d{2})$/);
  if (journalWeatherMatch && method === "GET") {
    const growId = await resolveGrowId(env, user, new URL(request.url));
    return getJournalWeather(env, user, growId, journalWeatherMatch[1]);
  }

  const journalMatch = path.match(/^\/api\/journal\/(\d{4}-\d{2}-\d{2})$/);
  if (journalMatch && method === "GET") {
    const growId = await resolveGrowId(env, user, new URL(request.url));
    return getJournalDay(env, user, growId, journalMatch[1]);
  }

  return error(404, "not found");
}
