import { fmtL } from "../lib/dates.js";

export default function DetailPanel({ selected, detail, selStyle, threats, tab, setTab }) {
  if (!detail) {
    return (
      <div style={{ padding: "12px 14px 0" }}>
        <div style={{
          background: "rgba(255,255,255,0.03)", borderRadius: 14,
          border: "1px solid rgba(255,255,255,0.07)",
          padding: "40px 24px", textAlign: "center",
        }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🌿</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#a0d0a0", marginBottom: 8, letterSpacing: -0.3 }}>
            Tap any highlighted day
          </div>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "#3a5a3a", lineHeight: 1.9 }}>
            to get your full task list and<br />
            active threat warnings for that day<br />
            <br />
            Amber dots on dates = active threats<br />
            Solid border = today
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 14,
        border: `1px solid ${selStyle?.color}44`, overflow: "hidden",
      }}>
        <div style={{ background: `${selStyle?.color}22`, padding: "14px 16px 12px", borderBottom: `1px solid ${selStyle?.color}33` }}>
          <div style={{ fontFamily: "'Courier New', monospace", fontSize: 10, letterSpacing: 2, color: selStyle?.color, textTransform: "uppercase", marginBottom: 5 }}>
            {selStyle?.label} · {fmtL(selected)}, 2026
          </div>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#e8f5e3", lineHeight: 1.2, letterSpacing: -0.3 }}>
            {detail.title}
          </div>
        </div>

        <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          {[
            { id: "tasks",   label: "Day Tasks" },
            { id: "threats", label: `Threats${threats.length > 0 ? ` (${threats.length})` : ""}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0", background: "none",
              border: "none", borderBottom: tab === t.id ? `2px solid ${selStyle?.color}` : "2px solid transparent",
              color: tab === t.id ? selStyle?.color : "#5a7a5a",
              fontSize: 12, fontFamily: "'Courier New', monospace",
              fontWeight: tab === t.id ? 700 : 400,
              cursor: "pointer", letterSpacing: 1,
              transition: "color 0.2s",
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ padding: "14px 16px" }}>
          {tab === "tasks" && (
            <>
              <div style={{
                background: `${selStyle?.color}11`, borderRadius: 8,
                padding: "10px 12px", fontSize: 13, color: "#c0d8c0",
                lineHeight: 1.7, marginBottom: 16,
                border: `1px solid ${selStyle?.color}22`,
              }}>
                {detail.summary}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {detail.tasks.map((task, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: 6,
                      background: `${selStyle?.color}22`,
                      color: selStyle?.color,
                      fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 800,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, border: `1px solid ${selStyle?.color}44`,
                    }}>
                      {i + 1}
                    </div>
                    <div style={{ fontSize: 13.5, lineHeight: 1.7, color: "#c8dcc8", paddingTop: 3 }}>
                      {task}
                    </div>
                  </div>
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
