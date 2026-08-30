import { useState } from "react";
import { Label, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";
import ChoiceField from "../ChoiceField.jsx";
import { SPACE_SIZES, LIGHT_SCHEDULES, LIGHT_TYPES, LIGHT_WATTS } from "../../lib/choices.js";

// What a grow environment IS: the kind of space, its size and capacity, the
// lighting over it, and what the plants sit in. Saved into the environment's
// survey by api.saveEnvironmentSetup.

const BLANK = {
  environment: "outdoor",
  envSize: "",
  envCapacity: 0,
  lightSchedule: "",
  lightType: "",
  lightWatts: "",
  medium: "soil",
  containerType: "fabric",
  containerGallons: 0,
  wateringMethod: "hand",
};

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function EnvSetupForm({ survey, onSave, onCancel, saving }) {
  const [f, setF] = useState(() => ({
    ...BLANK,
    ...Object.fromEntries(
      Object.keys(BLANK)
        .filter((k) => survey?.[k] !== undefined && survey?.[k] !== null)
        .map((k) => [k, survey[k]]),
    ),
  }));
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));
  const indoorish = f.environment !== "outdoor";

  function submit() {
    onSave({
      ...f,
      envCapacity: f.envCapacity || null,
      containerGallons: f.containerGallons || null,
      lightWatts: f.lightWatts === "" ? null : Number(f.lightWatts),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <Label>Kind of space</Label>
        <RadioGroup
          value={f.environment}
          onChange={(v) => up("environment", v)}
          options={[
            { value: "indoor", label: "Indoor" },
            { value: "outdoor", label: "Outdoor" },
            { value: "greenhouse", label: "Greenhouse" },
          ]}
        />
      </div>

      <div>
        <Label>Size</Label>
        <ChoiceField
          value={f.envSize}
          onChange={(v) => up("envSize", v)}
          presets={SPACE_SIZES}
          fieldKey="env-size"
          placeholder={indoorish ? "Choose a tent size" : "Choose a plot size"}
          searchLabel="Search sizes"
        />
      </div>

      <div>
        <Label>Plant capacity</Label>
        <NumStepper value={Number(f.envCapacity) || 0} onChange={(v) => up("envCapacity", v)} min={0} max={100} label="plants" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <Label>Light schedule</Label>
          <ChoiceField
            value={f.lightSchedule}
            onChange={(v) => up("lightSchedule", v)}
            presets={LIGHT_SCHEDULES}
            fieldKey="light-schedule"
            placeholder="Choose a schedule"
          />
        </div>
        <div>
          <Label>Light type</Label>
          <ChoiceField
            value={f.lightType}
            onChange={(v) => up("lightType", v)}
            presets={LIGHT_TYPES}
            fieldKey="light-type"
            placeholder="Choose a light"
            searchLabel="Search lights"
          />
        </div>
        <div>
          <Label>Wattage</Label>
          <ChoiceField
            value={String(f.lightWatts ?? "")}
            onChange={(v) => up("lightWatts", v)}
            presets={LIGHT_WATTS}
            fieldKey="light-watts"
            placeholder="Choose the wattage"
            customLabel="Another wattage…"
          />
        </div>
      </div>

      <div>
        <Label>Medium</Label>
        <RadioGroup
          value={f.medium}
          onChange={(v) => up("medium", v)}
          options={[
            { value: "soil", label: "Soil" },
            { value: "coco", label: "Coco" },
            { value: "hydro", label: "Hydro" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>

      <div>
        <Label>Containers</Label>
        <RadioGroup
          value={f.containerType}
          onChange={(v) => up("containerType", v)}
          options={[
            { value: "fabric", label: "Fabric" },
            { value: "plastic", label: "Plastic" },
            { value: "ground", label: "In-ground" },
            { value: "other", label: "Other" },
          ]}
        />
      </div>

      {f.containerType !== "ground" && (
        <div>
          <Label>Pot size</Label>
          <NumStepper value={Number(f.containerGallons) || 0} onChange={(v) => up("containerGallons", v)} min={0} max={100} label="gal" />
        </div>
      )}

      <div>
        <Label>Watering</Label>
        <RadioGroup
          value={f.wateringMethod}
          onChange={(v) => up("wateringMethod", v)}
          options={[
            { value: "hand", label: "Hand watering" },
            { value: "drip", label: "Drip / automated" },
          ]}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
        <button type="button" onClick={onCancel} style={btn("ghost")}>Cancel</button>
        <button type="button" disabled={saving} onClick={submit} style={btn("primary", saving)}>
          {saving ? "Saving…" : "Save setup"}
        </button>
      </div>
    </div>
  );
}
