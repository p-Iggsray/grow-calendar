import { useState } from "react";
import { api } from "../lib/api.js";

// ─── Supply checklist ───────────────────────────────────────────────────────

const SUPPLY_ITEMS = [
  { id: "soil",        label: "Potting mix / growing medium",   example: "e.g. Fox Farm Happy Frog, coco coir" },
  { id: "perlite",     label: "Perlite or drainage amendment",  example: "" },
  { id: "containers",  label: "Containers / fabric pots",       example: "e.g. 5-gal or 7-gal fabric pots" },
  { id: "calmag",      label: "Cal-Mag supplement",             example: "e.g. Botanicare Cal-Mag Plus" },
  { id: "veg_nutes",   label: "Veg / grow nutrients",           example: "e.g. Fox Farm Grow Big, General Hydroponics Micro" },
  { id: "bloom_nutes", label: "Bloom / flower nutrients",       example: "e.g. Fox Farm Tiger Bloom, Flora Bloom" },
  { id: "bloom_boost", label: "Bloom booster",                  example: "e.g. Fox Farm Big Bloom, Bud Candy" },
  { id: "ph_kit",      label: "pH test kit or digital pH meter",example: "" },
  { id: "tds_meter",   label: "TDS / EC meter",                 example: "" },
  { id: "support",     label: "Stakes, trellis, or SCROG net",  example: "" },
  { id: "ties",        label: "Plant ties or velcro tape",       example: "" },
  { id: "watering",    label: "Watering can or irrigation",     example: "" },
  { id: "loupe",       label: "Jeweler's loupe (trichome check)",example: "10x or 60x" },
  { id: "humidity",    label: "Hygrometer (humidity meter)",     example: "" },
  { id: "drying",      label: "Drying space",                   example: "dark room, 60-70°F, 55-65% RH" },
  { id: "jars",        label: "Mason jars for curing",          example: "" },
  { id: "neem",        label: "Pest preventative",              example: "e.g. neem oil, insecticidal soap" },
];

const SUPPLY_STATUS = ["have", "need_to_order", "not_using"];
const SUPPLY_STATUS_LABEL = { have: "✓ Have", need_to_order: "⏳ Need", not_using: "— Skip" };
const SUPPLY_STATUS_COLOR = {
  have:          { bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)",  text: "var(--c-accent)" },
  need_to_order: { bg: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.4)", text: "#fbbf24" },
  not_using:     { bg: "var(--c-border-faint)",border: "var(--c-border)","text": "#5a7a5a" },
};

// ─── Default wizard state ───────────────────────────────────────────────────

function defaultSurvey() {
  return {
    growName: "",
    environment: "outdoor",
    medium: "soil",
    containerType: "fabric",
    containerGallons: 7,
    plantCount: 2,
    strains: [
      { name: "", type: "hybrid", photo: true, flowerWeeks: 9 },
      { name: "", type: "sativa", photo: true, flowerWeeks: 11 },
    ],
    startType: "clone",
    transplantDate: "",
    vegWeeks: 10,
    location: "",
    experienceLevel: "beginner",
    wateringMethod: "hand",
    extraNotes: "",
    supplies: Object.fromEntries(SUPPLY_ITEMS.map(s => [s.id, "need_to_order"])),
  };
}

// ─── Style helpers ──────────────────────────────────────────────────────────

const MONO = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";

function Label({ children }) {
  return (
    <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = "text" }) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: "100%", boxSizing: "border-box",
        background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
        border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
        padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
        outline: "none",
      }}
    />
  );
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      {options.map(opt => {
        const sel = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            className="touch-target"
            onClick={() => onChange(opt.value)}
            style={{
              padding: "9px 16px", borderRadius: 10,
              background: sel ? "rgba(34,197,94,0.18)" : "rgba(255,255,255,0.05)",
              border: sel ? "1.5px solid rgba(34,197,94,0.5)" : "1px solid var(--c-border-strong)",
              color: sel ? "var(--c-accent)" : "#8ab89a",
              fontFamily: MONO, fontSize: 12, cursor: "pointer",
              letterSpacing: 0.5, whiteSpace: "nowrap",
            }}>
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function NumStepper({ value, onChange, min = 1, max = 10, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <button
        type="button"
        className="touch-target"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)", color: value <= min ? "var(--c-text-ghost)" : "var(--c-text-dim)",
          fontSize: 20, cursor: value <= min ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        −
      </button>
      <span style={{ fontFamily: MONO, fontSize: 18, fontWeight: 800, color: "var(--c-text)", minWidth: 32, textAlign: "center" }}>
        {value}
      </span>
      <button
        type="button"
        className="touch-target"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        style={{
          width: 40, height: 40, borderRadius: 10, border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)", color: value >= max ? "var(--c-text-ghost)" : "var(--c-text-dim)",
          fontSize: 20, cursor: value >= max ? "default" : "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        +
      </button>
      {label && <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)" }}>{label}</span>}
    </div>
  );
}

// ─── Step components ────────────────────────────────────────────────────────

function StepBasics({ survey, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Grow name</Label>
        <Input value={survey.growName} onChange={v => update("growName", v)} placeholder="e.g. Summer 2026 Outdoor" />
      </div>
      <div>
        <Label>Environment</Label>
        <RadioGroup
          value={survey.environment}
          onChange={v => update("environment", v)}
          options={[
            { value: "outdoor",    label: "Outdoor" },
            { value: "indoor",     label: "Indoor" },
            { value: "greenhouse", label: "Greenhouse" },
          ]}
        />
      </div>
      <div>
        <Label>Growing medium</Label>
        <RadioGroup
          value={survey.medium}
          onChange={v => update("medium", v)}
          options={[
            { value: "soil",  label: "Soil / potting mix" },
            { value: "coco",  label: "Coco coir" },
            { value: "hydro", label: "Hydro" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>
      <div>
        <Label>Container type</Label>
        <RadioGroup
          value={survey.containerType}
          onChange={v => update("containerType", v)}
          options={[
            { value: "fabric",  label: "Fabric pots" },
            { value: "plastic", label: "Plastic pots" },
            { value: "ground",  label: "In-ground" },
            { value: "other",   label: "Other" },
          ]}
        />
      </div>
      {survey.containerType !== "ground" && (
        <div>
          <Label>Container size (gallons)</Label>
          <NumStepper
            value={survey.containerGallons}
            onChange={v => update("containerGallons", v)}
            min={1} max={30}
            label="gal"
          />
        </div>
      )}
      <div>
        <Label>Number of plants</Label>
        <NumStepper
          value={survey.plantCount}
          onChange={v => {
            const strains = [...survey.strains];
            while (strains.length < v) strains.push({ name: "", type: "hybrid", photo: true, flowerWeeks: 9 });
            while (strains.length > v) strains.pop();
            update("strains", strains);
            update("plantCount", v);
          }}
          min={1} max={8}
          label="plants"
        />
      </div>
    </div>
  );
}

function StepStrains({ survey, update }) {
  function updateStrain(i, field, value) {
    const strains = survey.strains.map((s, idx) => idx === i ? { ...s, [field]: value } : s);
    update("strains", strains);
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {survey.strains.map((strain, i) => (
        <div key={i} style={{
          background: "var(--c-surface-1)", borderRadius: 12,
          border: "1px solid var(--c-surface-2)", padding: "16px",
        }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)", marginBottom: 12 }}>
            Plant {i + 1} {i === 0 ? "(primary)" : "(secondary)"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <Label>Strain name</Label>
              <Input
                value={strain.name}
                onChange={v => updateStrain(i, "name", v)}
                placeholder={i === 0 ? "e.g. Blue Dream" : "e.g. OG Kush"}
              />
            </div>
            <div>
              <Label>Type</Label>
              <RadioGroup
                value={strain.type}
                onChange={v => updateStrain(i, "type", v)}
                options={[
                  { value: "indica",  label: "Indica" },
                  { value: "sativa",  label: "Sativa" },
                  { value: "hybrid",  label: "Hybrid" },
                ]}
              />
            </div>
            <div>
              <Label>Photoperiod or autoflower?</Label>
              <RadioGroup
                value={strain.photo ? "photo" : "auto"}
                onChange={v => updateStrain(i, "photo", v === "photo")}
                options={[
                  { value: "photo", label: "Photoperiod" },
                  { value: "auto",  label: "Autoflower" },
                ]}
              />
            </div>
            <div>
              <Label>Expected flower time</Label>
              <NumStepper
                value={strain.flowerWeeks}
                onChange={v => updateStrain(i, "flowerWeeks", v)}
                min={6} max={16}
                label="weeks"
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StepTimeline({ survey, update }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>Starting from</Label>
        <RadioGroup
          value={survey.startType}
          onChange={v => update("startType", v)}
          options={[
            { value: "clone", label: "Clone" },
            { value: "seed",  label: "Seed" },
            { value: "veg",   label: "Already in veg" },
          ]}
        />
      </div>
      <div>
        <Label>Transplant date</Label>
        <input
          type="date"
          value={survey.transplantDate}
          onChange={e => update("transplantDate", e.target.value)}
          style={{
            background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
            border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
            outline: "none", width: "100%", boxSizing: "border-box",
            colorScheme: "dark",
          }}
        />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5, lineHeight: 1.7 }}>
          When plants go into their final containers.
        </div>
      </div>
      <div>
        <Label>Planned veg duration</Label>
        <NumStepper
          value={survey.vegWeeks}
          onChange={v => update("vegWeeks", v)}
          min={4} max={20}
          label="weeks"
        />
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
          For outdoor photoperiod, the plant decides — estimate how long before pre-flower starts in your area.
        </div>
      </div>
    </div>
  );
}

function StepSetup({ survey, update }) {
  const [geoStatus, setGeoStatus] = useState(""); // "" | "locating" | "done" | "error"

  function useMyLocation() {
    if (!navigator.geolocation) { setGeoStatus("error"); return; }
    setGeoStatus("locating");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        update("lat", lat);
        update("lon", lon);
        // Best-effort reverse geocode to fill a readable label when blank.
        if (!survey.location?.trim()) {
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&zoom=10&lat=${lat}&lon=${lon}`,
              { headers: { Accept: "application/json" } },
            );
            if (res.ok) {
              const d = await res.json();
              const a = d.address || {};
              const place = [a.city || a.town || a.village || a.county, a.state]
                .filter(Boolean).join(", ");
              if (place) update("location", place);
            }
          } catch { /* keep coordinates even if the label lookup fails */ }
        }
        setGeoStatus("done");
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
            📍 {geoStatus === "locating" ? "Locating…" : "Use my current location"}
          </button>
          {geoStatus === "done" && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-accent)" }}>✓ Location set</span>
          )}
          {geoStatus === "error" && (
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-danger)" }}>Couldn&apos;t get location — type it above</span>
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

function StepSupplies({ survey, update }) {
  function setStatus(id, status) {
    update("supplies", { ...survey.supplies, [id]: status });
  }

  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;
  const have = Object.values(survey.supplies).filter(v => v === "have").length;

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", marginBottom: 14, lineHeight: 1.8 }}>
        Mark what you have, what you still need, or what you won&apos;t use. The AI will reference this in your calendar.
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-accent)" }}>✓ {have} have</div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-warn)" }}>⏳ {need} need</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {SUPPLY_ITEMS.map(item => {
          const status = survey.supplies[item.id] || "need_to_order";
          return (
            <div key={item.id} style={{
              background: "var(--c-surface-1)", borderRadius: 10,
              border: "1px solid var(--c-surface-2)", padding: "12px 14px",
            }}>
              <div style={{ fontFamily: SERIF, fontSize: 13, color: "var(--c-text-dim)", marginBottom: 4 }}>
                {item.label}
              </div>
              {item.example && (
                <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 8 }}>
                  {item.example}
                </div>
              )}
              <div style={{ display: "flex", gap: 6 }}>
                {SUPPLY_STATUS.map(s => {
                  const c = SUPPLY_STATUS_COLOR[s];
                  const active = status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      className="touch-target"
                      onClick={() => setStatus(item.id, s)}
                      style={{
                        padding: "6px 12px", borderRadius: 8,
                        background: active ? c.bg : "var(--c-surface-1)",
                        border: active ? `1.5px solid ${c.border}` : "1px solid var(--c-surface-2)",
                        color: active ? c.text : "var(--c-text-ghost)",
                        fontFamily: MONO, fontSize: 11, cursor: "pointer",
                        transition: "all 0.15s",
                      }}>
                      {SUPPLY_STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StepReview({ survey }) {
  const primaryStrain = survey.strains[0];
  const secondaryStrain = survey.strains[1];
  const have = Object.values(survey.supplies).filter(v => v === "have").length;
  const need = Object.values(survey.supplies).filter(v => v === "need_to_order").length;

  const rows = [
    ["Grow", survey.growName || "(unnamed)"],
    ["Environment", survey.environment],
    ["Medium", survey.medium],
    ["Plants", `${survey.plantCount} × ${survey.containerType !== "ground" ? `${survey.containerGallons}-gal` : "in-ground"}`],
    ["Primary strain", primaryStrain?.name || "(unnamed)"],
    secondaryStrain ? ["Secondary strain", secondaryStrain?.name || "(unnamed)"] : null,
    ["Start type", survey.startType],
    ["Transplant", survey.transplantDate || "(not set)"],
    ["Veg plan", `${survey.vegWeeks} weeks`],
    ["Location", survey.location || "(not set)"],
    ["Experience", survey.experienceLevel],
    ["Watering", survey.wateringMethod],
    ["Supplies", `${have} have · ${need} to order`],
  ].filter(Boolean);

  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", marginBottom: 14, lineHeight: 1.8 }}>
        Review your answers. The AI will use all of this to build a personalized grow calendar.
      </div>
      <div style={{
        background: "var(--c-surface-1)", borderRadius: 12,
        border: "1px solid var(--c-surface-2)", overflow: "hidden", marginBottom: 20,
      }}>
        {rows.map(([k, v], i) => (
          <div key={k} style={{
            display: "flex", justifyContent: "space-between", alignItems: "flex-start",
            padding: "10px 14px",
            borderTop: i > 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", letterSpacing: 0.5, flexShrink: 0, marginRight: 12 }}>{k}</span>
            <span style={{ fontFamily: SERIF, fontSize: 13, color: "var(--c-text-dim)", textAlign: "right", wordBreak: "break-word" }}>{v}</span>
          </div>
        ))}
      </div>
      {survey.extraNotes?.trim() && (
        <div style={{
          background: "rgba(250,204,21,0.05)", borderRadius: 10,
          border: "1px solid rgba(250,204,21,0.15)", padding: "12px 14px",
          fontFamily: SERIF, fontSize: 13, color: "var(--c-amber-dim)", lineHeight: 1.7, marginBottom: 20,
        }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-harvest)", letterSpacing: 1 }}>NOTES: </span>
          {survey.extraNotes}
        </div>
      )}
    </div>
  );
}

// ─── Wizard shell ────────────────────────────────────────────────────────────

const STEPS = [
  { id: "basics",   title: "Grow Basics" },
  { id: "strains",  title: "Your Strains" },
  { id: "timeline", title: "Timeline" },
  { id: "setup",    title: "Your Setup" },
  { id: "supplies", title: "Supplies" },
  { id: "review",   title: "Review & Generate" },
];

export default function SetupWizard({ onComplete, onCancel, initialSurvey, growId }) {
  const [step, setStep] = useState(0);
  const [survey, setSurvey] = useState(() =>
    initialSurvey ? { ...defaultSurvey(), ...initialSurvey } : defaultSurvey()
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");

  function update(field, value) {
    setSurvey(s => ({ ...s, [field]: value }));
  }

  function canAdvance() {
    if (step === 0) return survey.growName.trim().length > 0;
    if (step === 1) return survey.strains.every(s => s.name.trim().length > 0);
    if (step === 2) return survey.transplantDate.length > 0;
    return true;
  }

  async function generate() {
    setGenerating(true);
    setGenError("");
    try {
      if (growId) {
        await api.setupGrow(growId, survey);
      } else {
        await api.planSetup(survey);
      }
      onComplete();
    } catch (err) {
      setGenError(err.message || "Generation failed. Please try again.");
      setGenerating(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: SERIF,
      color: "var(--c-text)",
      background: "linear-gradient(160deg, #0a1a0d, var(--c-bg))",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 14px",
        paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--c-border-soft)",
        background: "rgba(0,0,0,0.2)",
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-faint)", marginBottom: 4 }}>
          NEW GROW — STEP {step + 1} OF {STEPS.length}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.3 }}>
          {STEPS[step].title}
        </div>
        {/* Progress bar */}
        <div style={{
          height: 3, background: "var(--c-surface-2)", borderRadius: 2, marginTop: 12,
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #22c55e, var(--c-accent))",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {generating ? (
          <GeneratingScreen />
        ) : (
          <>
            {step === 0 && <StepBasics survey={survey} update={update} />}
            {step === 1 && <StepStrains survey={survey} update={update} />}
            {step === 2 && <StepTimeline survey={survey} update={update} />}
            {step === 3 && <StepSetup survey={survey} update={update} />}
            {step === 4 && <StepSupplies survey={survey} update={update} />}
            {step === 5 && <StepReview survey={survey} />}

            {genError && (
              <div style={{
                marginTop: 16, padding: "10px 14px", borderRadius: 10,
                background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
                fontFamily: MONO, fontSize: 12, color: "var(--c-danger-soft)",
              }}>
                {genError}
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      {!generating && (
        <div style={{
          padding: "16px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--c-border-soft)",
          display: "flex", gap: 12,
          background: "rgba(0,0,0,0.3)",
          flexShrink: 0,
        }}>
          {step === 0 && onCancel && (
            <button
              type="button"
              onClick={onCancel}
              style={{
                flex: 1, padding: "14px", borderRadius: 12,
                background: "var(--c-border-faint)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12,
                letterSpacing: 1, cursor: "pointer",
              }}>
              Cancel
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, padding: "14px", borderRadius: 12,
                background: "var(--c-border-faint)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12,
                letterSpacing: 1, cursor: "pointer",
              }}>
              ← Back
            </button>
          )}
          <button
            type="button"
            disabled={!canAdvance()}
            onClick={() => isLast ? generate() : setStep(s => s + 1)}
            style={{
              flex: 2, padding: "14px", borderRadius: 12,
              background: canAdvance()
                ? (isLast ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.18)")
                : "rgba(255,255,255,0.05)",
              border: canAdvance()
                ? (isLast ? "1.5px solid rgba(34,197,94,0.6)" : "1.5px solid rgba(34,197,94,0.4)")
                : "1px solid var(--c-surface-2)",
              color: canAdvance() ? "var(--c-accent)" : "var(--c-text-ghost)",
              fontFamily: MONO, fontSize: 13, letterSpacing: 1,
              cursor: canAdvance() ? "pointer" : "default",
              fontWeight: isLast ? 800 : 400,
            }}>
            {isLast ? "✦ Generate My Calendar" : "Next →"}
          </button>
        </div>
      )}
    </div>
  );
}

function GeneratingScreen() {
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", minHeight: "50vh", gap: 24, textAlign: "center",
    }}>
      <div style={{ fontSize: 48 }}>🌱</div>
      <div>
        <div style={{ fontFamily: MONO, fontSize: 13, fontWeight: 800, color: "var(--c-accent)", letterSpacing: 2, marginBottom: 8 }}>
          BUILDING YOUR CALENDAR
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 14, color: "var(--c-text-muted)", lineHeight: 1.8, maxWidth: 280 }}>
          The AI is analyzing your setup and generating a personalized grow schedule. This takes about 30 seconds.
        </div>
      </div>
      <Spinner />
    </div>
  );
}

function Spinner() {
  return (
    <div style={{
      width: 40, height: 40, borderRadius: "50%",
      border: "3px solid rgba(34,197,94,0.15)",
      borderTopColor: "var(--c-accent)",
      animation: "spin 0.9s linear infinite",
    }} />
  );
}
