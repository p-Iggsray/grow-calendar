import { useState } from "react";
import { api } from "../../lib/api.js";
import { MONO, Label, RadioGroup } from "./styleHelpers.jsx";
import { cropOf, wateringOptions, words } from "../../lib/crops.js";
import PlacePicker from "../PlacePicker.jsx";

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

  const crop = cropOf(survey);
  const mushrooms = crop === "mushrooms";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* A location is what weather and frost dates are read from, and a tub
          indoors is not touched by either. */}
      {!mushrooms && (
      <div>
        <Label>Location / region</Label>
        {/* Pick a real place: its coordinates come with it, so weather and
            frost dates work without a second lookup. */}
        <PlacePicker
          value={survey.location}
          onPick={({ label, lat, lon }) => {
            update("location", label);
            update("lat", lat);
            update("lon", lon);
            setGeoStatus("done");
          }}
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
              background: "rgba(var(--c-accent-rgb), 0.10)", border: "1px solid rgba(var(--c-accent-rgb), 0.3)",
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
      )}
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
        <Label>{words(crop).wateringLabel}</Label>
        <RadioGroup
          value={survey.wateringMethod}
          onChange={v => update("wateringMethod", v)}
          options={wateringOptions(crop)}
        />
      </div>
    </div>
  );
}
