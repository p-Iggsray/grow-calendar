import { STAGE_ORDER, stageGroup, stageLabel } from "../lib/stageTimeline.js";

// What the calendar's colours mean. Stages that share a colour (drying, curing
// and done all read as Harvest) are listed once, in the order a grow moves
// through them.
const SWATCHES = (() => {
  const seen = new Set();
  const out = [];
  for (const stage of STAGE_ORDER) {
    const group = stageGroup(stage);
    if (!group || seen.has(group.key)) continue;
    seen.add(group.key);
    const members = STAGE_ORDER.filter((s) => stageGroup(s)?.key === group.key);
    out.push({ key: group.key, color: group.color, label: members.map(stageLabel).join(" · ") });
  }
  return out;
})();

export default function PhaseLegend() {
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
          textTransform: "uppercase", fontFamily: "var(--font-ui)",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          <span aria-hidden="true">›</span> What do the colors mean?
        </summary>
        <div style={{ padding: "4px 14px 12px" }}>
          <div style={{ fontSize: 11, color: "var(--c-text-ghost)", fontFamily: "var(--font-ui)", lineHeight: 1.6, marginBottom: 10 }}>
            A day takes its colour from the stage your plants were in on that day.
            The colour starts the day you move a plant into that stage - nothing is predicted.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
            {SWATCHES.map((v) => (
              <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
                <span style={{ fontSize: 11, color: "var(--c-text-muted)", fontFamily: "var(--font-ui)" }}>{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </details>
    </div>
  );
}
