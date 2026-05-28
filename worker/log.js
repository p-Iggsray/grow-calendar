// @ts-check
// Single-shape structured logger. Always prints one JSON line per call so
// Cloudflare's log search is grep-friendly and future log shipping has a
// stable contract. Keep callers using `event` as a stable kebab-case key.

/**
 * @param {string} event kebab-case event name; stable across versions
 * @param {Record<string, unknown>} [data]
 */
export function logError(event, data = {}) {
  console.error(JSON.stringify({ level: "error", event, ...data }));
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [data]
 */
export function logInfo(event, data = {}) {
  console.log(JSON.stringify({ level: "info", event, ...data }));
}
