import { PHASES } from "../lib/growData.js";

export default function PhaseLegend() {
  return (
    <div style={{ padding: "12px 14px 0" }}>
      <details style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)",
      }}>
        <summary style={{
          listStyle: "none", padding: "10px 14px",
          cursor: "pointer",
          fontSize: 10, letterSpacing: 2, color: "#5a8a5a",
          textTransform: "uppercase", fontFamily: "'Courier New', monospace",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden="true">›</span> What do the colors mean?
        </summary>
        <div style={{ padding: "4px 14px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            {Object.entries(PHASES).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "#7a9a7a", fontFamily: "'Courier New', monospace" }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
