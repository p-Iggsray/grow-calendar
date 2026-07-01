import { useState, useRef, useEffect } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
import { fmtL, getToday, daysBetween } from "../../lib/dates.js";
import { useGrowLog } from "../../lib/useGrowLog.js";
import { useWeather } from "../../lib/useWeather.js";
import { renderNote } from "./renderNote.js";
import { StatePicker } from "./StatePicker.jsx";
import { TaskRow } from "./TaskRow.jsx";
import { TaskEditSheet } from "./TaskEditSheet.jsx";
import { PhaseApplyBanner } from "./PhaseApplyBanner.jsx";
import {
  LogSection, LogField, AddEntryButton, sumWater,
  WaterEntry, TrainingEntry, PlantHealthEntry,
} from "./logEntries.jsx";
import { WeatherCard } from "./WeatherCard.jsx";

// ── Shared input styles ────────────────────────────────────────────────────

const fieldLabelStyle = {
  display: "flex", flexDirection: "column", gap: 5,
};
const fieldNameStyle = {
  fontFamily: "var(--font-ui)", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
};
const numInputStyle = {
  background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 8,
  padding: "10px 12px", fontSize: 16, outline: "none",
  fontFamily: "var(--font-ui)",
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
  onPickerActiveChange,
  plants = [],
}) {
  const [tab, setTab] = useState("tasks");
  const [noteEditing, setNoteEditing] = useState(false);
  const [pickerIdx, setPickerIdx] = useState(null);
  const [editingIdx, setEditingIdx] = useState(null);
  const [pendingPhaseApply, setPendingPhaseApply] = useState(null);
  // Which plant the per-plant log sections are scoped to ("all" or a plant id).
  const [logPlant, setLogPlant] = useState("all");
  const logPlants = (plants ?? []).filter(p => (p.status ?? "growing") === "growing");
  const scoped = logPlant !== "all";
  const selPlant = logPlants.find(p => p.id === logPlant) || null;
  // Match by plant id; fall back to name for legacy rows that predate id linking.
  const matches = (e) => !scoped || e.plantId === logPlant || (!e.plantId && (e.plant ?? "") === (selPlant?.name ?? ""));
  // New per-plant rows carry the plant's id (when scoped) so they link to the
  // plant's history; name is kept for display + back-compat.
  const newRow = (extra) => ({ plant: selPlant?.name ?? "", ...(scoped ? { plantId: logPlant } : {}), ...extra });
  const textareaRef = useRef(null);

  useEffect(() => {
    onTaskEditActiveChange?.(editingIdx !== null);
  }, [editingIdx, onTaskEditActiveChange]);

  // The state picker is a bottom sheet rendered inside this fixed overlay, so the
  // global TabBar (higher stacking context) would paint over its lower buttons and
  // steal taps. Report when it's open so the app can hide the TabBar, matching the
  // task-edit sheet behavior.
  useEffect(() => {
    onPickerActiveChange?.(pickerIdx !== null);
  }, [pickerIdx, onPickerActiveChange]);

  const { entry: logEntry, setField: setLogField, setFields: setLogFields, status: logStatus } = useGrowLog(selected, true, activeGrowId);

  // Per-plant watering. water_gal is kept as the day's total (sum of all
  // plants) so the stats "total water" aggregation keeps working.
  function addWater()                 { const a = [...(logEntry.water_plants ?? []), newRow({ gal: "" })]; setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  function updateWater(i, k, v)       { const a = [...(logEntry.water_plants ?? [])]; a[i] = { ...a[i], [k]: v }; setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  function removeWater(i)             { const a = [...(logEntry.water_plants ?? [])]; a.splice(i, 1); setLogFields({ water_plants: a, water_gal: sumWater(a) }); }

  function addTraining()              { setLogField("training", [...(logEntry.training ?? []), newRow({ action: "" })]); }
  function updateTraining(i, k, v)    { const a = [...(logEntry.training ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("training", a); }
  function removeTraining(i)          { const a = [...(logEntry.training ?? [])]; a.splice(i, 1); setLogField("training", a); }
  function addHealth()                { setLogField("plant_health", [...(logEntry.plant_health ?? []), newRow({ color: "", trichomes: "", notes: "" })]); }
  function updateHealth(i, k, v)      { const a = [...(logEntry.plant_health ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("plant_health", a); }
  function removeHealth(i)            { const a = [...(logEntry.plant_health ?? [])]; a.splice(i, 1); setLogField("plant_health", a); }

  // Weather: only fetch for today or future dates. Compare by local calendar day
  // (daysBetween normalizes to local Y/M/D) — comparing a Date against a string
  // here always coerced to NaN, which silently disabled the weather/frost panel.
  const isCurrentOrFuture = selected ? daysBetween(selected, getToday()) >= 0 : false;
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
          <span style={{ fontFamily: "var(--font-ui)", fontSize: 13, letterSpacing: 1 }}>Back</span>
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase" }}>
            {selStyle?.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.4 }}>
            {fmtL(selected)}, 2026
          </div>
        </div>
        {totalTasks > 0 && (
          <div style={{
            fontSize: 11, fontFamily: "var(--font-ui)",
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
              fontSize: 12, fontFamily: "var(--font-ui)",
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
                <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: logStatus === "error" ? "#f87171" : logStatus === "saved" ? "var(--c-accent)" : "#5a7a5a" }}>
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

              {/* ── Plant selector for the per-plant sections below ── */}
              {logPlants.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ ...fieldNameStyle, marginBottom: 8 }}>Log entries for</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {[{ key: "all", label: "All plants" }, ...logPlants.map(p => ({ key: p.id, label: p.name || "Unnamed" }))].map(opt => {
                      const active = logPlant === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => setLogPlant(opt.key)}
                          style={{
                            padding: "8px 14px", borderRadius: 16,
                            background: active ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
                            border: active ? "1px solid rgba(74,222,128,0.5)" : "1px solid var(--c-border-strong)",
                            color: active ? "var(--c-accent)" : "var(--c-text-muted)",
                            fontFamily: "var(--font-ui)", fontSize: 12, letterSpacing: 0.5,
                            cursor: "pointer", whiteSpace: "nowrap",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Watering & Nutrients ── */}
              <LogSection label="Watering & Nutrients">
                {(logEntry.water_plants ?? []).map((w, i) => ({ w, i }))
                  .filter(({ w }) => matches(w))
                  .map(({ w, i }) => (
                    <WaterEntry
                      key={i}
                      entry={w}
                      hidePlant={scoped}
                      onChangeField={(k, v) => updateWater(i, k, v)}
                      onRemove={() => removeWater(i)}
                    />
                  ))}
                <AddEntryButton onClick={addWater} label={scoped ? `ADD WATERING FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD PLANT WATERING"} />
                {sumWater(logEntry.water_plants) && (
                  <div style={{
                    marginTop: 10, textAlign: "right",
                    fontFamily: "var(--font-ui)", fontSize: 12,
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
                      placeholder="Nutrient mix, dose, supplements…"
                      maxLength={500}
                      style={numInputStyle}
                    />
                  </label>
                </div>
              </LogSection>

              {/* ── Plant Training ── */}
              <LogSection label="Plant Training">
                {(logEntry.training ?? []).map((t, i) => ({ t, i }))
                  .filter(({ t }) => matches(t))
                  .map(({ t, i }) => (
                    <TrainingEntry
                      key={i}
                      entry={t}
                      hidePlant={scoped}
                      onChangeField={(k, v) => updateTraining(i, k, v)}
                      onRemove={() => removeTraining(i)}
                    />
                  ))}
                <AddEntryButton onClick={addTraining} label={scoped ? `ADD TRAINING FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD TRAINING ENTRY"} />
              </LogSection>

              {/* ── Plant Health ── */}
              <LogSection label="Plant Health">
                {(logEntry.plant_health ?? []).map((h, i) => ({ h, i }))
                  .filter(({ h }) => matches(h))
                  .map(({ h, i }) => (
                    <PlantHealthEntry
                      key={i}
                      entry={h}
                      hidePlant={scoped}
                      onChangeField={(k, v) => updateHealth(i, k, v)}
                      onRemove={() => removeHealth(i)}
                    />
                  ))}
                <AddEntryButton onClick={addHealth} label={scoped ? `ADD HEALTH FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD HEALTH OBSERVATION"} />
              </LogSection>
            </div>
          )}

          {tab === "notes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label htmlFor="day-note" style={{ fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
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
                  <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: statusColor, minHeight: 12 }}>
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
                      fontFamily: "var(--font-ui)", outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 6, fontFamily: "var(--font-ui)", fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
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
                    fontFamily: "var(--font-ui)",
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
                <div style={{ textAlign: "center", padding: "24px 0", color: "var(--c-text-ghost)", fontFamily: "var(--font-ui)", fontSize: 13, lineHeight: 1.8 }}>
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
            fontFamily: "var(--font-ui)", cursor: "pointer",
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
