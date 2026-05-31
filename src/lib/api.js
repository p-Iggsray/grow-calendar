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
  signup: (username, password) =>
    request("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    request("/api/auth/login",  { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  getCheckoffs: (date) => request(`/api/checkoffs/${date}`),
  putCheckoffs: (date, checked) =>
    request(`/api/checkoffs/${date}`, { method: "PUT", body: JSON.stringify({ checked }) }),
  getMonthCheckoffs: (month) => request(`/api/checkoffs?month=${month}`),

  getNote: (date) => request(`/api/notes/${date}`),
  putNote: (date, body) =>
    request(`/api/notes/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),

  // Streams MJ's reply via SSE. Calls onChunk(delta) for each text piece,
  // onDone({ actions, usage }) when the response completes, and onError(err)
  // on any failure. Never throws — all errors route through onError.
  mj: (message, contextDate, { onChunk, onDone, onError }) => {
    fetch("/api/mj", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, ...(contextDate ? { contextDate } : {}) }),
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
  getMjUsage: () => request("/api/mj/usage"),
  getMjHistory: () => request("/api/mj/history"),
  clearMjHistory: () => request("/api/mj/history", { method: "DELETE" }),

  getPlan: () => request("/api/plan"),

  adminListUsers: () => request("/api/admin/users"),
  approveUser: (id) => request(`/api/admin/users/${id}/approve`, { method: "POST" }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: "DELETE" }),
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
