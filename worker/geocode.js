// @ts-check
import { logError } from "./log.js";

// Resolve a free-text location ("Central Ohio, USA") to { lat, lon } using
// OpenStreetMap's Nominatim geocoder. Returns null on any failure or empty
// input. Nominatim asks for a descriptive User-Agent and low request volume —
// we only call this once per grow (at setup, or lazily the first time weather
// is requested for a grow that has location text but no coordinates yet).
export async function geocode(locationText) {
  const q = (locationText || "").trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "grow-calendar/1.0 (personal grow planner)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const hit = Array.isArray(data) ? data[0] : null;
    if (!hit) return null;
    const lat = Number(hit.lat);
    const lon = Number(hit.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return { lat, lon };
  } catch (err) {
    logError("geocode-failed", { message: String(err?.message) });
    return null;
  }
}
