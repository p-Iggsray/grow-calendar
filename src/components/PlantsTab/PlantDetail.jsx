import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Archive } from "lucide-react";
import { usePlantLog } from "../../lib/usePlantLog.js";
import { MONO, SERIF, TYPE_LABEL, HEALTH_MAP } from "./constants.js";
import LogEntryForm from "./LogEntryForm.jsx";

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 13, color: "var(--c-text-dim)" }}>{value}</div>
    </div>
  );
}

export default function PlantDetail({ growId, plant, currentPhaseLabel, harvestLabel, onClose, onArchive, onDelete, onLogChange }) {
  const { entries, addEntry, removeEntry } = usePlantLog(growId, plant.id, true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave(entry) {
    setSaving(true);
    try { await addEntry(entry); setAdding(false); onLogChange?.(); }
    finally { setSaving(false); }
  }

  async function handleRemove(id) {
    await removeEntry(id);
    onLogChange?.();
  }

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 }}
      style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--c-bg)", overflowY: "auto", paddingBottom: 40 }}
    >
      <div style={{ padding: 16, paddingTop: "calc(16px + env(safe-area-inset-top, 0px))" }}>
        <button type="button" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={16} /> PLANTS
        </button>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 700, fontFamily: SERIF, color: "var(--c-text)" }}>{plant.name || "Unnamed plant"}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-muted)", marginTop: 4 }}>
            {TYPE_LABEL[plant.type] ?? plant.type}{plant.photo === false ? " · Auto" : " · Photo"}{plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk flower` : ""}
          </div>
        </div>

        <div style={{ display: "flex", gap: 28, marginTop: 16 }}>
          <Meta label="Current phase" value={currentPhaseLabel || "-"} />
          <Meta label="Est. harvest" value={harvestLabel || "-"} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>Log</span>
          {!adding && (
            <button type="button" onClick={() => setAdding(true)} style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 18, padding: "7px 14px", color: "var(--c-accent)", fontFamily: MONO, fontSize: 11, cursor: "pointer" }}>
              <Plus size={13} /> Add entry
            </button>
          )}
        </div>

        {adding && (
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 14, marginBottom: 16 }}>
            <LogEntryForm onSave={handleSave} onCancel={() => setAdding(false)} saving={saving} />
          </div>
        )}

        {entries.length === 0 && !adding && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "12px 0" }}>No log entries yet.</div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {entries.map((e) => {
            const h = e.health ? HEALTH_MAP[e.health] : null;
            return (
              <div key={e.id} style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)" }}>{e.date}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {h && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: h.color, textTransform: "uppercase" }}>{h.label}</span>}
                    {e.height != null && <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-muted)" }}>{e.height}{e.height_unit || ""}</span>}
                    <button type="button" aria-label="delete entry" onClick={() => handleRemove(e.id)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", cursor: "pointer", padding: 0, display: "flex" }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                {e.body && <div style={{ fontFamily: SERIF, fontSize: 15, color: "var(--c-text)", marginTop: 8, whiteSpace: "pre-wrap" }}>{e.body}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
          <button type="button" onClick={() => onArchive(plant)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid var(--c-border)", color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
            <Archive size={14} /> {plant.status === "growing" ? "Archive" : "Unarchive"}
          </button>
          <button type="button" onClick={() => onDelete(plant)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 11, borderRadius: 10, background: "transparent", border: "1px solid rgba(248,113,113,0.3)", color: "var(--c-danger-soft)", fontFamily: MONO, fontSize: 11, letterSpacing: 1, cursor: "pointer" }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    </motion.div>
  );
}
