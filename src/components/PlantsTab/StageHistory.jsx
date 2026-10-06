import { stageGroup, stageLabel } from "../../lib/stageTimeline.js";
import { shortDate, shortWeeks, spanDays } from "../../lib/plantClock.js";
import { MONO } from "./constants.js";

// Every stage this plant has been through, with the day it began and how long
// it lasted. The one it is in now runs to today.
export default function StageHistory({ spans, todayKey }) {
  if (!spans?.length) return null;
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
      {spans.map((s) => {
        const days = spanDays(s, todayKey);
        const color = stageGroup(s.stage)?.color ?? "var(--c-accent)";
        const current = s.end == null;
        return (
          <li key={`${s.stage}-${s.start}`} style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 11px", borderRadius: 10,
            background: current ? "var(--c-surface-2)" : "var(--c-surface-1)",
            border: "1px solid var(--c-border-faint)",
          }}>
            <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontFamily: MONO, fontSize: 12, color: "var(--c-text)" }}>
              {stageLabel(s.stage)}
              <span style={{ color: "var(--c-text-ghost)" }}>
                {" · "}{shortDate(s.start)}{current ? " to now" : ` to ${shortDate(s.end)}`}
              </span>
            </span>
            <span style={{ fontFamily: MONO, fontSize: 12, fontWeight: current ? 700 : 500, color: current ? color : "var(--c-text-dim)" }}>
              {days != null ? shortWeeks(days) : "-"}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
