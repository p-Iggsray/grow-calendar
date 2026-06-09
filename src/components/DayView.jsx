import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, Pencil, Check, Minus, X, Plus } from "lucide-react";
import { fmtL } from "../lib/dates.js";
import { useGrowLog } from "../lib/useGrowLog.js";
import { useWeather } from "../lib/useWeather.js";

function renderNote(raw) {
  if (!raw?.trim()) return "";
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => esc(s)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
    .replace(/_([^_\n]+)_/g, "<em>$1</em>");
  const lines = raw.split("\n");
  const parts = [];
  let inList = false;
  for (const line of lines) {
    const t = line.trimEnd();
    if (/^[-*] /.test(t)) {
      if (!inList) { parts.push("<ul>"); inList = true; }
      parts.push(`<li>${inline(t.slice(2))}</li>`);
    } else {
      if (inList) { parts.push("</ul>"); inList = false; }
      parts.push(t ? `<p>${inline(t)}</p>` : "<br>");
    }
  }
  if (inList) parts.push("</ul>");
  return parts.join("");
}

function useLongPress(onLongPress, ms = 500) {
  const timer = useRef(null);
  const fired = useRef(false);

  const start = useCallback(() => {
    fired.current = false;
    timer.current = setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  }, [onLongPress, ms]);

  const cancel = useCallback(() => { clearTimeout(timer.current); }, []);

  return {
    handlers: { onMouseDown: start, onTouchStart: start, onMouseUp: cancel, onMouseLeave: cancel, onTouchEnd: cancel },
    didLongPress: () => fired.current,
  };
}

const STATE_CFG = {
  done:    { color: "var(--c-accent)", bg: "rgba(74,222,128,0.05)",  label: null,      textColor: "#5a7a5a" },
  skipped: { color: "var(--c-warn)", bg: "rgba(250,204,21,0.05)",  label: "SKIPPED", textColor: "#8a8060" },
  blocked: { color: "var(--c-danger)", bg: "rgba(248,113,113,0.05)", label: "BLOCKED", textColor: "#8a6060" },
};

function StatePicker({ task, currentState, onPick, onClose }) {
  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ fontSize: 12, color: "var(--c-text-muted)", marginBottom: 16, fontFamily: "'Courier New', monospace", letterSpacing: 0.5, lineHeight: 1.5 }}>
          {task}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { state: "done",    label: "Done",    icon: <Check size={16} strokeWidth={2.5} />, color: "var(--c-accent)", bg: "rgba(74,222,128,0.1)" },
            { state: "skipped", label: "Skipped", icon: <Minus size={16} strokeWidth={2.5} />, color: "var(--c-warn)", bg: "rgba(250,204,21,0.1)" },
            { state: "blocked", label: "Blocked", icon: <X    size={16} strokeWidth={2.5} />, color: "var(--c-danger)", bg: "rgba(248,113,113,0.1)" },
          ].map(({ state, label, icon, color, bg }) => (
            <button
              key={state}
              type="button"
              onClick={() => onPick(state === currentState ? null : state)}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                padding: "14px 16px", borderRadius: 12,
                background: currentState === state ? bg : "var(--c-surface-1)",
                border: `1px solid ${currentState === state ? color + "66" : "var(--c-surface-2)"}`,
                color, cursor: "pointer", textAlign: "left",
                fontSize: 15, fontWeight: 600,
              }}>
              {icon}
              {label}
              {currentState === state && (
                <span style={{ marginLeft: "auto", fontSize: 11, fontFamily: "'Courier New', monospace", color: "var(--c-text-faint)" }}>
                  tap to clear
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function TaskRow({ task, index, state, accentColor, onTap, onLongPress, onEditTask, isEdited }) {
  const handleLongPress = useCallback(() => onLongPress(index), [onLongPress, index]);
  const { handlers: lpHandlers, didLongPress } = useLongPress(handleLongPress, 500);

  const handleClick = useCallback(() => {
    if (didLongPress()) return;
    onTap(index);
  }, [didLongPress, onTap, index]);

  const cfg = state ? STATE_CFG[state] : null;

  return (
    <div style={{ borderRadius: 8, overflow: "hidden" }}>
      <div style={{
        display: "flex", gap: 10, alignItems: "flex-start",
        background: cfg?.bg ?? "transparent",
        padding: "6px 4px",
      }}>
        {/* Checkbox: tap toggles done, long-press opens state picker */}
        <button
          type="button"
          className="touch-target"
          onClick={handleClick}
          {...lpHandlers}
          style={{
            width: 36, height: 36, borderRadius: 9, flexShrink: 0,
            background: cfg ? cfg.color : `${accentColor}22`,
            color: cfg ? "var(--c-bg)" : accentColor,
            border: `1px solid ${cfg ? cfg.color : accentColor + "44"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s, color 0.15s",
            fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 800,
          }}>
          {state === "done"    ? <Check size={14} strokeWidth={2.5} />
           : state === "skipped" ? <Minus size={14} strokeWidth={2.5} />
           : state === "blocked" ? <X    size={14} strokeWidth={2.5} />
           : <span>{index + 1}</span>}
        </button>

        {/* Task label + state badge */}
        <div style={{ flex: 1, minWidth: 0, paddingTop: 3 }}>
          <div style={{
            fontSize: 13.5, lineHeight: 1.7,
            color: cfg?.textColor ?? "var(--c-text-dim)",
            textDecoration: state === "done" ? "line-through" : "none",
            transition: "color 0.15s",
          }}>
            {task}
          </div>
          {cfg?.label && (
            <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: cfg.color, letterSpacing: 1, marginTop: 1 }}>
              {cfg.label}
            </div>
          )}
          {isEdited && (
            <div style={{ fontSize: 11, fontFamily: "'Courier New', monospace", color: accentColor + "99", letterSpacing: 0.5, marginTop: 1 }}>
              EDITED
            </div>
          )}
        </div>

        {/* Edit task text */}
        <button
          type="button"
          className="touch-target"
          onClick={() => onEditTask(index)}
          aria-label="Edit task text"
          style={{
            background: isEdited ? `${accentColor}22` : "none",
            border: `1px solid ${isEdited ? accentColor + "55" : "var(--c-border)"}`,
            borderRadius: 6, padding: "5px 7px",
            color: isEdited ? accentColor : "#5a7a5a",
            cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 28, minWidth: 28,
            transition: "background 0.15s, color 0.15s",
          }}>
          <Pencil size={12} strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}

function TaskEditSheet({ currentText, onSave, onClose }) {
  const [text, setText] = useState(currentText);
  const [kbOffset, setKbOffset] = useState(0);
  const textareaRef = useRef(null);

  // Track keyboard height via Visual Viewport API so the sheet always sits
  // flush above the keyboard on iOS and Android.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setKbOffset(Math.max(0, window.innerHeight - vv.height - vv.offsetTop));
    }
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  useEffect(() => {
    textareaRef.current?.focus();
    const len = currentText.length;
    textareaRef.current?.setSelectionRange(len, len);
  }, [currentText]);

  const isDirty = text.trim() && text.trim() !== currentText.trim();
  // When the keyboard is up, safe-area-inset-bottom is 0, so use flat padding.
  const bottomPad = kbOffset > 0 ? "20px" : "calc(24px + env(safe-area-inset-bottom, 0px))";

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: kbOffset, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: `20px 20px ${bottomPad}`,
      }}>
        <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1.5, color: "var(--c-text-muted)", textTransform: "uppercase", marginBottom: 12 }}>
          Edit task text
        </div>
        <textarea
          ref={textareaRef}
          value={text}
          onChange={e => setText(e.target.value)}
          rows={4}
          style={{
            width: "100%", resize: "none", boxSizing: "border-box",
            background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
            border: "1px solid var(--c-border-strong)", borderRadius: 10,
            padding: "12px 14px", fontSize: 16, lineHeight: 1.7,
            fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12,
              background: "var(--c-surface-1)", border: "1px solid var(--c-surface-2)",
              color: "var(--c-text-dim)", cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => isDirty && onSave(text.trim())}
            style={{
              flex: 2, padding: "14px 0", borderRadius: 12,
              background: "var(--c-accent)", border: "none",
              color: "#000", cursor: "pointer", fontSize: 14, fontWeight: 700,
              opacity: isDirty ? 1 : 0.4,
            }}>
            Save
          </button>
        </div>
      </div>
    </>
  );
}

function PhaseApplyBanner({ phaseName, onApply, onDismiss }) {
  return (
    <>
      <div
        onClick={onDismiss}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)",
        }}
      />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: "20px 20px calc(24px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)", marginBottom: 8 }}>
          Apply to all {phaseName} days?
        </div>
        <div style={{ fontSize: 13, color: "var(--c-text-dim)", lineHeight: 1.7, marginBottom: 18 }}>
          This will update this task text across every day in the {phaseName} phase, not just today.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onDismiss}
            style={{
              flex: 1, padding: "14px 0", borderRadius: 12,
              background: "var(--c-surface-1)", border: "1px solid var(--c-surface-2)",
              color: "var(--c-text-dim)", cursor: "pointer", fontSize: 14, fontWeight: 600,
            }}>
            Just today
          </button>
          <button
            type="button"
            onClick={onApply}
            style={{
              flex: 2, padding: "14px 0", borderRadius: 12,
              background: "var(--c-accent)", border: "none",
              color: "#000", cursor: "pointer", fontSize: 14, fontWeight: 700,
            }}>
            All {phaseName} days
          </button>
        </div>
      </div>
    </>
  );
}

// ── Log tab helpers ────────────────────────────────────────────────────────

function LogSection({ label, first = false, children }) {
  return (
    <div style={{ marginTop: first ? 0 : 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span style={{
          fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 2,
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

function LogField({ label, name, entry, setField, step, min, max, placeholder = "—", inputMode = "decimal" }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
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
          fontFamily: "'Courier New', monospace",
          WebkitAppearance: "none", MozAppearance: "textfield",
          width: "100%", boxSizing: "border-box",
        }}
      />
    </label>
  );
}

function AddEntryButton({ onClick, label }) {
  return (
    <button
      type="button"
      className="touch-target"
      onClick={onClick}
      style={{
        width: "100%", padding: "11px", borderRadius: 10, marginTop: 6,
        background: "none", border: "1px dashed var(--c-border)",
        color: "var(--c-text-ghost)", cursor: "pointer",
        fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1.5,
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
  fontFamily: "'Courier New', monospace",
  width: "100%", boxSizing: "border-box",
};
const _entryLabel = {
  fontFamily: "'Courier New', monospace", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
  marginBottom: 5, display: "block",
};

// Sum the per-plant water amounts into a day total (string, or "" if none).
function sumWater(arr) {
  const total = (arr ?? []).reduce((s, w) => {
    const n = parseFloat(w?.gal);
    return Number.isFinite(n) ? s + n : s;
  }, 0);
  return total > 0 ? String(Math.round(total * 100) / 100) : "";
}

function WaterEntry({ entry, onChangeField, onRemove }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", marginBottom: 8 }}>
      <label style={{ flex: 2, display: "flex", flexDirection: "column" }}>
        <span style={_entryLabel}>Plant</span>
        <input
          type="text"
          value={entry.plant ?? ""}
          onChange={e => onChangeField("plant", e.target.value)}
          placeholder="Plant 1"
          style={_entryInput}
        />
      </label>
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

function TrainingEntry({ entry, onChangeField, onRemove }) {
  return (
    <div style={_entryCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ..._entryLabel, marginBottom: 0, fontSize: 11 }}>Training</span>
        <button type="button" className="touch-target" onClick={onRemove} style={_entryRemove} aria-label="Remove">
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 8 }}>
        <div>
          <span style={_entryLabel}>Plant</span>
          <input type="text" value={entry.plant} onChange={e => onChangeField("plant", e.target.value)} placeholder="Plant 1" style={_entryInput} />
        </div>
        <div>
          <span style={_entryLabel}>Action</span>
          <input type="text" value={entry.action} onChange={e => onChangeField("action", e.target.value)} placeholder="LST, topped, defoliated…" style={_entryInput} />
        </div>
      </div>
    </div>
  );
}

const LEAF_COLORS = ["Dark Green", "Green", "Light Green", "Yellow-Green", "Yellow", "Rust / Brown", "Spotted", "Purple"];
const TRICHOME_STAGES = [
  { value: "",       label: "— not checked —" },
  { value: "clear",  label: "Clear (too early)" },
  { value: "cloudy", label: "Cloudy / Milky (peak THC)" },
  { value: "mixed",  label: "Mixed Cloudy + Amber" },
  { value: "amber",  label: "Mostly Amber (max CBN)" },
];
const _selectInput = {
  ..._entryInput,
  cursor: "pointer",
  WebkitAppearance: "auto",
  MozAppearance: "auto",
  appearance: "auto",
};

function PlantHealthEntry({ entry, onChangeField, onRemove }) {
  return (
    <div style={_entryCard}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ ..._entryLabel, marginBottom: 0, fontSize: 11 }}>Health Observation</span>
        <button type="button" className="touch-target" onClick={onRemove} style={_entryRemove} aria-label="Remove">
          <X size={12} strokeWidth={2} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
        <div>
          <span style={_entryLabel}>Plant</span>
          <input type="text" value={entry.plant} onChange={e => onChangeField("plant", e.target.value)} placeholder="Plant 1" style={_entryInput} />
        </div>
        <div>
          <span style={_entryLabel}>Leaf Color</span>
          <select value={entry.color ?? ""} onChange={e => onChangeField("color", e.target.value)} style={_selectInput}>
            <option value="">—</option>
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
          style={{ ..._entryInput, resize: "vertical", lineHeight: 1.6, fontFamily: "'Georgia', 'Times New Roman', serif" }}
        />
      </div>
    </div>
  );
}

// ── Shared input styles ────────────────────────────────────────────────────

const fieldLabelStyle = {
  display: "flex", flexDirection: "column", gap: 5,
};
const fieldNameStyle = {
  fontFamily: "'Courier New', monospace", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
};
const numInputStyle = {
  background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 8,
  padding: "10px 12px", fontSize: 16, outline: "none",
  fontFamily: "'Courier New', monospace",
  WebkitAppearance: "none", MozAppearance: "textfield",
  width: "100%", boxSizing: "border-box",
};

export default function DayView({
  activeGrowId,
  selected, detail, selStyle, selPhase, threats,
  taskStates, checkoffsLoading, onToggle, onSetTaskState,
  note, onChangeNote, onFlushNote, noteStatus,
  onBack, onJumpToday,
  dayEditedTasks,
  onEditTaskForDay, onEditTaskForPhase,
  onTaskEditActiveChange,
}) {
  const [tab, setTab] = useState("tasks");
  const [noteEditing, setNoteEditing] = useState(false);
  const [pickerIdx, setPickerIdx] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [pendingPhaseApply, setPendingPhaseApply] = useState(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    onTaskEditActiveChange?.(editingIdx !== null);
  }, [editingIdx, onTaskEditActiveChange]);

  const { entry: logEntry, setField: setLogField, setFields: setLogFields, status: logStatus } = useGrowLog(selected, true);

  // Per-plant watering. water_gal is kept as the day's total (sum of all
  // plants) so the stats "total water" aggregation keeps working.
  function addWater()                 { const a = [...(logEntry.water_plants ?? []), { plant: "", gal: "" }]; setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  function updateWater(i, k, v)       { const a = [...(logEntry.water_plants ?? [])]; a[i] = { ...a[i], [k]: v }; setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  function removeWater(i)             { const a = [...(logEntry.water_plants ?? [])]; a.splice(i, 1); setLogFields({ water_plants: a, water_gal: sumWater(a) }); }

  function addTraining()              { setLogField("training", [...(logEntry.training ?? []), { plant: "", action: "" }]); }
  function updateTraining(i, k, v)    { const a = [...(logEntry.training ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("training", a); }
  function removeTraining(i)          { const a = [...(logEntry.training ?? [])]; a.splice(i, 1); setLogField("training", a); }
  function addHealth()                { setLogField("plant_health", [...(logEntry.plant_health ?? []), { plant: "", color: "", trichomes: "", notes: "" }]); }
  function updateHealth(i, k, v)      { const a = [...(logEntry.plant_health ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("plant_health", a); }
  function removeHealth(i)            { const a = [...(logEntry.plant_health ?? [])]; a.splice(i, 1); setLogField("plant_health", a); }

  // Weather: only fetch for today or future dates.
  const todayStr = new Date().toISOString().slice(0, 10);
  const isCurrentOrFuture = selected >= todayStr;
  const { data: weather, loading: weatherLoading } = useWeather(isCurrentOrFuture && tab === "threats", activeGrowId);

  useEffect(() => {
    if (noteEditing) textareaRef.current?.focus();
  }, [noteEditing]);

  useEffect(() => {
    if (tab !== "notes") setNoteEditing(false);
  }, [tab]);

  const resolvedCount = Object.keys(taskStates ?? {}).length;
  const totalTasks = detail?.tasks?.length ?? 0;

  const statusLabel =
    noteStatus === "saving" ? "Saving..." :
    noteStatus === "saved"  ? "Saved" :
    noteStatus === "error"  ? "Save failed. Keep typing to retry." : "";
  const statusColor =
    noteStatus === "error" ? "#f87171" :
    noteStatus === "saved" ? "var(--c-accent)" : "#5a7a5a";

  function handlePickState(state) {
    onSetTaskState?.(pickerIdx, state);
    setPickerIdx(null);
  }

  async function handleSaveTaskEdit(newText) {
    const idx = editingIdx;
    setEditingIdx(null);
    try {
      await onEditTaskForDay?.(idx, newText);
      if (selPhase && selStyle?.label) {
        setPendingPhaseApply({ index: idx, text: newText });
      }
    } catch { /* ignored */ }
  }

  async function handleApplyPhase() {
    if (!pendingPhaseApply) return;
    try {
      await onEditTaskForPhase?.(pendingPhaseApply.index, pendingPhaseApply.text);
    } catch { /* ignored */ }
    setPendingPhaseApply(null);
  }

  return (
    <div style={{
      paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 24,
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
    }}>
      {pickerIdx !== null && (
        <StatePicker
          task={detail?.tasks?.[pickerIdx] ?? ""}
          currentState={taskStates?.[String(pickerIdx)] ?? null}
          onPick={handlePickState}
          onClose={() => setPickerIdx(null)}
        />
      )}

      {editingIdx !== null && detail?.tasks?.[editingIdx] !== undefined && (
        <TaskEditSheet
          currentText={detail.tasks[editingIdx]}
          onSave={handleSaveTaskEdit}
          onClose={() => setEditingIdx(null)}
        />
      )}

      {pendingPhaseApply !== null && selStyle?.label && (
        <PhaseApplyBanner
          phaseName={selStyle.label}
          onApply={handleApplyPhase}
          onDismiss={() => setPendingPhaseApply(null)}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 2px 14px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
            borderRadius: 10, padding: "8px 14px", color: "var(--c-text-dim)",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 4, flexShrink: 0,
            minHeight: 44,
          }}>
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: "'Courier New', monospace", fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase" }}>
            {selStyle?.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.4 }}>
            {fmtL(selected)}, 2026
          </div>
        </div>
        {totalTasks > 0 && (
          <div style={{
            fontSize: 11, fontFamily: "'Courier New', monospace",
            color: resolvedCount === totalTasks ? "var(--c-accent)" : selStyle?.color,
            background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 8,
            whiteSpace: "nowrap", flexShrink: 0,
            opacity: checkoffsLoading ? 0.5 : 1, transition: "opacity 0.15s",
          }}>
            {checkoffsLoading ? "..." : `${resolvedCount}/${totalTasks}`}
          </div>
        )}
      </div>

      <div style={{
        background: "var(--c-surface-1)", borderRadius: 14,
        border: `1px solid ${selStyle?.color}44`, overflow: "hidden",
      }}>
        <div style={{ background: `${selStyle?.color}22`, padding: "14px 16px 12px", borderBottom: `1px solid ${selStyle?.color}33` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "var(--c-text)", lineHeight: 1.2, letterSpacing: -0.3 }}>
            {detail?.title}
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid var(--c-border-soft)" }}>
          {[
            { id: "tasks",   label: "Tasks" },
            { id: "log",     label: "Log" },
            { id: "notes",   label: "Notes" },
            { id: "threats", label: `Threats${threats.length > 0 ? ` (${threats.length})` : ""}` },
          ].map(t => (
            <button key={t.id} className="touch-target" onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0", background: "none",
              border: "none", borderBottom: tab === t.id ? `2px solid ${selStyle?.color}` : "2px solid transparent",
              color: tab === t.id ? selStyle?.color : "#5a7a5a",
              fontSize: 12, fontFamily: "'Courier New', monospace",
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", letterSpacing: 1, transition: "color 0.2s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "14px 16px" }}>
          {tab === "tasks" && detail && (
            <>
              <div style={{
                background: `${selStyle?.color}11`, borderRadius: 8,
                padding: "10px 12px", fontSize: 13, color: "var(--c-text-dim)",
                lineHeight: 1.7, marginBottom: 16,
                border: `1px solid ${selStyle?.color}22`,
              }}>
                {detail.summary}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.tasks.map((task, i) => (
                  <TaskRow
                    key={i}
                    index={i}
                    task={task}
                    state={taskStates?.[String(i)] ?? null}
                    accentColor={selStyle?.color ?? "var(--c-accent)"}
                    onTap={onToggle ?? (() => {})}
                    onLongPress={setPickerIdx}
                    onEditTask={setEditingIdx}
                    isEdited={!!(dayEditedTasks?.[String(i)])}
                  />
                ))}
              </div>

              {detail.notes && (
                <div style={{
                  marginTop: 16, padding: "10px 14px",
                  background: "rgba(250,204,21,0.06)", borderRadius: 8,
                  borderLeft: "3px solid #f59e0b",
                  fontSize: 12.5, color: "var(--c-amber-dim)", lineHeight: 1.7,
                }}>
                  <strong style={{ color: "var(--c-harvest)", fontStyle: "normal" }}>Note: </strong>
                  {detail.notes}
                </div>
              )}
            </>
          )}

          {tab === "log" && (
            <div>
              {/* Save status */}
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 4, minHeight: 16 }}>
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: logStatus === "error" ? "#f87171" : logStatus === "saved" ? "var(--c-accent)" : "#5a7a5a" }}>
                  {logStatus === "saving" ? "Saving…" : logStatus === "saved" ? "Saved" : logStatus === "error" ? "Save failed" : ""}
                </span>
              </div>

              {/* ── Environment ── */}
              <LogSection label="Environment" first>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <LogField label="Temp High (°F)" name="temp_high" entry={logEntry} setField={setLogField} step={1} min={0} max={130} inputMode="numeric" />
                  <LogField label="Temp Low (°F)"  name="temp_low"  entry={logEntry} setField={setLogField} step={1} min={0} max={130} inputMode="numeric" />
                </div>
                <div style={{ maxWidth: "50%", paddingRight: 5 }}>
                  <LogField label="Humidity (%)" name="humidity" entry={logEntry} setField={setLogField} step={1} min={0} max={100} inputMode="numeric" />
                </div>
              </LogSection>

              {/* ── Watering & Nutrients ── */}
              <LogSection label="Watering & Nutrients">
                {(logEntry.water_plants ?? []).map((w, i) => (
                  <WaterEntry
                    key={i}
                    entry={w}
                    onChangeField={(k, v) => updateWater(i, k, v)}
                    onRemove={() => removeWater(i)}
                  />
                ))}
                <AddEntryButton onClick={addWater} label="ADD PLANT WATERING" />
                {sumWater(logEntry.water_plants) && (
                  <div style={{
                    marginTop: 10, textAlign: "right",
                    fontFamily: "'Courier New', monospace", fontSize: 12,
                    letterSpacing: 0.5, color: "var(--c-text-faint)",
                  }}>
                    Total: {sumWater(logEntry.water_plants)} gal
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <label style={fieldLabelStyle}>
                    <span style={fieldNameStyle}>Feed / Nutrients</span>
                    <input
                      type="text"
                      value={logEntry.feed ?? ""}
                      onChange={e => setLogField("feed", e.target.value)}
                      placeholder="Fox Farm Trio, Cal-Mag, Big Bloom…"
                      maxLength={500}
                      style={numInputStyle}
                    />
                  </label>
                </div>
              </LogSection>

              {/* ── Plant Training ── */}
              <LogSection label="Plant Training">
                {(logEntry.training ?? []).map((t, i) => (
                  <TrainingEntry
                    key={i}
                    entry={t}
                    onChangeField={(k, v) => updateTraining(i, k, v)}
                    onRemove={() => removeTraining(i)}
                  />
                ))}
                <AddEntryButton onClick={addTraining} label="ADD TRAINING ENTRY" />
              </LogSection>

              {/* ── Plant Health ── */}
              <LogSection label="Plant Health">
                {(logEntry.plant_health ?? []).map((h, i) => (
                  <PlantHealthEntry
                    key={i}
                    entry={h}
                    onChangeField={(k, v) => updateHealth(i, k, v)}
                    onRemove={() => removeHealth(i)}
                  />
                ))}
                <AddEntryButton onClick={addHealth} label="ADD HEALTH OBSERVATION" />
              </LogSection>
            </div>
          )}

          {tab === "notes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label htmlFor="day-note" style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
                  Your notes & concerns
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {note?.trim() && (
                    <button
                      type="button"
                      className="touch-target"
                      onClick={() => setNoteEditing(e => !e)}
                      aria-label={noteEditing ? "Done editing" : "Edit note"}
                      style={{
                        background: "none", border: "1px solid var(--c-border-strong)",
                        borderRadius: 6, padding: "5px 8px",
                        color: "var(--c-text-muted)", cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        minHeight: 32,
                      }}>
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  )}
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: statusColor, minHeight: 12 }}>
                    {statusLabel}
                  </span>
                </div>
              </div>

              {noteEditing || !note?.trim() ? (
                <>
                  <textarea
                    ref={textareaRef}
                    id="day-note"
                    value={note}
                    onChange={(e) => onChangeNote(e.target.value)}
                    onBlur={() => { onFlushNote(); if (note?.trim()) setNoteEditing(false); }}
                    onClick={() => setNoteEditing(true)}
                    placeholder="Write anything you observed or are worried about on this day: watering, leaf color, pests, weather, questions to look up later."
                    rows={12}
                    style={{
                      width: "100%", resize: "vertical",
                      background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
                      border: "1px solid var(--c-border-strong)", borderRadius: 10,
                      padding: "12px 14px", fontSize: 16, lineHeight: 1.7,
                      fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 6, fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
                    **bold** · *italic* · - bullet list
                  </div>
                </>
              ) : (
                <div
                  onClick={() => setNoteEditing(true)}
                  title="Tap to edit"
                  style={{
                    minHeight: 120, cursor: "text",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid var(--c-surface-2)", borderRadius: 10,
                    padding: "12px 14px", fontSize: 14, lineHeight: 1.8,
                    fontFamily: "'Georgia', 'Times New Roman', serif",
                    color: "var(--c-text-dim)",
                  }}
                  dangerouslySetInnerHTML={{ __html: renderNote(note) }}
                />
              )}
            </div>
          )}

          {tab === "threats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {isCurrentOrFuture && <WeatherCard weather={weather} loading={weatherLoading} />}

              {threats.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--c-text-ghost)", fontFamily: "'Courier New', monospace", fontSize: 13, lineHeight: 1.8 }}>
                  Smooth sailing for now.<br />
                  <span style={{ opacity: 0.7 }}>No active threats this phase.</span>
                </div>
              ) : threats.map(threat => (
                <div key={threat.id} style={{
                  background: "rgba(245,158,11,0.07)", borderRadius: 10,
                  border: "1px solid rgba(245,158,11,0.2)", padding: "12px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 18 }}>{threat.icon}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--c-warn)", letterSpacing: -0.2 }}>
                      {threat.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "var(--c-amber-dim)", lineHeight: 1.7 }}>
                    {threat.desc}
                  </div>
                </div>
              ))}
            </div>
          )}


        </div>
      </div>

      {onJumpToday && (
        <button
          type="button"
          className="touch-target"
          onClick={onJumpToday}
          aria-label="Jump to today"
          style={{
            position: "fixed", zIndex: 30,
            left: "calc(16px + env(safe-area-inset-left, 0px))",
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            background: "rgba(0,0,0,0.7)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "var(--c-accent)",
            borderRadius: 999, padding: "10px 16px",
            fontSize: 12, fontWeight: 700, letterSpacing: 1,
            fontFamily: "'Courier New', monospace", cursor: "pointer",
            boxShadow: "0 8px 24px rgba(0,0,0,0.45)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}>
          ↑ TODAY
        </button>
      )}
    </div>
  );
}

// --- Weather card (Threats tab, today + future only) ---

const SEVERITY_COLOR = {
  Extreme: "#ef4444",
  Severe:  "#f97316",
  Moderate:"#facc15",
  Minor:   "#a3e635",
};

function alertSeverityColor(severity) {
  return SEVERITY_COLOR[severity] ?? "#facc15";
}

function fmt12h(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${ampm}`;
}

function WeatherCard({ weather, loading }) {
  if (loading) {
    return (
      <div style={{
        background: "rgba(56,189,248,0.06)", borderRadius: 10,
        border: "1px solid rgba(56,189,248,0.15)", padding: "12px 14px",
        fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-info-dim)",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        Loading weather…
      </div>
    );
  }

  if (!weather) return null;

  const { alerts, hourly, highLow } = weather;
  const hasAlerts = alerts.length > 0;
  const hasHighLow = highLow.high !== null;
  const hasHourly = hourly.length > 0;

  if (!hasAlerts && !hasHighLow && !hasHourly) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* NWS alerts */}
      {hasAlerts && alerts.map(alert => (
        <div key={alert.id} style={{
          background: `${alertSeverityColor(alert.severity)}11`,
          border: `1px solid ${alertSeverityColor(alert.severity)}44`,
          borderRadius: 10, padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: alertSeverityColor(alert.severity), fontFamily: "'Courier New', monospace", letterSpacing: 0.5 }}>
              {alert.event}
            </span>
            {alert.severity && (
              <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", letterSpacing: 1, color: alertSeverityColor(alert.severity), opacity: 0.8 }}>
                {alert.severity.toUpperCase()}
              </span>
            )}
          </div>
          {alert.headline && (
            <div style={{ fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.6 }}>
              {alert.headline}
            </div>
          )}
        </div>
      ))}

      {/* Today's high/low + hourly strip */}
      {(hasHighLow || hasHourly) && (
        <div style={{
          background: "rgba(56,189,248,0.06)", borderRadius: 10,
          border: "1px solid rgba(56,189,248,0.15)", padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasHourly ? 10 : 0 }}>
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1.5, color: "var(--c-info-dim)", textTransform: "uppercase" }}>
              NWS Forecast
            </span>
            {hasHighLow && (
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "var(--c-text-dim)" }}>
                <span style={{ color: "var(--c-temp-hot)" }}>↑{highLow.high}°</span>
                {" "}
                <span style={{ color: "var(--c-info)" }}>↓{highLow.low}°</span>
              </span>
            )}
          </div>

          {hasHourly && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {hourly.map((h, i) => (
                <div key={i} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 3, minWidth: 44, flexShrink: 0,
                }}>
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-info-dim)" }}>
                    {fmt12h(h.startTime)}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    {h.isDaytime ? "☀️" : "🌙"}
                  </span>
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 700, color: "var(--c-text-dim)" }}>
                    {h.temp}°
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
