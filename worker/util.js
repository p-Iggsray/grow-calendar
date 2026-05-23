export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function error(status, message) {
  return json({ error: message }, { status });
}

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
