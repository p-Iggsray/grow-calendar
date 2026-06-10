import { MONO } from "./constants.js";

export default function UsageBar({ usage }) {
  if (!usage) return null;
  const { proCount, proLimit, flashCount = 0, flashLimit = 1500, userCount, userLimit, modelUsed } = usage;
  const usingPro = modelUsed?.includes("pro");
  const showPro = typeof proCount === "number" && typeof proLimit === "number" && (proCount > 0 || usingPro);
  const showUserCap = typeof userCount === "number" && typeof userLimit === "number";

  function bar(count, limit, label, dim) {
    const pct = limit > 0 ? Math.min(100, Math.round((count / limit) * 100)) : 0;
    const color = pct >= 90 ? "#f87171" : pct >= 70 ? "#fbbf24" : (dim ? "var(--c-text-faint)" : "var(--c-accent)");
    return (
      <div title={`${label}: ${count} of ${limit} today`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color, letterSpacing: 1 }}>{count}/{limit}</span>
        <div style={{ width: 48, height: 3, background: "var(--c-surface-2)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: color, transition: "width 0.3s, background 0.3s" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      {modelUsed && (
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: usingPro ? "#a78bfa" : "#5a8a5a", textTransform: "uppercase" }}>
          {usingPro ? "◆ Pro" : "Flash"}
        </span>
      )}
      {showUserCap && bar(userCount, userLimit, "Your messages today", false)}
      {showPro && bar(proCount, proLimit, "Pro calls today", false)}
      {bar(flashCount, flashLimit, "Flash calls today", true)}
    </div>
  );
}
