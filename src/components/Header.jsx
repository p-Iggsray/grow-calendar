import { LOCATION } from "../lib/appConfig.js";

export default function Header({ todayStyle, nextMs, daysToNext, progress, onJumpToday, onOpenAdmin }) {
  return (
    <div style={{
      background: "linear-gradient(160deg, #0a1a0d 0%, #1a3a1e 50%, #0d2410 100%)",
      // Fill the notch / status-bar area with the header gradient and push the
      // content below it on devices with safe-area insets (0 on desktop).
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      paddingBottom: 16,
      paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: "#5a8a5a", textTransform: "uppercase", marginBottom: 6, fontFamily: "'Courier New', monospace" }}>
            Grow Log · {LOCATION}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: -1, lineHeight: 1.1, color: "#e8f5e3" }}>
            The Grow Calendar
          </div>
          <div style={{ fontSize: 12, color: "#6aaa6a", marginTop: 5, fontFamily: "'Courier New', monospace" }}>
            1× Grandaddy Purp · 2× Strawberry Haze
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          {onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Manage members"
              style={{
                background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.18)",
                borderRadius: 8, color: "#cbe6cb", fontSize: 12, padding: "5px 10px",
                cursor: "pointer", fontFamily: "'Courier New', monospace", letterSpacing: 1,
              }}>
              MEMBERS
            </button>
          )}
          <button onClick={onJumpToday} style={{
            background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 10, padding: "8px 14px", color: "#4ade80", fontSize: 12,
            fontFamily: "'Courier New', monospace", cursor: "pointer", letterSpacing: 1,
          }}>
            TODAY
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, color: "#5a8a5a", fontFamily: "'Courier New', monospace" }}>
            May 21 to Oct 18
          </span>
          <span style={{ fontSize: 11, color: "#4ade80", fontFamily: "'Courier New', monospace" }}>
            {progress}% complete
          </span>
        </div>
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{
            width: `${progress}%`, height: "100%",
            background: "linear-gradient(90deg, #166534, #22c55e)",
            borderRadius: 4, transition: "width 1s ease",
          }} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        {todayStyle && (
          <div style={{
            background: "rgba(255,255,255,0.07)", border: `1px solid ${todayStyle.color}44`,
            borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: todayStyle.color,
          }}>
            <span style={{ opacity: 0.6 }}>Now: </span>{todayStyle.label}
          </div>
        )}
        {nextMs?.done && (
          <div style={{
            background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)",
            borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: "#4ade80",
          }}>
            {nextMs.icon} {nextMs.label}
          </div>
        )}
        {nextMs && !nextMs.done && daysToNext > 0 && (
          <div style={{
            background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "'Courier New', monospace",
          }}>
            <span style={{ opacity: 0.5 }}>{nextMs.icon} {nextMs.label} in </span>
            <span style={{ color: "#facc15", fontWeight: 700 }}>{daysToNext}d</span>
          </div>
        )}
        {nextMs && !nextMs.done && daysToNext === 0 && (
          <div style={{
            background: "rgba(250,204,21,0.12)", border: "1px solid rgba(250,204,21,0.3)",
            borderRadius: 8, padding: "6px 12px", fontSize: 11, fontFamily: "'Courier New', monospace",
            color: "#facc15",
          }}>
            {nextMs.icon} {nextMs.label} is TODAY
          </div>
        )}
      </div>
    </div>
  );
}
