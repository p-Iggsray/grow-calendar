import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, Plus, Trash2, Loader } from "lucide-react";
import { api } from "../../lib/api.js";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToast } from "../../lib/useToast.jsx";
import { FAMILIES, FAMILY_ORDER, familyPhases } from "../../lib/growData.js";
import { MONO, SERIF, Label, Input, NumStepper } from "../SetupWizard/styleHelpers.jsx";

// Human label for a span of consecutive families, e.g. "Veg" or "Veg → Flush".
function spanLabel(startKey, count) {
  const start = FAMILY_ORDER.indexOf(startKey);
  if (start < 0) return "";
  const end = Math.min(start + count, FAMILY_ORDER.length) - 1;
  const a = FAMILIES[FAMILY_ORDER[start]].label;
  return end > start ? `${a} → ${FAMILIES[FAMILY_ORDER[end]].label}` : a;
}

// Which family labels a rule's phase window touches (for display on the list).
function ruleFamilies(rule) {
  const phases = rule?.window?.type === "phase" ? rule.window.phases ?? [] : [];
  const keys = FAMILY_ORDER.filter(k => FAMILIES[k].phases.some(p => phases.includes(p)));
  return keys.map(k => FAMILIES[k]);
}

export default function ManualTasksSheet({ onClose }) {
  const { activeGrowId, eventRules, reload } = usePlan();
  const { addToast } = useToast();

  const [text, setText] = useState("");
  const [startKey, setStartKey] = useState("veg");
  const [count, setCount] = useState(1);
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState(null);

  const startIdx = FAMILY_ORDER.indexOf(startKey);
  const maxCount = FAMILY_ORDER.length - startIdx;
  const tasks = eventRules ?? [];

  async function addTask() {
    const task = text.trim();
    if (!task || busy || !activeGrowId) return;
    setBusy(true);
    try {
      await api.createGrowEvent(activeGrowId, {
        task,
        label: spanLabel(startKey, count),
        window: { type: "phase", phases: familyPhases(startKey, count) },
        cadence: { type: "everyDay" },
      });
      await reload();
      setText("");
      setCount(1);
    } catch (err) {
      addToast(err?.message || "Couldn't add task.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTask(id) {
    setConfirmId(null);
    setBusy(true);
    try {
      await api.deleteGrowEvent(activeGrowId, id);
      await reload();
    } catch (err) {
      addToast(err?.message || "Couldn't delete task.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.div
      initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 }}
      style={{
        position: "fixed", inset: 0, zIndex: 50, background: "var(--c-bg)",
        display: "flex", flexDirection: "column", fontFamily: SERIF, color: "var(--c-text)",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderBottom: "1px solid var(--c-surface-2)", background: "var(--c-header-bg)", flexShrink: 0 }}>
        <button type="button" onClick={onClose} style={{
          background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
          borderRadius: 10, padding: "10px 14px", color: "var(--c-text-dim)", cursor: "pointer",
          minHeight: 44, display: "flex", alignItems: "center", gap: 4,
        }}>
          <ChevronLeft size={16} strokeWidth={2} />
          <span style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-muted)", textTransform: "uppercase" }}>Your tasks</div>
          <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: -0.3 }}>Manage daily tasks</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "16px 14px", display: "flex", flexDirection: "column", gap: 18, WebkitOverflowScrolling: "touch" }}>
        {/* Add form */}
        <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 14, padding: 16 }}>
          <Label>New task</Label>
          <Input value={text} onChange={setText} placeholder="e.g. Check soil moisture" />

          <div style={{ marginTop: 14 }}>
            <Label>Starts at phase</Label>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {FAMILY_ORDER.map(k => {
                const sel = k === startKey;
                const fam = FAMILIES[k];
                return (
                  <button key={k} type="button" onClick={() => { setStartKey(k); setCount(1); }} style={{
                    padding: "8px 13px", borderRadius: 10, cursor: "pointer",
                    background: sel ? `${fam.color}26` : "rgba(255,255,255,0.05)",
                    border: `1.5px solid ${sel ? fam.color : "var(--c-border-strong)"}`,
                    color: sel ? "var(--c-text)" : "var(--c-text-dim)",
                    fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
                  }}>{fam.label}</button>
                );
              })}
            </div>
          </div>

          <div style={{ marginTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <div>
              <Label>For how many phases</Label>
              <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>{spanLabel(startKey, count)}</div>
            </div>
            <NumStepper value={count} onChange={setCount} min={1} max={maxCount} />
          </div>

          <button type="button" onClick={addTask} disabled={!text.trim() || busy} style={{
            marginTop: 16, width: "100%", padding: "13px", borderRadius: 12, minHeight: 48,
            background: text.trim() && !busy ? "rgba(34,197,94,0.18)" : "var(--c-surface-2)",
            border: `1px solid ${text.trim() && !busy ? "rgba(34,197,94,0.45)" : "var(--c-border)"}`,
            color: text.trim() && !busy ? "var(--c-accent)" : "var(--c-text-faint)",
            fontFamily: MONO, fontSize: 13, letterSpacing: 1, cursor: text.trim() && !busy ? "pointer" : "default",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {busy ? <Loader size={15} style={{ animation: "spin 1s linear infinite" }} /> : <Plus size={16} strokeWidth={2.4} />}
            Add task
          </button>
        </div>

        {/* Task list */}
        <div>
          <Label>Current tasks ({tasks.length})</Label>
          {tasks.length === 0 && (
            <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "10px 2px", lineHeight: 1.6 }}>
              No tasks yet. Add one above — it&rsquo;ll show on every day across the phases you pick.
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {tasks.map(rule => {
              const fams = ruleFamilies(rule);
              const confirming = confirmId === rule.id;
              return (
                <div key={rule.id} style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 12, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, lineHeight: 1.45 }}>{rule.task}</div>
                      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 7 }}>
                        {fams.map(f => (
                          <span key={f.key} style={{
                            fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase",
                            color: f.color, background: `${f.color}1f`, border: `1px solid ${f.color}55`,
                            borderRadius: 6, padding: "2px 7px",
                          }}>{f.label}</span>
                        ))}
                        {fams.length === 0 && (
                          <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)" }}>custom</span>
                        )}
                      </div>
                    </div>
                    {confirming ? (
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button type="button" onClick={() => removeTask(rule.id)} disabled={busy} style={{
                          background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8,
                          padding: "6px 9px", color: "var(--c-danger-soft)", cursor: "pointer", fontFamily: MONO, fontSize: 11,
                        }}>Delete</button>
                        <button type="button" onClick={() => setConfirmId(null)} style={{
                          background: "none", border: "1px solid var(--c-border)", borderRadius: 8,
                          padding: "6px 9px", color: "var(--c-text-faint)", cursor: "pointer", fontFamily: MONO, fontSize: 11,
                        }}>Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmId(rule.id)} aria-label="Delete task" style={{
                        flexShrink: 0, background: "none", border: "1px solid var(--c-border)", borderRadius: 8,
                        padding: "8px", color: "var(--c-text-faint)", cursor: "pointer", display: "flex", alignItems: "center",
                      }}>
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
