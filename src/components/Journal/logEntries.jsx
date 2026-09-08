import { useState } from "react";
import { X, Plus, Droplets, Scissors, Stethoscope } from "lucide-react";
import ChoiceField from "../ChoiceField.jsx";
import { TRAINING_ACTIONS } from "../../lib/choices.js";
import {
  WATER_UNITS, UNIT_STEP, rowDisplay, waterRow, rememberWaterUnit, loadWaterUnit,
} from "../../lib/waterUnits.js";
import { cropOf } from "../../lib/crops.js";

// ── Log tab helpers ────────────────────────────────────────────────────────

export function LogSection({ label, first = false, children }) {
  return (
    <div style={{ marginTop: first ? 0 : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{
          fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 2,
          color: "var(--c-text-muted)", textTransform: "uppercase", whiteSpace: "nowrap",
        }}>
          {label}
        </span>
        <div style={{ flex: 1, height: 1, background: "var(--c-border)" }} />
      </div>
      {children}
    </div>
  );
}

export function AddEntryButton({ onClick, label }) {
  return (
    <button
      type="button"
      className="touch-target"
      onClick={onClick}
      style={{
        width: "100%", padding: "11px", borderRadius: 10, marginTop: 6,
        background: "none", border: "1px dashed var(--c-border)",
        color: "var(--c-text-ghost)", cursor: "pointer",
        fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 1.5,
        display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        transition: "border-color 0.15s, color 0.15s",
      }}>
      <Plus size={11} strokeWidth={2.5} />
      {label}
    </button>
  );
}

const _entryCard = {
  background: "var(--c-surface-1)",
  border: "1px solid var(--c-surface-2)",
  borderRadius: 10,
  padding: "12px",
  marginBottom: 8,
};
const _entryRemove = {
  background: "none", border: "1px solid var(--c-border)",
  borderRadius: 6, color: "var(--c-text-ghost)", cursor: "pointer",
  display: "flex", alignItems: "center", justifyContent: "center",
  padding: "4px", minWidth: 26, minHeight: 26, flexShrink: 0,
};
const _entryInput = {
  background: "var(--c-surface-1)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 8,
  padding: "9px 10px", fontSize: 14, outline: "none",
  fontFamily: "var(--font-ui)",
  width: "100%", boxSizing: "border-box",
};
const _entryLabel = {
  fontFamily: "var(--font-ui)", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
  marginBottom: 5, display: "block",
};

// The day's total, in canonical gallons (string, or "" if none). Rows may be
// in different units; `gal` is the one field they all share, which is the whole
// reason it is stored alongside what the grower typed.
export function sumWater(arr) {
  const total = (arr ?? []).reduce((s, w) => {
    const n = parseFloat(w?.gal);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
  return total > 0 ? String(Math.round(total * 10000) / 10000) : "";
}

const _selectInput = {
  ..._entryInput,
  cursor: "pointer",
  WebkitAppearance: "auto",
  MozAppearance: "auto",
  appearance: "auto",
};


// The plants of this environment as a dropdown. A row saved before the plant
// existed (or typed by hand long ago) keeps its value as an extra option, so
// switching to a picker never silently erases what was recorded.
export function PlantSelect({ value, onChange, plants = [], unitWord = "plant" }) {
  const names = plants.map((p) => (p?.name || "").trim()).filter(Boolean);
  const current = String(value ?? "").trim();
  const options = current && !names.some((n) => n.toLowerCase() === current.toLowerCase())
    ? [...names, current]
    : names;
  return (
    <select
      value={current}
      onChange={(e) => onChange(e.target.value)}
      style={_selectInput}
      aria-label={unitWord === "plant" ? "Plant" : "Tub"}>
      <option value="">{`All ${unitWord}s`}</option>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

export function WaterEntry({ entry, onChangeField, onRemove, hidePlant, plants = [], unitWord = "plant", crop }) {
  const { amount, unit } = rowDisplay(entry);

  // Changing either the number or the unit rewrites the whole row, so the
  // canonical gallons stay in step with what is on screen. Switching the unit
  // keeps the number you typed - 2 gal becomes 2 L, not 7.57 L - because you
  // are correcting the unit, not converting the measurement.
  const setAmount = (v) => onChangeField("__row", waterRow(entry, v, unit));
  const setUnit = (v) => { rememberWaterUnit(v, cropOf(crop)); onChangeField("__row", waterRow(entry, amount ?? "", v)); };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
      {!hidePlant && (
      <label style={{ flex: 2, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={_entryLabel}>{unitWord === "plant" ? "Plant" : "Tub"}</span>
        <PlantSelect value={entry.plant} onChange={(v) => onChangeField("plant", v)} plants={plants} unitWord={unitWord} />
      </label>
      )}
      <label style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={_entryLabel}>{unitWord === "plant" ? "Water" : "Misted"}</span>
        <input
          type="number"
          inputMode="decimal"
          step={UNIT_STEP[unit] ?? 0.25}
          min={0}
          value={amount ?? ""}
          onChange={e => setAmount(e.target.value)}
          placeholder="0"
          style={{ ..._entryInput, WebkitAppearance: "none", MozAppearance: "textfield" }}
        />
      </label>
      <label style={{ flexShrink: 0, display: "flex", flexDirection: "column", width: 74 }}>
        <span style={_entryLabel}>Unit</span>
        <select
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          style={_selectInput}
          aria-label="Water unit">
          {WATER_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
        </select>
      </label>
      <button
        type="button"
        className="touch-target"
        onClick={onRemove}
        style={{ ..._entryRemove, height: 38, minHeight: 38 }}
        aria-label={`Remove ${unitWord} watering`}>
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

// Doing something to the whole tent is one action but several records, and the
// same shell says so for every section: fill it in once, and every plant gets
// its own row. A row per plant is what the day, the report and each plant's own
// history read back - one shared row never says which plant it was about.
function EveryPlantBox({ title, count, unitWord, actionWord, Icon, onSubmit, disabled, children }) {
  return (
    <div style={{
      border: "1px dashed var(--c-border-strong)", borderRadius: 10,
      padding: "11px 11px 12px", marginTop: 6,
    }}>
      <span style={{ ..._entryLabel, marginBottom: 8 }}>{title}</span>
      {children}
      <button
        type="button"
        className="touch-target"
        onClick={onSubmit}
        disabled={disabled}
        style={{
          width: "100%", padding: "10px", borderRadius: 10, marginTop: 9,
          background: disabled ? "var(--c-surface-1)" : "rgba(96,165,250,0.14)",
          border: `1px solid ${disabled ? "var(--c-border)" : "rgba(96,165,250,0.4)"}`,
          color: disabled ? "var(--c-text-ghost)" : "#60a5fa",
          cursor: disabled ? "default" : "pointer",
          fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 1.5,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
        }}>
        <Icon size={11} strokeWidth={2.5} />
        {`${actionWord} FOR ALL ${count} ${unitWord.toUpperCase()}${count === 1 ? "" : "S"}`}
      </button>
    </div>
  );
}

// Type the amount once and every plant gets its own row at that amount.
export function WaterAllPlants({ count, title = "Water every plant", unitWord = "plant", crop, onAdd }) {
  const [amount, setAmount] = useState("");
  const [unit, setUnit] = useState(() => loadWaterUnit(cropOf(crop)));

  function submit() {
    rememberWaterUnit(unit, cropOf(crop));
    onAdd(amount, unit);
    setAmount("");
  }

  return (
    <EveryPlantBox
      title={title}
      count={count}
      unitWord={unitWord}
      actionWord="LOG THIS"
      Icon={Droplets}
      onSubmit={submit}
      disabled={!String(amount).trim()}>
      <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
        <label style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
          <span style={{ ..._entryLabel, fontSize: 10 }}>{`Each ${unitWord} got`}</span>
          <input
            type="number"
            inputMode="decimal"
            step={UNIT_STEP[unit] ?? 0.25}
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }}
            placeholder="0"
            style={{ ..._entryInput, WebkitAppearance: "none", MozAppearance: "textfield" }}
          />
        </label>
        <label style={{ flexShrink: 0, display: "flex", flexDirection: "column", width: 74 }}>
          <span style={{ ..._entryLabel, fontSize: 10 }}>Unit</span>
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            style={_selectInput}
            aria-label="Water unit for every plant">
            {WATER_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </label>
      </div>
    </EveryPlantBox>
  );
}

// The same idea for training: "I defoliated everything" is one sentence and one
// row per plant, so each plant's own history carries it.
export function TrainingAllPlants({ count, unitWord = "plant", onAdd }) {
  const [action, setAction] = useState("");
  function submit() { onAdd(action); setAction(""); }
  return (
    <EveryPlantBox
      title={`Train every ${unitWord}`}
      count={count}
      unitWord={unitWord}
      actionWord="LOG THIS"
      Icon={Scissors}
      onSubmit={submit}
      disabled={!action.trim()}>
      <span style={{ ..._entryLabel, fontSize: 10 }}>{`What you did to each ${unitWord}`}</span>
      <ChoiceField
        value={action}
        onChange={setAction}
        presets={TRAINING_ACTIONS}
        fieldKey="training-action"
        placeholder="Choose what you did"
        searchLabel="Search training"
      />
    </EveryPlantBox>
  );
}

// And for a health check: looking over the whole tent and finding the same
// thing is still an observation about each plant.
export function HealthAllPlants({ count, unitWord = "plant", crop, onAdd }) {
  const look = HEALTH_LOOK[cropOf(crop)];
  const [color, setColor] = useState("");
  const [check, setCheck] = useState("");
  const [notes, setNotes] = useState("");
  function submit() {
    onAdd({ color, trichomes: check, notes });
    setColor(""); setCheck(""); setNotes("");
  }
  return (
    <EveryPlantBox
      title={`Same observation for every ${unitWord}`}
      count={count}
      unitWord={unitWord}
      actionWord="LOG THIS"
      Icon={Stethoscope}
      onSubmit={submit}
      disabled={!color && !check && !notes.trim()}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <span style={{ ..._entryLabel, fontSize: 10 }}>{look.colorLabel}</span>
          <select value={color} onChange={(e) => setColor(e.target.value)} style={_selectInput}>
            <option value=""> - </option>
            {look.colors.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <span style={{ ..._entryLabel, fontSize: 10 }}>{look.checkLabel}</span>
          <select value={check} onChange={(e) => setCheck(e.target.value)} style={_selectInput}>
            {look.checks.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
      <span style={{ ..._entryLabel, fontSize: 10 }}>Observations</span>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        rows={2}
        placeholder="What was true of all of them today…"
        style={{ ..._entryInput, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}
      />
    </EveryPlantBox>
  );
}

export function TrainingEntry({ entry, onChangeField, onRemove, hidePlant, plants = [] }) {
  return (
    <div style={_entryCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ..._entryLabel, marginBottom: 0, fontSize: 11 }}>Training</span>
        <button type="button" className="touch-target" onClick={onRemove} style={_entryRemove} aria-label="Remove">
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: hidePlant ? "1fr" : "1fr 2fr", gap: 8 }}>
        {!hidePlant && (
        <div>
          <span style={_entryLabel}>Plant</span>
          <PlantSelect value={entry.plant} onChange={(v) => onChangeField("plant", v)} plants={plants} />
        </div>
        )}
        <div>
          <span style={_entryLabel}>Action</span>
          <ChoiceField
            value={entry.action ?? ""}
            onChange={(v) => onChangeField("action", v)}
            presets={TRAINING_ACTIONS}
            fieldKey="training-action"
            placeholder="Choose what you did"
            searchLabel="Search training"
          />
        </div>
      </div>
    </div>
  );
}

// What you actually look at, and it is not the same thing twice. On a plant it
// is leaf colour and trichomes under a loupe; in a tub it is what the surface
// looks like and whether anything is growing that should not be.
const HEALTH_LOOK = {
  cannabis: {
    colorLabel: "Leaf Color",
    colors: ["Dark Green", "Green", "Light Green", "Yellow-Green", "Yellow", "Rust / Brown", "Spotted", "Purple"],
    checkLabel: "Trichomes",
    checks: [
      { value: "",       label: " -  not checked  - " },
      { value: "clear",  label: "Clear (too early)" },
      { value: "cloudy", label: "Cloudy / Milky (peak THC)" },
      { value: "mixed",  label: "Mixed Cloudy + Amber" },
      { value: "amber",  label: "Mostly Amber (max CBN)" },
    ],
  },
  mushrooms: {
    colorLabel: "Surface",
    colors: ["White / healthy", "Knitting over", "Pinning", "Fruiting", "Patchy", "Yellowing", "Wet / overhydrated", "Drying out"],
    checkLabel: "Contamination check",
    checks: [
      { value: "",        label: " -  not checked  - " },
      { value: "clean",   label: "Clean, no signs" },
      { value: "suspect", label: "Something suspect, watching it" },
      { value: "green",   label: "Green mould (Trichoderma)" },
      { value: "cobweb",  label: "Cobweb mould" },
      { value: "bacterial", label: "Wet spot / bacterial" },
    ],
  },
};

export function PlantHealthEntry({ entry, crop, onChangeField, onRemove, hidePlant, plants = [] }) {
  const look = HEALTH_LOOK[cropOf(crop)];
  return (
    <div style={_entryCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ..._entryLabel, marginBottom: 0, fontSize: 11 }}>Health Observation</span>
        <button type="button" className="touch-target" onClick={onRemove} style={_entryRemove} aria-label="Remove">
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        {!hidePlant && (
        <div>
          <span style={_entryLabel}>Plant</span>
          <PlantSelect value={entry.plant} onChange={(v) => onChangeField("plant", v)} plants={plants} />
        </div>
        )}
        <div>
          <span style={_entryLabel}>{look.colorLabel}</span>
          <select value={entry.color ?? ""} onChange={e => onChangeField("color", e.target.value)} style={_selectInput}>
            <option value=""> - </option>
            {look.colors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={_entryLabel}>{look.checkLabel}</span>
        <select value={entry.trichomes ?? ""} onChange={e => onChangeField("trichomes", e.target.value)} style={_selectInput}>
          {look.checks.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>
      <div>
        <span style={_entryLabel}>Observations</span>
        <textarea
          value={entry.notes ?? ""}
          onChange={e => onChangeField("notes", e.target.value)}
          rows={2}
          placeholder="Smell, structure, bud density, leaf curl, any concerns…"
          style={{ ..._entryInput, resize: "vertical", lineHeight: 1.6, fontFamily: "var(--font-ui)" }}
        />
      </div>
    </div>
  );
}
