import { useMemo } from "react";
import { PHASES, getPhase } from "../lib/growData.js";
import { usePlan } from "../lib/usePlan.jsx";

// The set of phase keys that actually occur in this grow's calendar, so the
// legend doesn't list secondary-strain phases for a single-strain grow.
function occurringPhases(config) {
  if (!config?.start || !config?.hazeHarvest) return null;
  const set = new Set();
  for (let t = config.start.getTime(); t <= config.hazeHarvest.getTime(); t += 86400000) {
    const p = getPhase(new Date(t), config);
    if (p) set.add(p);
  }
  return set;
}

export default function PhaseLegend() {
  const { config } = usePlan();
  const present = useMemo(() => occurringPhases(config), [config]);
  const entries = Object.entries(PHASES).filter(([k]) => !present || present.has(k));

  return (
    <div style={{ padding: "12px 14px 0" }}>
      <details style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 12,
        border: "1px solid var(--c-border-faint)",
      }}>
        <summary className="touch-target" style={{
          listStyle: "none", padding: "10px 14px",
          cursor: "pointer",
          fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)",
          textTransform: "uppercase", fontFamily: "'Courier New', monospace",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden="true">›</span> What do the colors mean?
        </summary>
        <div style={{ padding: "4px 14px 12px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            {entries.map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--c-text-muted)", fontFamily: "'Courier New', monospace" }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
