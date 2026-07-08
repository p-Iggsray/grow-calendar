import { useState } from "react";
import { MapPin, LocateFixed, X } from "lucide-react";
import { api } from "../lib/api.js";
import { tapHaptic } from "../lib/haptics.js";

const UI = "var(--font-ui)";

const dismissKey = (growId) => `locBannerDismissed:${growId}`;

// Front-page nudge shown when the active grow has no location: one tap grants
// location services and saves the coordinates (plus a friendly place label),
// or the grower can type a city instead. Dismissible per grow.
export default function LocationBanner({ growId, onSaved }) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(dismissKey(growId)) === "1"; } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(false);
  const [place, setPlace] = useState("");
  const [error, setError] = useState("");

  if (dismissed) return null;

  function dismiss() {
    tapHaptic();
    setDismissed(true);
    try { localStorage.setItem(dismissKey(growId), "1"); } catch { /* storage unavailable */ }
  }

  async function saveLocation(fields) {
    await api.patchGrow(growId, fields);
    tapHaptic();
    onSaved?.();
  }

  function useMyLocation() {
    setError("");
    if (!navigator.geolocation) {
      setError("Location services are not available here. Type your city instead.");
      setManual(true);
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = Math.round(pos.coords.latitude * 1000) / 1000;
        const lon = Math.round(pos.coords.longitude * 1000) / 1000;
        // A readable place label is a nice-to-have; coordinates alone work.
        let label = "";
        try { label = (await api.reverseGeocode(lat, lon))?.place || ""; } catch { /* keep coords only */ }
        try {
          await saveLocation(label ? { lat, lon, location: label } : { lat, lon });
        } catch (err) {
          setError(err?.message || "Could not save the location. Try again.");
        } finally {
          setBusy(false);
        }
      },
      (err) => {
        setBusy(false);
        setError(err?.code === 1
          ? "Location permission was denied. Type your city instead."
          : "Could not get your location. Type your city instead.");
        setManual(true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  }

  async function saveTyped() {
    const text = place.trim();
    if (text.length < 2) { setError("Type a city or town name."); return; }
    setBusy(true);
    setError("");
    try {
      await saveLocation({ location: text });
    } catch (err) {
      setError(err?.message || "Could not save the location. Try again.");
      setBusy(false);
    }
  }

  return (
    <div style={{ padding: "10px 14px 0" }}>
      <div className="card" style={{ padding: "12px 13px", display: "flex", gap: 11, alignItems: "flex-start" }}>
        <span style={{
          width: 32, height: 32, borderRadius: 16, flexShrink: 0, marginTop: 1,
          background: "rgba(56,189,248,0.14)", border: "1px solid rgba(56,189,248,0.35)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <MapPin size={15} strokeWidth={2} style={{ color: "#38bdf8" }} />
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 700, color: "var(--c-text)" }}>
            Add your grow&rsquo;s location
          </div>
          <div style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-muted)", marginTop: 2, lineHeight: 1.55 }}>
            Automatic weather in your journal and log needs it. Used only for the forecast.
          </div>

          {error && (
            <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-danger-soft)", marginTop: 6, lineHeight: 1.5 }}>
              {error}
            </div>
          )}

          {manual ? (
            <div style={{ display: "flex", gap: 7, marginTop: 9 }}>
              <input
                type="text"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") saveTyped(); }}
                placeholder="City or town"
                maxLength={120}
                autoFocus
                style={{
                  flex: 1, minWidth: 0, padding: "9px 12px", borderRadius: 10,
                  background: "rgba(0,0,0,0.2)", border: "1px solid var(--c-border-strong)",
                  color: "var(--c-text)", fontFamily: UI, fontSize: 14, outline: "none",
                }}
              />
              <button
                type="button"
                onClick={saveTyped}
                disabled={busy}
                style={{
                  flexShrink: 0, padding: "9px 14px", borderRadius: 10,
                  background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.45)",
                  color: "var(--c-accent)", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 7, marginTop: 9, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={useMyLocation}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: "9px 14px", borderRadius: 10,
                  background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.45)",
                  color: "var(--c-accent)", fontFamily: UI, fontSize: 12.5, fontWeight: 700,
                  cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
                }}>
                <LocateFixed size={13} strokeWidth={2.2} />
                {busy ? "Locating…" : "Use my location"}
              </button>
              <button
                type="button"
                onClick={() => { setError(""); setManual(true); }}
                disabled={busy}
                style={{
                  padding: "9px 14px", borderRadius: 10,
                  background: "none", border: "1px solid var(--c-border-strong)",
                  color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5,
                  cursor: "pointer",
                }}>
                Type a city
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          style={{
            flexShrink: 0, background: "none", border: "none", padding: 4,
            color: "var(--c-text-ghost)", cursor: "pointer", display: "flex",
          }}>
          <X size={15} strokeWidth={2} />
        </button>
      </div>
    </div>
  );
}
