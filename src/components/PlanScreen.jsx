import { useState, useCallback } from "react";
import { ChevronDown, ChevronUp, Pencil, Trash2, Plus, RefreshCw, Settings, FlaskConical } from "lucide-react";
import { PHASES, phaseGlyph } from "../lib/growData.js";
import { api } from "../lib/api.js";
import SetupWizard from "./SetupWizard.jsx";
import PresetPicker from "./PresetPicker.jsx";

// Phases shown in the editor, in grow-season order.
const PHASE_ORDER = [
  "transplant", "early_veg", "veg_cm", "veg_half", "veg_full",
  "pre_flower", "flower", "flush", "flush_gdp", "harvest_gdp",
  "flower_haze", "flush_haze", "harvest_haze",
];

const HAZE_PHASES = new Set(["flower_haze", "flush_haze", "harvest_haze"]);

const MONO = "'Courier New', monospace";

// ─── Phase editor accordion item ─────────────────────────────────────────────

function PhaseSection({ phase, aiContent, override, onSave, onReset }) {
  const [open, setOpen] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [localTasks, setLocalTasks] = useState(null); // null = use persisted
  const [saving, setSaving] = useState(false);

  const cfg = PHASES[phase] ?? { label: phase, color: "var(--c-text-faint)" };
  const glyph = phaseGlyph(phase);
  const persistedTasks = override?.tasks ?? aiContent?.tasks ?? [];
  const tasks = localTasks ?? persistedTasks;
  const isDirty = localTasks !== null;
  const isOverridden = Boolean(override?.tasks);

  function startEdit(idx) {
    setEditIdx(idx);
    setEditValue(tasks[idx] ?? "");
    if (!localTasks) setLocalTasks([...persistedTasks]);
  }

  function commitEdit() {
    if (editIdx === null) return;
    const updated = [...(localTasks ?? persistedTasks)];
    const trimmed = editValue.trim();
    if (trimmed) updated[editIdx] = trimmed;
    setLocalTasks(updated);
    setEditIdx(null);
  }

  function deleteTask(idx) {
    const updated = (localTasks ?? [...persistedTasks]).filter((_, i) => i !== idx);
    setLocalTasks(updated);
    if (editIdx === idx) setEditIdx(null);
  }

  function addTask() {
    const updated = [...(localTasks ?? [...persistedTasks]), "New task — tap to edit"];
    setLocalTasks(updated);
    setEditIdx(updated.length - 1);
    setEditValue("New task — tap to edit");
  }

  async function saveChanges() {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onSave({ tasks: localTasks });
      setLocalTasks(null);
    } finally {
      setSaving(false);
    }
  }

  async function resetToAi() {
    if (saving) return;
    setSaving(true);
    try {
      await onReset();
      setLocalTasks(null);
      setEditIdx(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{
      borderRadius: 12, overflow: "hidden",
      border: `1px solid ${open ? cfg.color + "44" : "var(--c-surface-2)"}`,
      marginBottom: 8,
      transition: "border-color 0.2s",
    }}>
      {/* Header row */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: "100%", display: "flex", alignItems: "center", gap: 10,
          padding: "12px 14px", background: open ? `${cfg.color}11` : "rgba(255,255,255,0.02)",
          border: "none", cursor: "pointer", transition: "background 0.2s",
        }}
      >
        <span style={{
          width: 24, height: 24, borderRadius: 6, flexShrink: 0,
          background: `${cfg.color}22`, color: cfg.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: MONO, fontSize: 11, fontWeight: 800,
        }}>
          {glyph || "•"}
        </span>
        <span style={{ flex: 1, textAlign: "left", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5, color: "var(--c-text-dim)", fontWeight: open ? 700 : 400 }}>
          {cfg.label}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: isOverridden ? cfg.color : "var(--c-text-ghost)" }}>
          {isOverridden ? "EDITED" : aiContent ? "AI" : "DEFAULT"}
        </span>
        <span style={{ fontSize: 10, fontFamily: MONO, color: "var(--c-text-ghost)", marginLeft: 4 }}>
          {tasks.length}t
        </span>
        {open ? <ChevronUp size={14} color="var(--c-text-faint)" /> : <ChevronDown size={14} color="var(--c-text-faint)" />}
      </button>

      {/* Expanded content */}
      {open && (
        <div style={{ padding: "0 14px 14px", background: "rgba(0,0,0,0.15)" }}>
          {/* Summary */}
          {(aiContent?.summary || override?.summary) && (
            <div style={{ fontSize: 12, color: "var(--c-text-muted)", lineHeight: 1.6, marginBottom: 12, paddingTop: 10, fontStyle: "italic" }}>
              {override?.summary ?? aiContent?.summary}
            </div>
          )}

          {/* Tasks */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {tasks.map((task, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontFamily: MONO, fontSize: 10, color: cfg.color, paddingTop: 3, minWidth: 18, flexShrink: 0 }}>
                  {idx + 1}.
                </span>
                {editIdx === idx ? (
                  <div style={{ flex: 1 }}>
                    <textarea
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      rows={3}
                      autoFocus
                      style={{
                        width: "100%", boxSizing: "border-box", resize: "vertical",
                        background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
                        border: `1px solid ${cfg.color}55`, borderRadius: 8,
                        padding: "8px 10px", fontSize: 12, lineHeight: 1.6,
                        fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
                      }}
                    />
                    <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                      <button type="button" onClick={commitEdit} style={smallBtnStyle("var(--c-accent)")}>Save</button>
                      <button type="button" onClick={() => setEditIdx(null)} style={smallBtnStyle("var(--c-text-faint)")}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.6 }}>{task}</span>
                    <button type="button" onClick={() => startEdit(idx)} style={iconBtnStyle} aria-label="Edit task">
                      <Pencil size={11} strokeWidth={1.8} />
                    </button>
                    <button type="button" onClick={() => deleteTask(idx)} style={iconBtnStyle} aria-label="Delete task">
                      <Trash2 size={11} strokeWidth={1.8} />
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add task */}
          <button type="button" onClick={addTask} style={{
            display: "flex", alignItems: "center", gap: 6,
            background: "none", border: `1px dashed var(--c-border-strong)`,
            borderRadius: 8, padding: "7px 10px", cursor: "pointer",
            color: "var(--c-text-faint)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
            marginBottom: 10,
          }}>
            <Plus size={12} strokeWidth={1.8} />
            Add task
          </button>

          {/* Action bar */}
          <div style={{ display: "flex", gap: 8 }}>
            {isDirty && (
              <button type="button" onClick={saveChanges} disabled={saving} style={{
                flex: 2, padding: "9px 12px", borderRadius: 8, cursor: saving ? "default" : "pointer",
                background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.35)",
                color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
                opacity: saving ? 0.6 : 1,
              }}>
                {saving ? "Saving…" : "Save changes"}
              </button>
            )}
            {isOverridden && !isDirty && (
              <button type="button" onClick={resetToAi} disabled={saving} style={{
                flex: 1, padding: "9px 12px", borderRadius: 8, cursor: saving ? "default" : "pointer",
                background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
                opacity: saving ? 0.6 : 1,
              }}>
                Reset to AI
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const smallBtnStyle = color => ({
  padding: "4px 10px", borderRadius: 6, cursor: "pointer",
  background: `${color}22`, border: `1px solid ${color}55`,
  color, fontFamily: MONO, fontSize: 10, letterSpacing: 0.5,
});

const iconBtnStyle = {
  background: "none", border: "none", cursor: "pointer",
  color: "var(--c-text-ghost)", padding: 4, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
};

// ─── Regenerate confirmation sheet ───────────────────────────────────────────

function RegenConfirm({ onCancel, onConfirm, loading }) {
  return (
    <>
      <div onClick={onCancel} style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)",
      }} />
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
        background: "var(--c-panel-bg)", borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: "24px 20px calc(28px + env(safe-area-inset-bottom, 0px))",
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--c-text)", marginBottom: 8 }}>
          Regenerate AI content?
        </div>
        <div style={{ fontSize: 13, color: "#8aaa8a", lineHeight: 1.7, marginBottom: 20 }}>
          This replaces all AI-generated phase summaries and tasks with fresh AI output using your stored grow survey. Your custom task edits are preserved and won&apos;t be overwritten.
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{
            flex: 1, padding: "13px", borderRadius: 12,
            background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer",
          }}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={loading} style={{
            flex: 2, padding: "13px", borderRadius: 12,
            background: loading ? "rgba(74,222,128,0.06)" : "rgba(74,222,128,0.18)",
            border: "1.5px solid rgba(74,222,128,0.4)",
            color: "var(--c-accent)", fontFamily: MONO, fontSize: 12, letterSpacing: 1,
            cursor: loading ? "default" : "pointer", opacity: loading ? 0.7 : 1,
          }}>
            {loading ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Main PlanScreen ──────────────────────────────────────────────────────────

export default function PlanScreen({ config, generatedPlan, phaseOverrides, survey, onReload }) {
  const [editSetup, setEditSetup] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [activePreset, setActivePreset] = useState(null);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenError, setRegenError] = useState("");

  const twoStrains = (generatedPlan?.strains?.length ?? 0) >= 2;
  const phases = PHASE_ORDER.filter(p => twoStrains || !HAZE_PHASES.has(p));

  const growName = generatedPlan?.growName ?? "Your Grow Plan";
  const strainNames = generatedPlan?.strains?.map(s => s.name).filter(Boolean) ?? [];

  const handleSavePhase = useCallback(async (phase, data) => {
    await api.savePlanPhase(phase, data);
    onReload();
  }, [onReload]);

  const handleResetPhase = useCallback(async (phase) => {
    await api.clearPlanPhase(phase);
    onReload();
  }, [onReload]);

  async function handleRegen() {
    setRegenLoading(true);
    setRegenError("");
    try {
      await api.regeneratePlan();
      setConfirmRegen(false);
      onReload();
    } catch (err) {
      setRegenError(err.message || "Regeneration failed. Please try again.");
    } finally {
      setRegenLoading(false);
    }
  }

  if (editSetup) {
    return (
      <SetupWizard
        initialSurvey={survey}
        onComplete={() => { setEditSetup(false); onReload(); }}
        onCancel={() => setEditSetup(false)}
      />
    );
  }

  return (
    <div style={{
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
    }}>
      {/* Grow overview */}
      <div style={{ marginBottom: 18 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 4, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 4 }}>
          Grow Plan
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--c-text)", letterSpacing: -0.5, marginBottom: 4 }}>
          {growName}
        </div>
        {strainNames.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-faint)", letterSpacing: 0.5 }}>
            {strainNames.join(" · ")}
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <button
          type="button"
          onClick={() => setEditSetup(true)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "11px 8px", borderRadius: 10,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>
          <Settings size={13} strokeWidth={1.8} />
          Setup
        </button>
        <button
          type="button"
          onClick={() => setShowPresets(true)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "11px 8px", borderRadius: 10,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>
          <FlaskConical size={13} strokeWidth={1.8} />
          Feed preset
        </button>
        <button
          type="button"
          onClick={() => { setRegenError(""); setConfirmRegen(true); }}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            padding: "11px 8px", borderRadius: 10,
            background: "rgba(74,222,128,0.07)", border: "1px solid rgba(74,222,128,0.2)",
            color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer",
          }}>
          <RefreshCw size={13} strokeWidth={1.8} />
          Regen AI
        </button>
      </div>

      {showPresets && (
        <PresetPicker
          currentPresetId={activePreset}
          onApplied={(presetId) => { setActivePreset(presetId); setShowPresets(false); onReload(); }}
          onCancel={() => setShowPresets(false)}
        />
      )}

      {regenError && (
        <div style={{
          fontSize: 12, color: "#fca5a5", lineHeight: 1.5, marginBottom: 12,
          background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)",
          borderRadius: 8, padding: "8px 10px",
        }}>
          {regenError}
        </div>
      )}

      {/* Phase library */}
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 10 }}>
        Phase library
      </div>

      {phases.map(phase => (
        <PhaseSection
          key={phase}
          phase={phase}
          aiContent={generatedPlan?.phases?.[phase]}
          override={phaseOverrides?.[phase]}
          onSave={data => handleSavePhase(phase, data)}
          onReset={() => handleResetPhase(phase)}
        />
      ))}

      <div style={{ height: 12 }} />

      {confirmRegen && (
        <RegenConfirm
          onCancel={() => setConfirmRegen(false)}
          onConfirm={handleRegen}
          loading={regenLoading}
        />
      )}
    </div>
  );
}
