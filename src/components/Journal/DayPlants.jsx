import { Scissors, Sprout } from "lucide-react";
import { plantsOnDate, shortWeeks } from "../../lib/plantClock.js";
import { stageGroup, stageLabel } from "../../lib/stageTimeline.js";
import { HARVEST_COLOR } from "../HarvestLine.jsx";

const UI = "var(--font-ui)";
const NUM = "var(--font-num)";

// Every plant as it was on this page's day: how old, which stage and how far
// into it, and whether the day fell in its harvest window. Turning the pages
// back shows the grow getting younger.
export default function DayPlants({ plants, records, dateKey, todayKey, crop, firstDate, unit }) {
  const rows = plantsOnDate(plants, records, dateKey, { crop, fallback: firstDate, todayKey });
  if (!rows.length) return null;
  const anyWindow = rows.some((r) => r.inWindow);
  return (
    <section
      aria-label="Plants on this day"
      className="card"
      style={{
        padding: "11px 13px",
        borderColor: anyWindow ? `${HARVEST_COLOR}66` : undefined,
      }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, marginBottom: 7,
        fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-muted)",
      }}>
        <Sprout size={13} strokeWidth={2} aria-hidden="true" style={{ color: "#22c55e" }} />
        On this day
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r) => (
          <li key={r.plant.id} style={{ display: "flex", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, rowGap: 2 }}>
            <span style={{ fontFamily: UI, fontSize: 13, fontWeight: 700, color: "var(--c-text)" }}>
              {(r.plant.name || `Unnamed ${unit}`).trim()}{r.count > 1 ? ` x${r.count}` : ""}
            </span>
            <span style={{ fontFamily: NUM, fontSize: 11.5, color: "var(--c-text-muted)" }}>
              Day {r.age} · {shortWeeks(r.age)}
            </span>
            {r.stage && (
              <span style={{ fontFamily: UI, fontSize: 11.5, color: stageGroup(r.stage)?.color ?? "var(--c-text-faint)" }}>
                {stageLabel(r.stage)} day {r.dayInStage}
              </span>
            )}
            {r.inWindow && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: UI, fontSize: 11.5, fontWeight: 700, color: HARVEST_COLOR }}>
                <Scissors size={11} strokeWidth={2.2} aria-hidden="true" />
                Harvest window, day {r.dayOfWindow} of {r.windowDays}
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
