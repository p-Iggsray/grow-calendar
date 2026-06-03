import { LOCATION, STRAIN_1, STRAIN_2 } from "../lib/appConfig.js";

// TODAY and MEMBERS buttons moved to the bottom tab bar / More screen.
export default function Header({ todayStyle, nextMs, daysToNext, progress }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #0a1a0d 0%, #1a3a1e 50%, #0d2410 100%)",
      paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      paddingBottom: 12,
      paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
      borderBottom: "1px solid var(--c-border-soft)",
    }}>
      <div style={{ marginBottom: 11 }}>
        <div style={{ fontSize: 10, letterSpacing: 4, color: "var(--c-text-faint)", textTransform: "uppercase", marginBottom: 4, fontFamily: "'Courier New', monospace" }}>
          Grow Log · {LOCATION}
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: "var(--c-text)" }}>
          The Grow Calendar
        </div>
        <div style={{ fontSize: 11, color: "#6aaa6a", marginTop: 3, fontFamily: "'Courier New', monospace" }}>
          1× {STRAIN_1} · 2× {STRAIN_2}
        </div>
      </div>

      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: "var(--c-text-faint)", fontFamily: "'Courier New', monospace" }}>
            May 21 to Oct 18
          </span>
          <span style={{ fontSize: 11, color: "var(--c-accent)", fontFamily: "'Courier New', monospace" }}>
            {progress}% complete
          </span>
        </div>
        <div style={{ background: "var(--c-surface-2)", borderRadius: 4, height: 5, overflow: "hidden" }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: "linear-gradient(90deg, #166534, #22c55e)",
            borderRadius: 4, transition: "width 1s ease",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
        {todayStyle && (
          <div style={{
            background: "var(--c-border-soft)", border: `1px solid ${todayStyle.color}44`,
            borderRadius: 8, padding: "5px 11px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: todayStyle.color,
          }}>
            <span style={{ opacity: 0.6 }}>Now: </span>{todayStyle.label}
          </div>
        )}
        {nextMs?.done && (
          <div style={{
            background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 8, padding: "5px 11px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: "var(--c-accent)",
          }}>
            {nextMs.icon} {nextMs.label}
          </div>
        )}
        {nextMs && !nextMs.done && daysToNext > 0 && (
          <div style={{
            background: "var(--c-border-soft)", border: "1px solid var(--c-border)",
            borderRadius: 8, padding: "5px 11px", fontSize: 11, fontFamily: "'Courier New', monospace",
          }}>
            <span style={{ opacity: 0.5 }}>{nextMs.icon} {nextMs.label} in </span>
            <span style={{ color: "#facc15", fontWeight: 700 }}>{daysToNext}d</span>
          </div>
        )}
        {nextMs && !nextMs.done && daysToNext === 0 && (
          <div style={{
            background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)",
            borderRadius: 8, padding: "5px 11px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: "#facc15",
          }}>
            {nextMs.icon} {nextMs.label} is TODAY
          </div>
        )}
      </div>
    </div>
  );
}
