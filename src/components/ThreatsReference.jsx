import { THREATS } from "../lib/growData.js";

export default function ThreatsReference() {
  return (
    <div style={{ padding: "12px 14px 0" }}>
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.06)", padding: "14px",
      }}>
        <div style={{ fontSize: 9, letterSpacing: 3, color: "#3a5a3a", textTransform: "uppercase", fontFamily: "'Courier New', monospace", marginBottom: 12 }}>
          All Season Threats — Quick Reference
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {THREATS.map(t => (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{t.icon}</span>
              <span style={{ fontSize: 12, color: "#7a9a7a", fontFamily: "'Courier New', monospace" }}>{t.title}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#3a5a3a", fontFamily: "'Courier New', monospace", lineHeight: 1.7 }}>
          Tap any day in the calendar to see which threats are active for that phase and what to do about them.
        </div>
      </div>
    </div>
  );
}
