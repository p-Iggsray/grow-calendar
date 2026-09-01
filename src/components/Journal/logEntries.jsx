import { X, Plus } from "lucide-react";
import ChoiceField from "../ChoiceField.jsx";
import { TRAINING_ACTIONS } from "../../lib/choices.js";
import {
  WATER_UNITS, UNIT_STEP, rowDisplay, waterRow, rememberWaterUnit,
} from "../../lib/waterUnits.js";

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

export function LogField({ label, name, entry, setField, step, min, max, placeholder = "-", inputMode = "decimal" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
        {label}
      </span>
      <input
        type="number"
        inputMode={inputMode}
        step={step}
        min={min}
        max={max}
        value={entry[name] ?? ""}
        onChange={e => setField(name, e.target.value)}
        placeholder={placeholder}
        style={{
          background: "var(--c-surface-1)", color: "var(--c-text)",
          border: "1px solid var(--c-border-strong)", borderRadius: 8,
          padding: "10px 12px", fontSize: 16, outline: "none",
          fontFamily: "var(--font-ui)",
          WebkitAppearance: "none", MozAppearance: "textfield",
          width: "100%", boxSizing: "border-box",
        }}
      />
    </label>
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
export function PlantSelect({ value, onChange, plants = [] }) {
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
      aria-label="Plant">
      <option value="">All plants</option>
      {options.map((n) => <option key={n} value={n}>{n}</option>)}
    </select>
  );
}

export function WaterEntry({ entry, onChangeField, onRemove, hidePlant, plants = [] }) {
  const { amount, unit } = rowDisplay(entry);

  // Changing either the number or the unit rewrites the whole row, so the
  // canonical gallons stay in step with what is on screen. Switching the unit
  // keeps the number you typed - 2 gal becomes 2 L, not 7.57 L - because you
  // are correcting the unit, not converting the measurement.
  const setAmount = (v) => onChangeField("__row", waterRow(entry, v, unit));
  const setUnit = (v) => { rememberWaterUnit(v); onChangeField("__row", waterRow(entry, amount ?? "", v)); };

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
      {!hidePlant && (
      <label style={{ flex: 2, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={_entryLabel}>Plant</span>
        <PlantSelect value={entry.plant} onChange={(v) => onChangeField("plant", v)} plants={plants} />
      </label>
      )}
      <label style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={_entryLabel}>Water</span>
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
        aria-label="Remove plant watering">
        <X size={12} strokeWidth={2} />
      </button>
    </div>
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

const LEAF_COLORS = ["Dark Green", "Green", "Light Green", "Yellow-Green", "Yellow", "Rust / Brown", "Spotted", "Purple"];
const TRICHOME_STAGES = [
  { value: "",       label: " -  not checked  - " },
  { value: "clear",  label: "Clear (too early)" },
  { value: "cloudy", label: "Cloudy / Milky (peak THC)" },
  { value: "mixed",  label: "Mixed Cloudy + Amber" },
  { value: "amber",  label: "Mostly Amber (max CBN)" },
];
export function PlantHealthEntry({ entry, onChangeField, onRemove, hidePlant, plants = [] }) {
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
          <span style={_entryLabel}>Leaf Color</span>
          <select value={entry.color ?? ""} onChange={e => onChangeField("color", e.target.value)} style={_selectInput}>
            <option value=""> - </option>
            {LEAF_COLORS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 8 }}>
        <span style={_entryLabel}>Trichomes</span>
        <select value={entry.trichomes ?? ""} onChange={e => onChangeField("trichomes", e.target.value)} style={_selectInput}>
          {TRICHOME_STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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
