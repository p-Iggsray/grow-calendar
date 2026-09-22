// @ts-check

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// ── When the session ends ──────────────────────────────────────────────────
//
// A 401 from an app route is not a failure worth retrying. The worker returns
// it from one place, currentUser, and only for reasons that are final: no
// cookie, no session row, a row past its expiry (which it deletes on the way
// out), or a session that is not the owner's. There is no state in which the
// same request would work a moment later.
//
// Nothing used to listen for it, and the result was quieter and worse than an
// error. Deleting the session under a running app and then using it normally
// produced no message of any kind: eight endpoints answered 401 in silence,
// every screen still looked signed in, and the day view offered "Nothing
// logged yet. Write about the day below" over a record that was there all
// along. An entry typed into that invitation disappeared without so much as a
// failed request.
//
// The auth routes are exempt, and have to be. /api/auth/login answers 401 for
// a wrong password, and treating that as "your session ended" would sign you
// out of the sign-in screen. /api/auth/me answers 401 whenever nobody is
// signed in, which is the ordinary cold start that AuthProvider already reads
// as "show the login".
const AUTH_PREFIX = "/api/auth/";

const sessionEndedListeners = new Set();
let sessionEnded = false;

/**
 * Subscribe to the session ending. Returns an unsubscribe.
 * @param {() => void} fn
 */
export function onSessionEnded(fn) {
  sessionEndedListeners.add(fn);
  return () => { sessionEndedListeners.delete(fn); };
}

/**
 * Every response passes through here. It announces the end once however many
 * requests were in flight when it happened, because opening a screen fires
 * eight of them and they all come back 401 together.
 * @param {string} path
 * @param {number} status
 */
function noteStatus(path, status) {
  if (status !== 401 || path.startsWith(AUTH_PREFIX) || sessionEnded) return;
  sessionEnded = true;
  for (const fn of sessionEndedListeners) {
    // A listener throwing must not turn into a failed fetch for the caller.
    try { fn(); } catch { /* nothing to do */ }
  }
}

/** Signing in again puts the app back in business. */
export function clearSessionEnded() { sessionEnded = false; }

/**
 * Thin fetch wrapper. Throws an Error with `.status` on non-2xx; returns the
 * parsed JSON body otherwise. Worker requires application/json on every
 * mutating verb (defense-in-depth CSRF check) even for body-less requests
 * like logout, so we always send the header on those.
 *
 * @param {string} path
 * @param {RequestInit} [opts]
 * @returns {Promise<any>}
 */
// Per-day data is grow-scoped; append the active grow id so the worker reads
// and writes the right grow. Omitted when absent (worker falls back to the
// user's first grow).
function withGrow(path, growId) {
  if (!growId) return path;
  return path + (path.includes("?") ? "&" : "?") + `growId=${encodeURIComponent(growId)}`;
}

async function request(path, opts = {}) {
  const isMutating = MUTATING_METHODS.has((opts.method || "GET").toUpperCase());
  const headers = isMutating ? { "content-type": "application/json" } : undefined;
  const res = await fetch(path, {
    credentials: "same-origin",
    headers,
    ...opts,
  });
  noteStatus(path, res.status);
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!res.ok) {
    const message = data?.error || `request failed with status ${res.status}`;
    const err = /** @type {Error & { status?: number, body?: any }} */ (new Error(message));
    err.status = res.status;
    // Some refusals are answers, not failures: archiving carries the list of
    // spaces it would have to drop. Keep the whole body so the caller can act
    // on it rather than only showing the sentence.
    err.body = data;
    throw err;
  }
  return data;
}

export const api = {
  me: () => request("/api/auth/me"),
  login: (username, password) =>
    request("/api/auth/login",  { method: "POST", body: JSON.stringify({ username, password }) }),
  resetPassword: (token, newPassword) =>
    request("/api/auth/reset-password",  { method: "POST", body: JSON.stringify({ token, newPassword }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  getMonthGrowLog: (month, growId) => request(withGrow(`/api/grow-log/month?month=${month}`, growId)),
  getJournalDay: (date, growId) => request(withGrow(`/api/journal/${date}`, growId)),
  // Read a day's written entry into that day's log. Never throws for the
  // caller's sake: this rides on top of a log that still works by hand, so a
  // reading that cannot happen must not interrupt the writing.
  readJournalEntry: (date, growId) =>
    request(withGrow(`/api/journal/${date}/read`, growId), { method: "POST" })
      .catch(() => ({ read: {}, found: false, reason: "unavailable" })),
  getJournalMonth: (month, growId) => request(withGrow(`/api/journal/month?month=${month}`, growId)),
  getJournalWeather: (date, growId) => request(withGrow(`/api/journal/weather/${date}`, growId)),
  getJournalTimeline: (before, limit, growId) =>
    request(withGrow(`/api/journal/timeline?before=${before || ""}&limit=${limit || 30}`, growId)),
  searchJournal: (q, growId) => request(withGrow(`/api/journal/search?q=${encodeURIComponent(q)}`, growId)),

  getNote: (date, growId) => request(withGrow(`/api/notes/${date}`, growId)),
  putNote: (date, body, growId) =>
    request(withGrow(`/api/notes/${date}`, growId), { method: "PUT", body: JSON.stringify({ body }) }),

  // Streams MJ's reply via SSE.
  // Options: { activeGrowId, threadGrowId, imageData, onChunk, onDone, onError }
  mj: (message, contextDate, { activeGrowId, threadGrowId, imageData, onChunk, onDone, onError }) => {
    fetch("/api/mj", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message,
        ...(contextDate  ? { contextDate }  : {}),
        ...(activeGrowId ? { activeGrowId } : {}),
        ...(threadGrowId ? { threadGrowId } : {}),
        ...(imageData    ? { imageData }    : {}),
      }),
    }).then(async (res) => {
      if (!res.ok) {
        noteStatus("/api/mj", res.status);
        const text = await res.text().catch(() => "");
        let msg;
        try { msg = JSON.parse(text).error; } catch { msg = `request failed ${res.status}`; }
        const err = new Error(msg);
        err.status = res.status;
        onError(err);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;
          let evt;
          try { evt = JSON.parse(raw); } catch { continue; }
          if (evt.delta !== undefined) { onChunk(evt.delta); }
          else if (evt.done) { onDone(evt); }
          else if (evt.error) { const e = new Error(evt.error); onError(e); return; }
        }
      }
    }).catch(onError);
  },
  mjUndo: (undoPayload, growId) =>
    request(withGrow("/api/mj/undo", growId), { method: "POST", body: JSON.stringify(undoPayload) }),
  getMjUsage: () => request("/api/mj/usage"),
  getMjHistory: (growId) =>
    request(`/api/mj/history${growId ? `?growId=${encodeURIComponent(growId)}` : ""}`),
  clearMjHistory: (growId) =>
    request(`/api/mj/history${growId ? `?growId=${encodeURIComponent(growId)}` : ""}`, { method: "DELETE" }),

  getGrowLog: (date, growId) => request(withGrow(`/api/grow-log/${date}`, growId)),
  putGrowLog: (date, entry, growId) =>
    request(withGrow(`/api/grow-log/${date}`, growId), { method: "PUT", body: JSON.stringify(entry) }),
  downloadGrowLogCsv: async (growId) => {
    const res = await fetch(withGrow("/api/grow-log/export.csv", growId), { credentials: "same-origin" });
    noteStatus("/api/grow-log/export.csv", res.status);
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },
  // Full print-ready grow report (self-contained HTML). Fetched (not navigated
  // to) so an installed standalone PWA doesn't capture the navigation and
  // replace the running app - see SettingsScreen.openReport.
  // The whole record as one file. A blob rather than the text, because it is
  // the only export big enough that holding it as a string is worth avoiding.
  getBackup: async () => {
    const res = await fetch("/api/backup.json", { credentials: "same-origin" });
    noteStatus("/api/backup.json", res.status);
    if (!res.ok) throw new Error(`Backup failed: ${res.status}`);
    return res.blob();
  },

  // The rundown: everything this space ever recorded, as one printable file.
  // The `rundownAt` stamp that comes back with it is what a delete has to
  // present, so callers keep it rather than only the html.
  getGrowReport: async (growId, unit = "gal") => {
    const res = await fetch(`/api/grows/${encodeURIComponent(growId)}/report?unit=${encodeURIComponent(unit)}`, { credentials: "same-origin" });
    noteStatus("/api/grows/report", res.status);
    if (!res.ok) throw new Error(`Report failed: ${res.status}`);
    const rundownAt = res.headers.get("x-rundown-at");
    return { html: await res.text(), rundownAt };
  },

  getWeather: (growId) =>
    request(`/api/weather${growId ? `?growId=${encodeURIComponent(growId)}` : ""}`),

  reportError: ({ message, stack, url }) =>
    request("/api/errors", { method: "POST", body: JSON.stringify({ message, stack, url }) }).catch(() => {}),

  getStats: (growId) => request(withGrow("/api/stats", growId)),

  listGrows: () => request("/api/grows"),
  createGrow: (data) =>
    request("/api/grows", { method: "POST", body: JSON.stringify(data) }),
  getGrow: (id) => request(`/api/grows/${id}`),
  patchGrow: (id, data) =>
    request(`/api/grows/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  // Merge the environment's own setup fields (type, size, lighting, medium,
  // watering) into its survey.
  saveEnvironmentSetup: (id, environmentSetup) =>
    request(`/api/grows/${id}`, { method: "PATCH", body: JSON.stringify({ environmentSetup }) }),
  // Spaces are archived, never deleted. `evict: true` is the grower agreeing
  // to the spaces the first call named as having to go to make room.
  getArchive: () => request("/api/archive"),
  // `rundowns` maps each space the archive would have to drop to the token its
  // rundown was issued with. Without them the server refuses to evict.
  archiveGrow: (id, { evict = false, rundowns } = {}) =>
    request(`/api/grows/${id}/archive`, { method: "POST", body: JSON.stringify({ evict, ...(rundowns ? { rundowns } : {}) }) }),
  unarchiveGrow: (id) =>
    request(`/api/grows/${id}/unarchive`, { method: "POST", body: "{}" }),
  // Deleting is final and needs the token the rundown was issued with.
  deleteGrow: (id, rundownAt) =>
    request(`/api/grows/${id}`, { method: "DELETE", body: JSON.stringify({ rundownAt }) }),
  updateGrowLifecycle: (id, lifecycle) =>
    request(`/api/grows/${id}/lifecycle`, { method: "PATCH", body: JSON.stringify({ lifecycle }) }),
  setupGrow: (id, survey) =>
    request(`/api/grows/${id}/setup`, { method: "POST", body: JSON.stringify({ survey }) }),
  createJournalPhoto: (id, photo) =>
    request(`/api/grows/${id}/photos`, { method: "POST", body: JSON.stringify(photo) }),
  getJournalPhoto: (id, photoId) =>
    request(`/api/grows/${id}/photos/${photoId}`),
  getStageTimeline: (id) => request(`/api/grows/${id}/stages`),
  // Reminders. `month`, `date` or `from` (+ optional `limit`) pick the window.
  listGrowEvents: (id, params) =>
    request(`/api/grows/${id}/events?${new URLSearchParams(params).toString()}`),
  createGrowEvent: (id, event) =>
    request(`/api/grows/${id}/events`, { method: "POST", body: JSON.stringify(event) }),
  patchGrowEvent: (id, eventId, patch) =>
    request(`/api/grows/${id}/events/${eventId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deleteGrowEvent: (id, eventId) =>
    request(`/api/grows/${id}/events/${eventId}`, { method: "DELETE", body: "{}" }),
  listPlantPhotos: (id, plantId) =>
    request(`/api/grows/${id}/plants/${plantId}/photos`),
  deleteJournalPhoto: (id, photoId) =>
    request(`/api/grows/${id}/photos/${photoId}`, { method: "DELETE", body: "{}" }),
  importEnv: (id, readings) =>
    request(`/api/grows/${id}/env/import`, { method: "POST", body: JSON.stringify({ readings }) }),
  reverseGeocode: (lat, lon) => request(`/api/geocode/reverse?lat=${lat}&lon=${lon}`),
  searchPlaces: (q) => request(`/api/geocode/search?q=${encodeURIComponent(q)}`),
  getStrains: () => request("/api/strains"),

  // Your strain library. Only the notes, stars, favourites and seed-packet
  // facts are stored; the list of strains you have grown is derived from the
  // spaces you already have loaded.
  getStrainLibrary: () => request("/api/strain-library"),
  // Ids only. The pictures themselves load per image from /api/photos/:id/thumb
  // so the browser can skip what is offscreen and cache what is not.
  getStrainPhotos: () => request("/api/strain-library/photos"),
  saveStrainEntry: (entry) =>
    request("/api/strain-library", { method: "PUT", body: JSON.stringify(entry) }),
  deleteStrainEntry: (name) =>
    request("/api/strain-library", { method: "DELETE", body: JSON.stringify({ name }) }),
  // Renaming reaches the plants too, or the old name comes straight back.
  renameStrain: (from, to) =>
    request("/api/strain-library/rename", { method: "POST", body: JSON.stringify({ from, to }) }),
  removeStrain: (name) =>
    request("/api/strain-library/remove", { method: "POST", body: JSON.stringify({ name }) }),
  getEnvSummary: (id) => request(`/api/grows/${id}/env/summary`),
  getEnvDay: (id, date) => request(`/api/grows/${id}/env/day/${date}`),
  clearEnv: (id) =>
    request(`/api/grows/${id}/env`, { method: "DELETE", body: "{}" }),
  addPlant: (growId, fields) =>
    request(`/api/grows/${growId}/plants`, { method: "POST", body: JSON.stringify(fields) }),
  patchPlant: (growId, plantId, patch) =>
    request(`/api/grows/${growId}/plants/${plantId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePlant: (growId, plantId) =>
    request(`/api/grows/${growId}/plants/${plantId}`, { method: "DELETE", body: "{}" }),
  getPlantLog: (growId, plantId) =>
    request(`/api/grows/${growId}/plants/${plantId}/log`),
  getPlantLogSummary: (growId) =>
    request(`/api/grows/${growId}/plant-log-summary`),
  getPlantDailyLog: (growId, plantId) =>
    request(`/api/grows/${growId}/plants/${plantId}/daily`),
  addPlantLogEntry: (growId, plantId, entry) =>
    request(`/api/grows/${growId}/plants/${plantId}/log`, { method: "POST", body: JSON.stringify(entry) }),
  patchPlantLogEntry: (growId, plantId, entryId, patch) =>
    request(`/api/grows/${growId}/plants/${plantId}/log/${entryId}`, { method: "PATCH", body: JSON.stringify(patch) }),
  deletePlantLogEntry: (growId, plantId, entryId) =>
    request(`/api/grows/${growId}/plants/${plantId}/log/${entryId}`, { method: "DELETE", body: "{}" }),

  // Where this variety's label should point, or {code:null} when it has no
  // public page. Minted on first ask, then stable, so a printed label keeps
  // working.
  getStrainPageCode: (name) =>
    request(`/api/strains/page-code?name=${encodeURIComponent(name)}`),
  getShareToken: () => request("/api/share"),
  createShareToken: () => request("/api/share", { method: "POST", body: "{}" }),
  deleteShareToken: () => request("/api/share", { method: "DELETE", body: "{}" }),

};

/**
 * Format a Date as YYYY-MM-DD in the local timezone (the format every
 * date-keyed Worker route accepts).
 * @param {Date} date
 * @returns {string}
 */
export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
