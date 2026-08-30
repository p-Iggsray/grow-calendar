import { useEffect, useRef, useState } from "react";
import { MapPin, LocateFixed, Search } from "lucide-react";
import { api } from "../lib/api.js";
import { tapHaptic } from "../lib/haptics.js";

const UI = "var(--font-ui)";

// Pick a real place instead of typing one and hoping it resolves. Typing
// searches as you go; choosing a result hands back its coordinates too, so
// weather works immediately with no second lookup.
//
// onPick({ label, lat, lon }) fires on selection.
export default function PlacePicker({ value = "", onPick, onUseMyLocation, locating, autoFocus }) {
  const [query, setQuery] = useState(value);
  const [places, setPlaces] = useState([]);
  const [searching, setSearching] = useState(false);
  const [touched, setTouched] = useState(false);
  const timer = useRef(null);
  const reqId = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  function runSearch(text) {
    setQuery(text);
    setTouched(true);
    clearTimeout(timer.current);
    const q = text.trim();
    if (q.length < 2) { setPlaces([]); setSearching(false); return; }
    setSearching(true);
    // Debounced so a fast typist does not fire a lookup per keystroke.
    timer.current = setTimeout(() => {
      const myId = ++reqId.current;
      api.searchPlaces(q)
        .then((d) => { if (myId === reqId.current) setPlaces(d.places ?? []); })
        .catch(() => { if (myId === reqId.current) setPlaces([]); })
        .finally(() => { if (myId === reqId.current) setSearching(false); });
    }, 350);
  }

  function choose(place) {
    tapHaptic();
    setQuery(place.label);
    setPlaces([]);
    setTouched(false);
    onPick?.({ label: place.label, lat: place.lat, lon: place.lon });
  }

  return (
    <div>
      <div style={{
        display: "flex", alignItems: "center", gap: 9, padding: "0 12px",
        borderRadius: 10, background: "rgba(0,0,0,0.25)",
        border: "1px solid var(--c-border-strong)",
      }}>
        <Search size={16} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Start typing a city or town"
          style={{
            flex: 1, minWidth: 0, padding: "12px 0", border: "none", background: "none",
            color: "var(--c-text)", fontFamily: UI, fontSize: 16, outline: "none",
          }}
        />
      </div>

      {onUseMyLocation && (
        <button
          type="button"
          onClick={onUseMyLocation}
          disabled={locating}
          style={{
            display: "inline-flex", alignItems: "center", gap: 6, marginTop: 8,
            padding: "8px 13px", borderRadius: 10,
            background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)",
            color: "var(--c-accent)", fontFamily: UI, fontSize: 11.5,
            cursor: locating ? "default" : "pointer", opacity: locating ? 0.6 : 1,
          }}>
          <LocateFixed size={13} strokeWidth={2.2} />
          {locating ? "Locating…" : "Use my location"}
        </button>
      )}

      {touched && query.trim().length >= 2 && (
        <div style={{ marginTop: 8 }}>
          {searching && places.length === 0 && (
            <div style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-ghost)", padding: "8px 2px" }}>
              Searching…
            </div>
          )}
          {!searching && places.length === 0 && (
            <div style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-ghost)", padding: "8px 2px", lineHeight: 1.6 }}>
              No places found. Try a bigger nearby town.
            </div>
          )}
          {places.map((p) => (
            <button
              key={`${p.lat},${p.lon}`}
              type="button"
              onClick={() => choose(p)}
              style={{
                display: "flex", alignItems: "center", gap: 9, width: "100%",
                padding: "11px 8px", borderRadius: 10, minHeight: 48,
                background: "none", border: "none",
                borderBottom: "1px solid var(--c-border-faint)",
                color: "var(--c-text)", fontFamily: UI, fontSize: 14,
                textAlign: "left", cursor: "pointer",
              }}>
              <MapPin size={14} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
