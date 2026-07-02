import { useState } from "react";
import { api } from "../../lib/api.js";
import { MONO, SERIF, Label, Input, RadioGroup } from "./styleHelpers.jsx";

export function StepSetup({ survey, update }) {
  const [geoStatus, setGeoStatus] = useState(""); // "" | "locating" | "done" | "nolabel" | "error"

  function useMyLocation() {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        update("lat", lat);
        update("lon", lon);
        // Reverse-geocode via our worker (reliable User-Agent + proxy) and write
        // the readable place name straight into the box.
        try {
          const { place } = await api.reverseGeocode(lat, lon);
          if (place) { update("location", place); setGeoStatus("done"); return; }
        } catch { /* fall through - coordinates are still saved */ }
        setGeoStatus("nolabel");
      },
      () => setGeoStatus("error"),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Location / region</Label>
        <Input
          value={survey.location}
          onChange={v => { update("location", v); update("lat", null); update("lon", null); }}
          placeholder="e.g. City, State or Country"
        />
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
          <button
            type="button"
            className="touch-target"
            onClick={useMyLocation}
            disabled={geoStatus === "locating"}
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              padding: "8px 14px", borderRadius: 10,
              background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.3)",
              color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
              cursor: geoStatus === "locating" ? "default" : "pointer",
            }}
          >
            {geoStatus === "locating" ? "Locating..." : "Use my current location"}
          </button>
          {geoStatus === "done" && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-accent)" }}>✓ Filled in above</span>
          )}
          {geoStatus === "nolabel" && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)" }}>Got your coordinates. Add a place name above.</span>
          )}
          {geoStatus === "error" && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-danger)" }}>Could not get location. Type it above.</span>
          )}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5, lineHeight: 1.7 }}>
          Used to tailor weather, frost timing, and threats to your area.
        </div>
      </div>
      <div>
        <Label>Experience level</Label>
        <RadioGroup
          value={survey.experienceLevel}
          onChange={v => update("experienceLevel", v)}
          options={[
            { value: "beginner",     label: "First grow" },
            { value: "intermediate", label: "1-3 grows" },
            { value: "advanced",     label: "4+ grows" },
          ]}
        />
      </div>
      <div>
        <Label>Watering method</Label>
        <RadioGroup
          value={survey.wateringMethod}
          onChange={v => update("wateringMethod", v)}
          options={[
            { value: "hand", label: "Hand watering" },
            { value: "drip", label: "Drip / automated" },
          ]}
        />
      </div>
      <div>
        <Label>Anything else the AI should know</Label>
        <textarea
          value={survey.extraNotes}
          onChange={e => update("extraNotes", e.target.value)}
          placeholder="e.g. Fully outdoor in containers, hot and dry summers. I'm away for a week in August, so I need low-maintenance stretches."
          rows={5}
          style={{
            width: "100%", boxSizing: "border-box", resize: "vertical",
            background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
            outline: "none", lineHeight: 1.7,
          }}
        />
      </div>
    </div>
  );
}
