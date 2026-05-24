import { useState } from "react";
import { fmtL } from "../lib/dates.js";

export default function DayView({
  selected, detail, selStyle, threats,
  checked, onToggle,
  note, onChangeNote, onFlushNote, noteStatus,
  onBack,
}) {
  const [tab, setTab] = useState("tasks");
  const checkedCount = checked?.length ?? 0;
  const totalTasks = detail?.tasks?.length ?? 0;

  const statusLabel =
    noteStatus === "saving" ? "Saving..." :
    noteStatus === "saved"  ? "Saved" :
    noteStatus === "error"  ? "Save failed. Keep typing to retry." : "";
  const statusColor =
    noteStatus === "error" ? "#f87171" :
    noteStatus === "saved" ? "#4ade80" : "#5a7a5a";

  return (
    <div style={{
      paddingTop: "calc(12px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 24,
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "4px 2px 14px" }}>
        <button
          type="button"
          onClick={onBack}
          style={{
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 14px", color: "#a0d0a0",
            fontFamily: "'Courier New', monospace", fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0, letterSpacing: 1,
          }}>
          ‹ Back
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase" }}>
            {selStyle?.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#e8f5e3", letterSpacing: -0.4 }}>
            {fmtL(selected)}, 2026
          </div>
        </div>
        {totalTasks > 0 && (
          <div style={{
            fontSize: 11, fontFamily: "'Courier New', monospace",
            color: checkedCount === totalTasks ? "#4ade80" : selStyle?.color,
            background: "rgba(0,0,0,0.25)", padding: "6px 10px", borderRadius: 8,
            whiteSpace: "nowrap", flexShrink: 0,
          }}>
            {checkedCount}/{totalTasks}
          </div>
        )}
      </div>

      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 14,
        border: `1px solid ${selStyle?.color}44`, overflow: "hidden",
      }}>
        <div style={{ background: `${selStyle?.color}22`, padding: "14px 16px 12px", borderBottom: `1px solid ${selStyle?.color}33` }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#e8f5e3", lineHeight: 1.2, letterSpacing: -0.3 }}>
            {detail?.title}
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { id: "tasks",   label: "Day Tasks" },
            { id: "notes",   label: "Notes" },
            { id: "threats", label: `Threats${threats.length > 0 ? ` (${threats.length})` : ""}` },
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
                padding: "10px 12px", fontSize: 13, color: "#c0d8c0",
                lineHeight: 1.7, marginBottom: 16,
                border: `1px solid ${selStyle?.color}22`,
              }}>
                {detail.summary}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {detail.tasks.map((task, i) => {
                  const isChecked = checked?.includes(i);
                  return (
                    <button
                      type="button"
                      key={i}
                      onClick={() => onToggle?.(i)}
                      style={{
                        display: "flex", gap: 10, alignItems: "flex-start",
                        background: isChecked ? "rgba(34,197,94,0.05)" : "transparent",
                        border: "none", borderRadius: 8,
                        padding: "4px 6px", margin: "-4px -6px",
                        textAlign: "left", width: "calc(100% + 12px)",
                        cursor: onToggle ? "pointer" : "default",
                        transition: "background 0.15s",
                      }}>
                      <div style={{
                        width: 24, height: 24, borderRadius: 6,
                        background: isChecked ? selStyle?.color : `${selStyle?.color}22`,
                        color: isChecked ? "#0e1a12" : selStyle?.color,
                        fontFamily: "'Courier New', monospace", fontSize: 12, fontWeight: 800,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                        border: `1px solid ${isChecked ? selStyle?.color : `${selStyle?.color}44`}`,
                        transition: "background 0.15s, color 0.15s",
                      }}>
                        {isChecked ? "✓" : i + 1}
                      </div>
                      <div style={{
                        fontSize: 13.5, lineHeight: 1.7,
                        color: isChecked ? "#5a7a5a" : "#c8dcc8",
                        paddingTop: 3,
                        textDecoration: isChecked ? "line-through" : "none",
                        transition: "color 0.15s",
                      }}>
                        {task}
                      </div>
                    </button>
                  );
                })}
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

          {tab === "notes" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label htmlFor="day-note" style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1, color: "#7a9a7a", textTransform: "uppercase" }}>
                  Your notes & concerns
                </label>
                <span style={{ fontFamily: "'Courier New', monospace", fontSize: 10, color: statusColor, minHeight: 12 }}>
                  {statusLabel}
                </span>
              </div>
              <textarea
                id="day-note"
                value={note}
                onChange={(e) => onChangeNote(e.target.value)}
                onBlur={() => onFlushNote()}
                placeholder="Write anything you observed or are worried about on this day: watering, leaf color, pests, weather, questions to look up later."
                rows={12}
                style={{
                  width: "100%", resize: "vertical",
                  background: "rgba(0,0,0,0.25)", color: "#e8f5e3",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10,
                  padding: "12px 14px", fontSize: 14, lineHeight: 1.7,
                  fontFamily: "'Georgia', 'Times New Roman', serif", outline: "none",
                }}
              />
            </div>
          )}

          {tab === "threats" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {threats.length === 0 ? (
                <div style={{ textAlign: "center", padding: "24px 0", color: "#3a5a3a", fontFamily: "'Courier New', monospace", fontSize: 13 }}>
                  No active threats for this phase.
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
        </div>
      </div>
    </div>
  );
}
