import { X, Plus } from "lucide-react";
import ChoiceField from "../ChoiceField.jsx";
import { TRAINING_ACTIONS } from "../../lib/choices.js";

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
          background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
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
  background: "rgba(0,0,0,0.2)",
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
  background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
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

// Sum the per-plant water amounts into a day total (string, or "" if none).
export function sumWater(arr) {
  const total = (arr ?? []).reduce((s, w) => {
    const n = parseFloat(w?.gal);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
  return total > 0 ? String(Math.round(total * 100) / 100) : "";
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
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
      {!hidePlant && (
      <label style={{ flex: 2, display: "flex", flexDirection: "column" }}>
        <span style={_entryLabel}>Plant</span>
        <PlantSelect value={entry.plant} onChange={(v) => onChangeField("plant", v)} plants={plants} />
      </label>
      )}
      <label style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <span style={_entryLabel}>Water (gal)</span>
        <input
          type="number"
          inputMode="decimal"
          step={0.25}
          min={0}
          max={99}
          value={entry.gal ?? ""}
          onChange={e => onChangeField("gal", e.target.value)}
          placeholder="0.00"
          style={{ ..._entryInput, WebkitAppearance: "none", MozAppearance: "textfield" }}
        />
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
