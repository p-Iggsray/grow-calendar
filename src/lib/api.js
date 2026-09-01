// @ts-check

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

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
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!res.ok) {
    const message = data?.error || `request failed with status ${res.status}`;
    const err = /** @type {Error & { status?: number }} */ (new Error(message));
    err.status = res.status;
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
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    return res.blob();
  },
  // Full print-ready grow report (self-contained HTML). Fetched (not navigated
  // to) so an installed standalone PWA doesn't capture the navigation and
  // replace the running app - see SettingsScreen.openReport.
  getGrowReport: async (growId) => {
    const res = await fetch(`/api/grows/${encodeURIComponent(growId)}/report`, { credentials: "same-origin" });
    if (!res.ok) throw new Error(`Report failed: ${res.status}`);
    return res.text();
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
  deleteGrow: (id) =>
    request(`/api/grows/${id}`, { method: "DELETE", body: "{}" }),
  updateGrowLifecycle: (id, lifecycle) =>
    request(`/api/grows/${id}/lifecycle`, { method: "PATCH", body: JSON.stringify({ lifecycle }) }),
  setupGrow: (id, survey) =>
    request(`/api/grows/${id}/setup`, { method: "POST", body: JSON.stringify({ survey }) }),
  createJournalPhoto: (id, photo) =>
    request(`/api/grows/${id}/photos`, { method: "POST", body: JSON.stringify(photo) }),
  getJournalPhoto: (id, photoId) =>
    request(`/api/grows/${id}/photos/${photoId}`),
  getStageTimeline: (id) => request(`/api/grows/${id}/stages`),
  listPlantPhotos: (id, plantId) =>
    request(`/api/grows/${id}/plants/${plantId}/photos`),
  deleteJournalPhoto: (id, photoId) =>
    request(`/api/grows/${id}/photos/${photoId}`, { method: "DELETE", body: "{}" }),
  importEnv: (id, readings) =>
    request(`/api/grows/${id}/env/import`, { method: "POST", body: JSON.stringify({ readings }) }),
  reverseGeocode: (lat, lon) => request(`/api/geocode/reverse?lat=${lat}&lon=${lon}`),
  searchPlaces: (q) => request(`/api/geocode/search?q=${encodeURIComponent(q)}`),
  getStrains: () => request("/api/strains"),
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

  getShareToken: () => request("/api/share"),
  createShareToken: () => request("/api/share", { method: "POST", body: "{}" }),
  deleteShareToken: () => request("/api/share", { method: "DELETE", body: "{}" }),
  getSharedView: (token) => fetch(`/api/share/${token}`)
    .then(r => r.json().then(d => r.ok ? d : Promise.reject(new Error(d.error || "Not found")))),

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
