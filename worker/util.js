// @ts-check

/**
 * Build a JSON Response. Sets content-type and merges any caller-provided
 * headers/status.
 * @param {unknown} data
 * @param {ResponseInit} [init]
 * @returns {Response}
 */
export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

/**
 * Shortcut for the project's standard `{ error: string }` JSON shape.
 * @param {number} status
 * @param {string} message
 * @returns {Response}
 */
export function error(status, message) {
  return json({ error: message }, { status });
}

/** @returns {string} an ISO-8601 timestamp in UTC */
export function nowIso() {
  return new Date().toISOString();
}

export function bytesToBase64(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToBase64Url(bytes) {
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(/;\s*/)) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    out[part.slice(0, idx)] = decodeURIComponent(part.slice(idx + 1));
  }
  return out;
}

export function sessionCookie(token, maxAgeSeconds, isSecure) {
  const secureFlag = isSecure ? "; Secure" : "";
  return `session=${token}; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

export function clearSessionCookie(isSecure) {
  const secureFlag = isSecure ? "; Secure" : "";
  return `session=; Path=/; HttpOnly${secureFlag}; SameSite=Lax; Max-Age=0`;
}

export function isHttps(request) {
  if (new URL(request.url).protocol === "https:") return true;
  const xfp = request.headers.get("x-forwarded-proto");
  return xfp === "https";
}

/**
 * Read a request body as JSON with a hard byte cap. Rejects via content-length
 * first (fast); falls back to actual byte count. Callers should bound by their
 * own payload shape, not a global default.
 * @param {Request} request
 * @param {number} maxBytes
 * @returns {Promise<
 *   { ok: true, data: unknown } |
 *   { ok: false, status: 400 | 413, error: string }
 * >}
 */
export async function safeJsonBounded(request, maxBytes) {
  const cl = Number(request.headers.get("content-length"));
  if (Number.isFinite(cl) && cl > maxBytes) {
    return { ok: false, status: 413, error: "request body too large" };
  }
  let text;
  try { text = await request.text(); }
  catch { return { ok: false, status: 400, error: "could not read request body" }; }
  if (text.length > maxBytes) {
    return { ok: false, status: 413, error: "request body too large" };
  }
  if (text === "") return { ok: true, data: null };
  let data;
  try { data = JSON.parse(text); }
  catch { return { ok: false, status: 400, error: "invalid json" }; }
  return { ok: true, data };
}
