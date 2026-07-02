// @ts-check
import { logError } from "./log.js";
import { json, error } from "./util.js";

// Reverse-geocode coordinates to a readable "City, State" label. Runs in the
// Worker (not the browser) so it can send the descriptive User-Agent Nominatim
// requires and go through the outbound proxy reliably.
export async function reverseGeocode(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "grow-calendar/1.0 (personal grow planner)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const d = await res.json();
    const a = d.address || {};
    const place = [a.city || a.town || a.village || a.hamlet || a.county, a.state || a.country]
      .filter(Boolean).join(", ");
    return place || null;
  } catch (err) {
    logError("reverse-geocode-failed", { message: String(err?.message) });
    return null;
  }
}

// GET /api/geocode/reverse?lat=&lon=  → { place }
export async function getReverseGeocode(request, _env, _user) {
  const url = new URL(request.url);
  const lat = Number(url.searchParams.get("lat"));
  const lon = Number(url.searchParams.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return error(400, "lat and lon required");
  const place = await reverseGeocode(lat, lon);
  return json({ place: place ?? null });
}

// Resolve a free-text location ("Central Ohio, USA") to { lat, lon } using
// OpenStreetMap's Nominatim geocoder. Returns null on any failure or empty
// input. Nominatim asks for a descriptive User-Agent and low request volume - // we only call this once per grow (at setup, or lazily the first time weather
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
