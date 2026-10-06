import { motion } from "framer-motion";
import { MONO, SERIF, typeLabel, HEALTH_MAP, stageLabel, relDayLabel } from "./constants.js";
import { cropOf, words } from "../../lib/crops.js";
import { ymd } from "../../lib/api.js";
import { breederWeeks, plantClock, shortWeeks, weeksRangeLabel } from "../../lib/plantClock.js";
import StageTimeline from "./StageTimeline.jsx";
import HarvestLine from "../HarvestLine.jsx";

export default function PlantCard({ plant, metrics, crop, today, firstDate, records = [], onOpen }) {
  // A plant counts from the day it really started (or, without that, the day
  // it was added), not from the space's day 0.
  const w = words(crop);
  const mushrooms = cropOf(crop) === "mushrooms";
  const health = metrics?.health ? HEALTH_MAP[metrics.health] : null;
  const todayKey = today ? ymd(today) : null;
  const clock = plantClock(plant, records, { todayKey, crop, fallback: firstDate });
  const lastLog = metrics?.date ? relDayLabel(metrics.date, today) : null;

  const activityBits = [
    clock.age != null ? `Day ${clock.age} (${shortWeeks(clock.age)} old)` : null,
    lastLog ? `last log ${lastLog}` : null,
  ].filter(Boolean);
  const stageText = clock.inStage != null
    ? `${stageLabel(plant.stage)} · ${shortWeeks(clock.inStage)}`
    : stageLabel(plant.stage);

  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      className="card"
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: 16, cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div style={{ fontSize: 17, fontWeight: 700, fontFamily: SERIF, color: "var(--c-text)", lineHeight: 1.2 }}>
          {plant.name || `Unnamed ${w.unit}`}
        </div>
        {health && (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: health.color, textTransform: "uppercase", flexShrink: 0 }}>
            {health.label}
          </span>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", marginTop: 6, letterSpacing: 0.3 }}>
        {typeLabel(plant.type, crop) || plant.type}
        {/* Photoperiod is a light-cycle question, and a pot size is a pot: a tub
            has an answer to neither. */}
        {mushrooms ? "" : (plant.photo === false ? " · Auto" : " · Photo")}
        {mushrooms
          ? (plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk to flush` : "")
          : ` · ${weeksRangeLabel(breederWeeks(plant))} ${plant.photo === false ? "seed to harvest" : "flower"}`}
        {!mushrooms && plant.potSize ? ` · ${plant.potSize} gal` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
        <span>Stage: {stageText}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <StageTimeline stage={plant.stage} crop={crop} height={5} />
      </div>
      {plant.status === "growing" && clock.window && (
        <div style={{ marginTop: 8 }}>
          <HarvestLine window={clock.window} status={clock.status} todayKey={todayKey} size={11} />
        </div>
      )}
      {activityBits.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 6 }}>
          {activityBits.join(" · ")}
        </div>
      )}
    </motion.button>
  );
}
