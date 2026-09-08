import { useState } from "react";
import { Label, RadioGroup, NumStepper, MONO } from "../SetupWizard/styleHelpers.jsx";
import ChoiceField from "../ChoiceField.jsx";
import { SPACE_SIZES, LIGHT_SCHEDULES, LIGHT_TYPES, LIGHT_WATTS } from "../../lib/choices.js";
import {
  CROPS, containerOptions, cropDefaults, cropOf, mediumOptions, wateringOptions, words,
} from "../../lib/crops.js";

// What a grow environment IS: what it grows, the kind of space, its size and
// capacity, the lighting over it, and what the plants or tubs sit in. Saved
// into the environment's survey by api.saveEnvironmentSetup.
//
// What it grows comes first, because every question under it depends on the
// answer: a tent asks about medium, pots and a watering method, a monotub asks
// about substrate, tub size and how the humidity is held up.

const BLANK = {
  crop: "cannabis",
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

const CROP_ICON = { cannabis: "🌿", mushrooms: "🍄" };

function btn(kind, disabled) {
  const base = { flex: 1, padding: "12px 14px", borderRadius: 10, fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: disabled ? "default" : "pointer" };
  if (kind === "primary") {
    return { ...base, background: "rgba(var(--c-accent-rgb), 0.15)", border: "1px solid rgba(var(--c-accent-rgb), 0.4)", color: disabled ? "var(--c-text-ghost)" : "var(--c-accent)", opacity: disabled ? 0.6 : 1 };
  }
  return { ...base, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)" };
}

export default function EnvSetupForm({ survey, plantCount = 0, onSave, onCancel, saving }) {
  const [f, setF] = useState(() => ({
    ...BLANK,
    crop: cropOf(survey),
    ...Object.fromEntries(
      Object.keys(BLANK)
        .filter((k) => survey?.[k] !== undefined && survey?.[k] !== null)
        .map((k) => [k, survey[k]]),
    ),
  }));
  const up = (k, v) => setF((prev) => ({ ...prev, [k]: v }));

  const crop = cropOf(f.crop);
  const w = words(crop);
  const mushrooms = crop === "mushrooms";
  const indoorish = f.environment !== "outdoor";
  // A space that already holds plants or tubs is stuck with what it grows:
  // their stages, their types and their whole recorded history are written in
  // that crop's terms, and switching would leave every one of them stranded on
  // a ladder they are not on. Empty, it is free to change.
  const cropLocked = plantCount > 0;

  // Changing the crop is not editing one answer, it is answering three others
  // differently, so the fields that mean something else start again.
  function setCrop(next) {
    if (cropLocked || cropOf(next) === crop) return;
    setF((prev) => ({ ...prev, ...cropDefaults(next), containerGallons: 0 }));
  }

  function submit() {
    onSave({
      ...f,
      crop,
      envCapacity: f.envCapacity || null,
      containerGallons: f.containerGallons || null,
      lightWatts: f.lightWatts === "" ? null : Number(f.lightWatts),
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <Label>What this space grows</Label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {CROPS.map((c) => {
            const cw = words(c);
            const sel = c === crop;
            const dim = cropLocked && !sel;
            return (
              <button
                key={c}
                type="button"
                disabled={cropLocked}
                onClick={() => setCrop(c)}
                aria-pressed={sel}
                style={{
                  textAlign: "left", padding: "12px 13px", borderRadius: 12,
                  background: sel ? "rgba(var(--c-accent-rgb), 0.16)" : "var(--c-surface-1)",
                  border: `1.5px solid ${sel ? "rgba(var(--c-accent-rgb), 0.6)" : "var(--c-surface-2)"}`,
                  cursor: cropLocked ? "default" : "pointer",
                  opacity: dim ? 0.4 : 1,
                  display: "flex", flexDirection: "column", gap: 3,
                }}>
                <span style={{ fontSize: 19, lineHeight: 1 }}>{CROP_ICON[c]}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: sel ? "var(--c-accent)" : "var(--c-text)" }}>
                  {cw.cropLabel}
                </span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-faint)", lineHeight: 1.45 }}>
                  {cw.cropBlurb}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 7, lineHeight: 1.6 }}>
          {cropLocked
            ? `Fixed while this space holds ${plantCount} ${plantCount === 1 ? w.unit : w.units}: every stage and entry recorded is written in those terms. Empty the space to change it.`
            : "Everything below depends on this, so changing it starts those answers again."}
        </div>
      </div>

      {/* A tub lives indoors by definition; the question is only worth asking
          where the answer could go either way. */}
      {!mushrooms && (
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
      )}

      <div>
        <Label>Size</Label>
        <ChoiceField
          value={f.envSize}
          onChange={(v) => up("envSize", v)}
          presets={SPACE_SIZES}
          fieldKey="env-size"
          placeholder={mushrooms ? "Choose a shelf or room size" : (indoorish ? "Choose a tent size" : "Choose a plot size")}
          searchLabel="Search sizes"
        />
      </div>

      <div>
        <Label>{w.capacityLabel}</Label>
        <NumStepper value={Number(f.envCapacity) || 0} onChange={(v) => up("envCapacity", v)} min={0} max={100} label={w.units} />
      </div>

      {/* Light drives a cannabis grow and only orients a mushroom, so a tub is
          not asked to account for its schedule and wattage. */}
      {!mushrooms && (
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
      )}

      <div>
        <Label>{w.mediumLabel}</Label>
        <RadioGroup value={f.medium} onChange={(v) => up("medium", v)} options={mediumOptions(crop)} />
      </div>

      <div>
        <Label>{w.containersLabel}</Label>
        <RadioGroup value={f.containerType} onChange={(v) => up("containerType", v)} options={containerOptions(crop)} />
      </div>

      {f.containerType !== "ground" && (
        <div>
          <Label>{w.containerLabel}</Label>
          <NumStepper
            value={Number(f.containerGallons) || 0}
            onChange={(v) => up("containerGallons", v)}
            min={0}
            max={w.containerMax}
            step={mushrooms ? 2 : 1}
            label={w.containerUnit}
          />
        </div>
      )}

      <div>
        <Label>{w.wateringLabel}</Label>
        <RadioGroup value={f.wateringMethod} onChange={(v) => up("wateringMethod", v)} options={wateringOptions(crop)} />
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
