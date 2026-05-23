import { PHASES } from "../lib/growData.js";

export default function PhaseLegend() {
  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)", padding: "12px 14px",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#3a5a3a", textTransform: "uppercase", fontFamily: "'Courier New', monospace", marginBottom: 10 }}>
          Phase Legend
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
          {Object.entries(PHASES).map(([k, v]) => (
            <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "#7a9a7a", fontFamily: "'Courier New', monospace" }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
