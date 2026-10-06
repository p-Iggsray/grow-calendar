import { clockRows, shortWeeks } from "../lib/plantClock.js";
import { stageGroup, stageLabel } from "../lib/stageTimeline.js";
import HarvestLine from "./HarvestLine.jsx";

const UI = "var(--font-ui)";
// Enough rows to see a tent at a glance; the rest are a tab away.
const DEFAULT_MAX_ROWS = 4;

// One plant (or a run of identical ones): how old, how long in its stage, and
// where it stands against the breeder's window.
function PlantRow({ row, todayKey, unit }) {
  const name = (row.plant.name || `Unnamed ${unit}`).trim();
  return (
    <li style={{ padding: "7px 0", borderTop: "1px solid var(--c-border-faint)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span style={{
          fontFamily: UI, fontSize: 13, fontWeight: 700, color: "var(--c-text)",
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {name}{row.count > 1 ? ` x${row.count}` : ""}
        </span>
        {row.age != null && (
          <span style={{ fontFamily: "var(--font-num)", fontSize: 11.5, color: "var(--c-text-muted)", flexShrink: 0 }}>
            Day {row.age} · {shortWeeks(row.age)}
          </span>
        )}
      </div>
      {row.current && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: stageGroup(row.current.stage)?.color ?? "var(--c-text-faint)", marginTop: 1 }}>
          {stageLabel(row.current.stage)}{row.inStage != null ? ` for ${shortWeeks(row.inStage)}` : ""}
        </div>
      )}
      {row.window && (
        <div style={{ marginTop: 2 }}>
          <HarvestLine window={row.window} status={row.status} todayKey={todayKey} size={11} />
        </div>
      )}
    </li>
  );
}

// Every growing plant's clock, identical plants folded into one row.
export default function PlantClockRows({ clocks, todayKey, unit, label, max = DEFAULT_MAX_ROWS, moreText = "more in Spaces" }) {
  const rows = clockRows(clocks);
  if (!rows.length) return null;
  const shown = max ? rows.slice(0, max) : rows;
  const more = rows.length - shown.length;
  return (
    <ul aria-label={label} style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
      {shown.map((row) => <PlantRow key={row.plant.id} row={row} todayKey={todayKey} unit={unit} />)}
      {more > 0 && (
        <li style={{ fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)", paddingTop: 6, borderTop: "1px solid var(--c-border-faint)" }}>
          {more} {moreText}
        </li>
      )}
    </ul>
  );
}
