import { THREATS } from "../lib/growData.js";

export default function ThreatsReference() {
  return (
    <div style={{ padding: "12px 14px 0" }}>
      <details style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 12,
        border: "1px solid var(--c-border-faint)",
      }}>
        <summary style={{
          listStyle: "none", padding: "10px 14px",
          cursor: "pointer",
          fontSize: 10, letterSpacing: 2, color: "var(--c-text-faint)",
          textTransform: "uppercase", fontFamily: "'Courier New', monospace",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden="true">›</span> All season threats: quick reference
        </summary>
        <div style={{ padding: "4px 14px 14px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {THREATS.map(t => (
              <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 16, width: 24, textAlign: "center", flexShrink: 0 }}>{t.icon}</span>
                <span style={{ fontSize: 12, color: "var(--c-text-muted)", fontFamily: "'Courier New', monospace" }}>{t.title}</span>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 12, fontSize: 11, color: "var(--c-text-ghost)", fontFamily: "'Courier New', monospace", lineHeight: 1.7 }}>
            Tap any day in the calendar to see which threats are active for that phase and what to do about them.
          </div>
        </div>
      </details>
    </div>
  );
}
