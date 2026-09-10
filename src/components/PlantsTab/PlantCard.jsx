import { motion } from "framer-motion";
import { MONO, SERIF, typeLabel, HEALTH_MAP, stageLabel, relDayLabel } from "./constants.js";
import { cropOf, words } from "../../lib/crops.js";
import { dayOfGrow } from "../../lib/stageTimeline.js";
import { ymd } from "../../lib/api.js";
import StageTimeline from "./StageTimeline.jsx";

export default function PlantCard({ plant, metrics, crop, today, firstDate, onOpen }) {
  // A plant counts from the day IT was added, not from the space's day 0.
  // Older plants predate that stamp, so they fall back to the space.
  const w = words(crop);
  const mushrooms = cropOf(crop) === "mushrooms";
  const health = metrics?.health ? HEALTH_MAP[metrics.health] : null;
  const age = today ? dayOfGrow(plant.createdAt ?? firstDate, ymd(today)) : null;
  const lastLog = metrics?.date ? relDayLabel(metrics.date, today) : null;

  const activityBits = [
    age != null ? `Day ${age}` : null,
    lastLog ? `last log ${lastLog}` : null,
  ].filter(Boolean);

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
        {/* A lost one and an archived one both sit in the same drawer, and
            only this says which is which. It wins over the health reading,
            which is now a reading from before it died. */}
        {plant.status === "dead" ? (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-warn)", textTransform: "uppercase", flexShrink: 0 }}>
            Lost
          </span>
        ) : health ? (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: health.color, textTransform: "uppercase", flexShrink: 0 }}>
            {health.label}
          </span>
        ) : null}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", marginTop: 6, letterSpacing: 0.3 }}>
        {typeLabel(plant.type, crop) || plant.type}
        {/* Photoperiod is a light-cycle question, and a pot size is a pot: a tub
            has an answer to neither. */}
        {mushrooms ? "" : (plant.photo === false ? " · Auto" : " · Photo")}
        {plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk ${mushrooms ? "to flush" : "flower"}` : ""}
        {!mushrooms && plant.potSize ? ` · ${plant.potSize} gal` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
        <span>Stage: {stageLabel(plant.stage)}</span>
      </div>
      <div style={{ marginTop: 8 }}>
        <StageTimeline stage={plant.stage} crop={crop} height={5} />
      </div>
      {activityBits.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 6 }}>
          {activityBits.join(" · ")}
        </div>
      )}
    </motion.button>
  );
}
