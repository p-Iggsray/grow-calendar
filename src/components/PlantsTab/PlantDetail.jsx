import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Plus, Trash2, Archive, Pencil, ChevronLeft, ChevronRight, BookOpen } from "lucide-react";
import { usePlantLog } from "../../lib/usePlantLog.js";
import { api } from "../../lib/api.js";
import { dayOfGrow } from "../../lib/journalStats.js";
import {
  MONO, SERIF, TYPE_LABEL, HEALTH_MAP, STAGE_ORDER, stageLabel, nextStage, prevStage,
  LOG_KINDS, kindLabel, summarizeEntry, fmtDateKey, plantHistoryStats,
} from "./constants.js";
import LogEntryForm from "./LogEntryForm.jsx";
import AddPlantSheet from "./AddPlantSheet.jsx";
import StageTimeline from "./StageTimeline.jsx";
import { Skeleton } from "../Skeleton.jsx";

function Meta({ label, value, accent }) {
  return (
    <div style={{
      flex: "1 1 30%", minWidth: 92, padding: "9px 11px", borderRadius: 10,
      background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
      <div style={{ fontFamily: MONO, fontSize: 14, color: accent || "var(--c-text)" }}>{value}</div>
    </div>
  );
}

function keyToDate(key) {
  const [y, m, d] = (key || "").split("-").map(Number);
  return y && m && d ? new Date(y, m - 1, d) : null;
}

export default function PlantDetail({ growId, plant, harvestLabel, today, config, onOpenJournalDay, onClose, onArchive, onDelete, onLogChange, onChanged }) {
  const { entries, loading: logLoading, addEntry, removeEntry } = usePlantLog(growId, plant.id, true);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [stageBusy, setStageBusy] = useState(false);
  const [histFilter, setHistFilter] = useState("all");
  const [daily, setDaily] = useState([]);

  // Per-plant entries logged on the daily screen (read-only here, linked by id).
  useEffect(() => {
    let cancelled = false;
    api.getPlantDailyLog(growId, plant.id)
      .then((d) => { if (!cancelled) setDaily(d.entries ?? []); })
      .catch(() => { if (!cancelled) setDaily([]); });
    return () => { cancelled = true; };
  }, [growId, plant.id, entries.length]);

  const combined = [...entries.map((e) => ({ ...e, source: "log" })), ...daily]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const presentKinds = LOG_KINDS.filter((k) => combined.some((e) => (e.kind || "note") === k.value));
  const shownEntries = histFilter === "all" ? combined : combined.filter((e) => (e.kind || "note") === histFilter);

  const stage = plant.stage || "seedling";
  const stageIdx = STAGE_ORDER.indexOf(stage);

  // At-a-glance numbers derived from the history + grow timeline.
  const age = today && config ? dayOfGrow(today, config) : null;
  const { stageDays, height, heightDelta, lastHealth } = plantHistoryStats(combined, today);
  const healthInfo = lastHealth ? HEALTH_MAP[lastHealth] : null;

  async function handleSave(entry) {
    setSaving(true);
    try { await addEntry(entry); setAdding(false); onLogChange?.(); }
    finally { setSaving(false); }
  }

  async function handleRemove(id) {
    await removeEntry(id);
    onLogChange?.();
  }

  async function handleEditSave(fields) {
    setSavingEdit(true);
    try {
      await api.patchPlant(growId, plant.id, {
        name: fields.name, type: fields.type, photo: fields.photo,
        flowerWeeks: fields.flowerWeeks, potSize: fields.potSize,
      });
      setEditing(false);
      onChanged?.();
    } finally { setSavingEdit(false); }
  }

  async function setStage(next) {
    if (stageBusy || next === stage) return;
    setStageBusy(true);
    try {
      await api.patchPlant(growId, plant.id, { stage: next });
      await addEntry({ kind: "stage", body: `Stage → ${stageLabel(next)}` });
      onLogChange?.();
      onChanged?.();
    } finally { setStageBusy(false); }
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
        <button type="button" className="touch-target" onClick={onClose} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: "var(--c-text-muted)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer", padding: 0 }}>
          <ArrowLeft size={16} /> PLANTS
        </button>

        <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: SERIF, color: "var(--c-text)" }}>{plant.name || "Unnamed plant"}</div>
            <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-muted)", marginTop: 4 }}>
              {TYPE_LABEL[plant.type] ?? plant.type}{plant.photo === false ? " · Auto" : " · Photo"}{plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk flower` : ""}{plant.potSize ? ` · ${plant.potSize} gal` : ""}
            </div>
          </div>
          {!editing && (
            <button type="button" className="touch-target" onClick={() => setEditing(true)} aria-label="Edit plant" style={{ display: "flex", alignItems: "center", gap: 5, background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 18, padding: "7px 12px", color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11, cursor: "pointer", flexShrink: 0 }}>
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>

        {editing && (
          <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 12, padding: 14, marginTop: 14 }}>
            <AddPlantSheet
              initial={{ name: plant.name, type: plant.type, photo: plant.photo, flowerWeeks: plant.flowerWeeks, potSize: plant.potSize }}
              onSave={handleEditSave}
              onCancel={() => setEditing(false)}
              saving={savingEdit}
              saveLabel="Save changes"
              savingLabel="Saving…"
            />
          </div>
        )}

        {/* Stage control */}
        <div style={{ marginTop: 20 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 6 }}>Stage</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className="touch-target" aria-label="Previous stage" disabled={stageBusy || stageIdx <= 0} onClick={() => setStage(prevStage(stage))}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "var(--c-surface-1)", border: "1px solid var(--c-border)", color: stageIdx <= 0 ? "var(--c-text-ghost)" : "var(--c-text-dim)", cursor: stageIdx <= 0 ? "default" : "pointer" }}>
              <ChevronLeft size={18} />
            </button>
            <div style={{ flex: 1 }}>
              <StageTimeline stage={stage} onPick={setStage} height={10} />
              <div style={{ textAlign: "center", marginTop: 8, fontFamily: MONO, fontSize: 14, letterSpacing: 1, color: "var(--c-accent)" }}>
                {stageLabel(stage)}
              </div>
            </div>
            <button type="button" className="touch-target" aria-label="Next stage" disabled={stageBusy || stageIdx >= STAGE_ORDER.length - 1} onClick={() => setStage(nextStage(stage))}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 40, height: 40, borderRadius: 10, background: "var(--c-surface-1)", border: "1px solid var(--c-border)", color: stageIdx >= STAGE_ORDER.length - 1 ? "var(--c-text-ghost)" : "var(--c-text-dim)", cursor: stageIdx >= STAGE_ORDER.length - 1 ? "default" : "pointer" }}>
              <ChevronRight size={18} />
            </button>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 8, textAlign: "center" }}>
            Step {stageIdx + 1} of {STAGE_ORDER.length} · tap a segment to jump · changes are logged below
          </div>
        </div>

        {/* At a glance */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginTop: 18 }}>
          {age && <Meta label="Age" value={`Day ${age}`} />}
          <Meta label="In stage" value={stageDays != null ? `${stageDays}d` : "-"} />
          <Meta
            label="Height"
            value={height ? `${height.height}${height.height_unit || ""}${heightDelta != null && heightDelta !== 0 ? ` (${heightDelta > 0 ? "+" : ""}${heightDelta})` : ""}` : "-"}
          />
          <Meta label="Entries" value={combined.length} />
          {healthInfo && <Meta label="Health" value={healthInfo.label} accent={healthInfo.color} />}
          <Meta label="Est. harvest" value={harvestLabel || "-"} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 28, marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>History</span>
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

        {logLoading && combined.length === 0 && (
          <div role="status" aria-busy="true" aria-label="Loading log" style={{ display: "flex", flexDirection: "column", gap: 10, padding: "6px 0" }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} width="100%" height={52} radius={12} />
            ))}
          </div>
        )}

        {!logLoading && combined.length === 0 && !adding && (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", padding: "12px 0" }}>No log entries yet.</div>
        )}

        {presentKinds.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {[{ value: "all", label: "All" }, ...presentKinds].map((k) => {
              const active = histFilter === k.value;
              return (
                <button key={k.value} type="button" onClick={() => setHistFilter(k.value)}
                  style={{
                    padding: "6px 11px", borderRadius: 13,
                    background: active ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
                    border: active ? "1px solid rgba(74,222,128,0.5)" : "1px solid var(--c-border-strong)",
                    color: active ? "var(--c-accent)" : "var(--c-text-muted)",
                    fontFamily: MONO, fontSize: 10, letterSpacing: 0.5, cursor: "pointer",
                  }}>
                  {k.label}
                </button>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {shownEntries.map((e) => {
            const kind = e.kind || "note";
            const h = e.health ? HEALTH_MAP[e.health] : null;
            const summary = summarizeEntry(e);
            return (
              <div key={e.id} style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)", borderRadius: 12, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: "var(--c-text-faint)", textTransform: "uppercase", background: "var(--c-surface-2)", borderRadius: 5, padding: "2px 6px" }}>{kindLabel(kind)}</span>
                    {/* The date links into that day's journal page. */}
                    <button
                      type="button"
                      disabled={!onOpenJournalDay}
                      onClick={() => {
                        const d = keyToDate(e.date);
                        if (d && onOpenJournalDay) onOpenJournalDay(d);
                      }}
                      title="Open this day in the journal"
                      style={{
                        display: "flex", alignItems: "center", gap: 5,
                        background: "none", border: "none", padding: 0,
                        cursor: onOpenJournalDay ? "pointer" : "default",
                        fontFamily: MONO, fontSize: 11, color: "var(--c-text-dim)",
                      }}>
                      {fmtDateKey(e.date)}
                      {config && keyToDate(e.date) && dayOfGrow(keyToDate(e.date), config) && (
                        <span style={{ color: "var(--c-text-ghost)" }}>· Day {dayOfGrow(keyToDate(e.date), config)}</span>
                      )}
                      {onOpenJournalDay && <BookOpen size={11} strokeWidth={2} style={{ color: "var(--c-text-ghost)" }} />}
                    </button>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {h && <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: h.color, textTransform: "uppercase" }}>{h.label}</span>}
                    {e.source === "daily" ? (
                      <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }} title="Logged on the daily log screen">Daily</span>
                    ) : (
                      <button type="button" className="touch-target" aria-label="delete entry" onClick={() => handleRemove(e.id)} style={{ background: "none", border: "none", color: "var(--c-text-ghost)", cursor: "pointer", padding: 0, display: "flex" }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
                {summary && <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-dim)", marginTop: 8 }}>{summary}</div>}
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
