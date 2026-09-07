import { Droplets, Thermometer, Sprout } from "lucide-react";
import { ymd } from "../lib/api.js";
import {
  currentStageOf, dayOfGrow, stageGroup, stageLabel, stageOnDate, stageStartedOn,
} from "../lib/stageTimeline.js";
import { summariseStatus, whenLabel } from "../lib/homeStatus.js";
import { formatWater } from "../lib/waterUnits.js";
import { words } from "../lib/crops.js";
import { partitionPlants } from "./PlantsTab/constants.js";

// The three questions you open the app to ask, answered before you scroll:
// where the grow is, what it is doing, and how much of it there is.
//
// Everything on this card is a day somebody wrote down. There is deliberately
// no "day 4 of about 14" here, no projected finish, no averaged trend: the
// calendar underneath it stops colouring at today for exactly the same reason,
// and a card that guessed would undo that in larger type.
//
// A tile that has nothing to report says so plainly. "Not yet misted" is a
// useful answer; a dash is not.

const UI = "var(--font-ui)";

function Tile({ Icon, label, value, sub, tone }) {
  return (
    <div style={{
      flex: 1, minWidth: 0,
      padding: "8px 9px 9px", borderRadius: 12,
      background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 4, marginBottom: 3,
        fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: 0.7,
        textTransform: "uppercase", color: "var(--c-text-muted)",
      }}>
        <Icon size={10} strokeWidth={2.4} aria-hidden="true" style={{ flexShrink: 0 }} />
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
      <div style={{
        fontFamily: UI, fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
        color: tone ?? "var(--c-text)",
        whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{
          fontFamily: UI, fontSize: 10.5, color: "var(--c-text-faint)", marginTop: 1,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

// A climate reading, in as few characters as a 130px tile allows.
function climateValue(climate) {
  const deg = (n) => `${Math.round(n)}°`;
  const temp = climate.high != null && climate.low != null
    ? `${deg(climate.high)}/${deg(climate.low)}`
    : climate.high != null ? deg(climate.high)
    : climate.low != null ? deg(climate.low)
    : null;
  const rh = climate.humidity != null ? `${Math.round(climate.humidity)}%` : null;
  return [temp, rh].filter(Boolean).join(" · ");
}

export default function HomeStatus({ today, survey, crop, stageEvents, firstDate, days }) {
  const todayKey = ymd(today ?? new Date());
  const { active } = partitionPlants(survey);
  // The stage the space is in now, and the day it was switched to, both read
  // off recorded switches. The roster is the fallback for a space old enough
  // to predate stage records: it knows the stage but not the day it started,
  // so that one gets a name and no "days in stage" line.
  const startedOn = stageStartedOn(stageEvents, todayKey);
  const shown = stageOnDate(stageEvents, todayKey) ?? currentStageOf(active);

  const w = words(crop);
  const label = shown ? stageLabel(shown) : null;
  const color = shown ? stageGroup(shown)?.color ?? "var(--c-accent)" : "var(--c-text-muted)";
  const dayNum = dayOfGrow(firstDate, todayKey);
  const inStage = dayOfGrow(startedOn, todayKey);

  const { water, climate } = summariseStatus(days);

  // Nothing recorded and nothing growing: the space has not started, and a card
  // full of "never" is worse than no card. The empty state handles that.
  if (!shown && active.length === 0) return null;

  return (
    <section
      aria-label="This space right now"
      style={{
        width: "calc(100% - 20px)", margin: "8px 10px 0",
        padding: "11px 12px 12px", borderRadius: 14,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
      }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{
          fontFamily: UI, fontSize: 23, fontWeight: 800, letterSpacing: -0.7, color,
          minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {label ?? "Not started"}
        </span>
        {dayNum != null && (
          <span style={{
            fontFamily: UI, fontSize: 12.5, fontWeight: 700, color: "var(--c-text-muted)", flexShrink: 0,
          }}>
            Day {dayNum}
          </span>
        )}
      </div>

      {inStage != null && (
        <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-faint)", marginTop: 1 }}>
          {inStage === 0 ? "Switched today" : `${inStage} day${inStage === 1 ? "" : "s"} in this stage`}
        </div>
      )}

      <div style={{ display: "flex", gap: 7, marginTop: 10 }}>
        <Tile
          Icon={Droplets}
          label={`Last ${w.waterNoun}`}
          value={water ? formatWater(water.gal, water.unit ?? "gal") : `Not ${w.waterVerb} yet`}
          sub={water ? whenLabel(water.date, todayKey) : null}
          tone={water ? undefined : "var(--c-text-muted)"}
        />
        <Tile
          Icon={Thermometer}
          label="Climate"
          value={climate ? climateValue(climate) : "No reading"}
          sub={climate ? whenLabel(climate.date, todayKey) : null}
          tone={climate ? undefined : "var(--c-text-muted)"}
        />
        <Tile
          Icon={Sprout}
          label="In here"
          value={`${active.length} ${active.length === 1 ? w.unit : w.units}`}
        />
      </div>
    </section>
  );
}
