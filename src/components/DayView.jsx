import { useState, useRef, useCallback, useEffect } from "react";
import { ChevronLeft, Pencil, Check, Minus, X } from "lucide-react";
import { fmtL } from "../lib/dates.js";
import { useTaskNotes, MAX_TASK_NOTE_LEN } from "../lib/useTaskNote.js";
import { useGrowLog } from "../lib/useGrowLog.js";
import { useWeather } from "../lib/useWeather.js";
import MediaTab from "./MediaTab.jsx";

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
  skipped: { color: "#facc15", bg: "rgba(250,204,21,0.05)",  label: "SKIPPED", textColor: "#8a8060" },
  blocked: { color: "#f87171", bg: "rgba(248,113,113,0.05)", label: "BLOCKED", textColor: "#8a6060" },
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
            { state: "skipped", label: "Skipped", icon: <Minus size={16} strokeWidth={2.5} />, color: "#facc15", bg: "rgba(250,204,21,0.1)" },
            { state: "blocked", label: "Blocked", icon: <X    size={16} strokeWidth={2.5} />, color: "#f87171", bg: "rgba(248,113,113,0.1)" },
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
                <span style={{ marginLeft: "auto", fontSize: 10, fontFamily: "'Courier New', monospace", color: "#5a7a5a" }}>
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

function TaskRow({ task, index, state, accentColor, onTap, onLongPress, note, onNoteChange }) {
  const [noteOpen, setNoteOpen] = useState(false);

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
          onClick={handleClick}
          {...lpHandlers}
          style={{
            width: 28, height: 28, borderRadius: 7, flexShrink: 0,
            background: cfg ? cfg.color : `${accentColor}22`,
            color: cfg ? "var(--c-bg)" : accentColor,
            border: `1px solid ${cfg ? cfg.color : accentColor + "44"}`,
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "pointer", transition: "background 0.15s, color 0.15s",
            fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 800,
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
            <div style={{ fontSize: 10, fontFamily: "'Courier New', monospace", color: cfg.color, letterSpacing: 1, marginTop: 1 }}>
              {cfg.label}
            </div>
          )}
        </div>

        {/* Per-task note toggle */}
        <button
          type="button"
          onClick={() => setNoteOpen(o => !o)}
          aria-label="Toggle task note"
          style={{
            background: (noteOpen || note) ? `${accentColor}22` : "none",
            border: `1px solid ${note ? accentColor + "55" : "var(--c-border)"}`,
            borderRadius: 6, padding: "5px 7px",
            color: note ? accentColor : "#5a7a5a",
            cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: 28, minWidth: 28,
            transition: "background 0.15s, color 0.15s",
          }}>
          <Pencil size={12} strokeWidth={1.8} />
        </button>
      </div>

      {/* Inline note */}
      {noteOpen && (
        <div style={{ padding: "6px 8px 10px", borderTop: "1px solid rgba(255,255,255,0.05)", background: "rgba(0,0,0,0.15)" }}>
          <textarea
            value={note ?? ""}
            onChange={e => onNoteChange(index, e.target.value.slice(0, MAX_TASK_NOTE_LEN))}
            placeholder="Add a note for this task…"
            rows={2}
            autoFocus
            style={{
              width: "100%", resize: "vertical",
              background: "rgba(0,0,0,0.2)", color: "var(--c-text)",
              border: "1px solid var(--c-border)", borderRadius: 8,
              padding: "8px 10px", fontSize: 13, lineHeight: 1.6,
              fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
              boxSizing: "border-box",
            }}
          />
          <div style={{ textAlign: "right", fontFamily: "'Courier New', monospace", fontSize: 10, color: "var(--c-text-ghost)", marginTop: 3 }}>
            {(note ?? "").length}/{MAX_TASK_NOTE_LEN}
          </div>
        </div>
      )}
    </div>
  );
}

const fieldLabelStyle = {
  display: "flex", flexDirection: "column", gap: 5,
};
const fieldNameStyle = {
  fontFamily: "'Courier New', monospace", fontSize: 10,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
};
const numInputStyle = {
  background: "rgba(0,0,0,0.25)", color: "var(--c-text)",
  border: "1px solid var(--c-border-strong)", borderRadius: 8,
  padding: "10px 12px", fontSize: 15, outline: "none",
  fontFamily: "'Courier New', monospace",
  WebkitAppearance: "none", MozAppearance: "textfield",
};

export default function DayView({
  selected, detail, selStyle, threats,
  taskStates, checkoffsLoading, onToggle, onSetTaskState,
  note, onChangeNote, onFlushNote, noteStatus,
  onBack, onJumpToday,
}) {
  const [tab, setTab] = useState("tasks");
  const [noteEditing, setNoteEditing] = useState(false);
  const [pickerIdx, setPickerIdx] = useState(null);
  const textareaRef = useRef(null);

  const { notes: taskNotes, setNote: setTaskNote } = useTaskNotes(selected, true);
  const { entry: logEntry, setField: setLogField, status: logStatus } = useGrowLog(selected, true);

  // Weather: only fetch for today or future dates.
  const todayStr = new Date().toISOString().slice(0, 10);
  const isCurrentOrFuture = selected >= todayStr;
  const { data: weather, loading: weatherLoading } = useWeather(isCurrentOrFuture && tab === "threats");

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
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase" }}>
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
            { id: "media",   label: "Media" },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
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
                    note={taskNotes[String(i)] ?? ""}
                    onNoteChange={setTaskNote}
                  />
                ))}
              </div>

              {detail.notes && (
                <div style={{
                  marginTop: 16, padding: "10px 14px",
                  background: "rgba(250,204,21,0.06)", borderRadius: 8,
                  borderLeft: "3px solid #f59e0b",
                  fontSize: 12.5, color: "#b8a870", lineHeight: 1.7,
                }}>
                  <strong style={{ color: "#f59e0b", fontStyle: "normal" }}>Note: </strong>
                  {detail.notes}
                </div>
              )}
            </>
          )}

          {tab === "log" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 2, color: "var(--c-text-muted)", textTransform: "uppercase" }}>
                  Daily readings
                </div>
                <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: logStatus === "error" ? "#f87171" : logStatus === "saved" ? "var(--c-accent)" : "#5a7a5a", minHeight: 12 }}>
                  {logStatus === "saving" ? "Saving..." : logStatus === "saved" ? "Saved" : logStatus === "error" ? "Save failed" : ""}
                </div>
              </div>

              {/* Water + Humidity row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <label style={fieldLabelStyle}>
                  <span style={fieldNameStyle}>Water (gal)</span>
                  <input
                    type="number" inputMode="decimal" step="0.25" min="0" max="99"
                    value={logEntry.water_gal}
                    onChange={e => setLogField("water_gal", e.target.value)}
                    placeholder="0.00"
                    style={numInputStyle}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  <span style={fieldNameStyle}>Humidity (%)</span>
                  <input
                    type="number" inputMode="numeric" step="1" min="0" max="100"
                    value={logEntry.humidity}
                    onChange={e => setLogField("humidity", e.target.value)}
                    placeholder="—"
                    style={numInputStyle}
                  />
                </label>
              </div>

              {/* Temp High + Low row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <label style={fieldLabelStyle}>
                  <span style={fieldNameStyle}>Temp High (°F)</span>
                  <input
                    type="number" inputMode="numeric" step="1" min="0" max="130"
                    value={logEntry.temp_high}
                    onChange={e => setLogField("temp_high", e.target.value)}
                    placeholder="—"
                    style={numInputStyle}
                  />
                </label>
                <label style={fieldLabelStyle}>
                  <span style={fieldNameStyle}>Temp Low (°F)</span>
                  <input
                    type="number" inputMode="numeric" step="1" min="0" max="130"
                    value={logEntry.temp_low}
                    onChange={e => setLogField("temp_low", e.target.value)}
                    placeholder="—"
                    style={numInputStyle}
                  />
                </label>
              </div>

              {/* Feed / nutrients */}
              <label style={{ ...fieldLabelStyle, display: "flex" }}>
                <span style={fieldNameStyle}>Feed / nutrients</span>
                <input
                  type="text"
                  value={logEntry.feed}
                  onChange={e => setLogField("feed", e.target.value)}
                  placeholder="e.g. Big Bloom 1 tsp + Tiger Bloom 2 tsp"
                  maxLength={500}
                  style={{ ...numInputStyle, width: "100%", boxSizing: "border-box" }}
                />
              </label>
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
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: statusColor, minHeight: 12 }}>
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
                      padding: "12px 14px", fontSize: 14, lineHeight: 1.7,
                      fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: 6, fontFamily: "'Courier New', monospace", fontSize: 10, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
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
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24", letterSpacing: -0.2 }}>
                      {threat.title}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: "#c0a87a", lineHeight: 1.7 }}>
                    {threat.desc}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "media" && (
            <MediaTab date={selected} accentColor={selStyle?.color} />
          )}
        </div>
      </div>

      {onJumpToday && (
        <button
          type="button"
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
        fontFamily: "'Courier New', monospace", fontSize: 11, color: "#5a8a9a",
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
              <span style={{ fontSize: 9, fontFamily: "'Courier New', monospace", letterSpacing: 1, color: alertSeverityColor(alert.severity), opacity: 0.8 }}>
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
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 1.5, color: "#5a8a9a", textTransform: "uppercase" }}>
              NWS Forecast · Athens OH
            </span>
            {hasHighLow && (
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "var(--c-text-dim)" }}>
                <span style={{ color: "#f97316" }}>↑{highLow.high}°</span>
                {" "}
                <span style={{ color: "#38bdf8" }}>↓{highLow.low}°</span>
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
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: "#5a8a9a" }}>
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
