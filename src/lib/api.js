async function request(path, opts = {}) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: opts.body ? { "content-type": "application/json" } : undefined,
    ...opts,
  });
  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { error: text }; }
  }
  if (!res.ok) {
    const message = data?.error || `request failed with status ${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  signupStatus: () => request("/api/auth/signup-status"),
  me:           () => request("/api/auth/me"),
  signup: (username, password) =>
    request("/api/auth/signup", { method: "POST", body: JSON.stringify({ username, password }) }),
  login: (username, password) =>
    request("/api/auth/login",  { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => request("/api/auth/logout", { method: "POST" }),

  getCheckoffs: (date) => request(`/api/checkoffs/${date}`),
  putCheckoffs: (date, checked) =>
    request(`/api/checkoffs/${date}`, { method: "PUT", body: JSON.stringify({ checked }) }),

  getNote: (date) => request(`/api/notes/${date}`),
  putNote: (date, body) =>
    request(`/api/notes/${date}`, { method: "PUT", body: JSON.stringify({ body }) }),

  mj: (messages) =>
    request("/api/mj", { method: "POST", body: JSON.stringify({ messages }) }),

  getPlan: () => request("/api/plan"),
};

export function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
