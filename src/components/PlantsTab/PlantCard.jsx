import { motion } from "framer-motion";
import { MONO, SERIF, TYPE_LABEL, HEALTH_MAP, stageLabel, relDayLabel } from "./constants.js";
import { dayOfGrow } from "../../lib/journalStats.js";
import StageTimeline from "./StageTimeline.jsx";

export default function PlantCard({ plant, metrics, today, config, onOpen }) {
  const health = metrics?.health ? HEALTH_MAP[metrics.health] : null;
  const age = today && config ? dayOfGrow(today, config) : null;
  const lastLog = metrics?.date ? relDayLabel(metrics.date, today) : null;
  const entries = metrics?.entries ?? 0;

  const activityBits = [
    age ? `Day ${age}` : null,
    entries > 0 ? `${entries} ${entries === 1 ? "entry" : "entries"}` : "no entries yet",
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
          {plant.name || "Unnamed plant"}
        </div>
        {health && (
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: health.color, textTransform: "uppercase", flexShrink: 0 }}>
            {health.label}
          </span>
        )}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", marginTop: 6, letterSpacing: 0.3 }}>
        {TYPE_LABEL[plant.type] ?? plant.type}
        {plant.photo === false ? " · Auto" : " · Photo"}
        {plant.flowerWeeks ? ` · ${plant.flowerWeeks}wk flower` : ""}
        {plant.potSize ? ` · ${plant.potSize} gal` : ""}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
        <span>Stage: {stageLabel(plant.stage)}</span>
        {metrics?.height != null && <span>{metrics.height}{metrics.heightUnit || ""}</span>}
      </div>
      <div style={{ marginTop: 8 }}>
        <StageTimeline stage={plant.stage} height={5} />
      </div>
      {activityBits.length > 0 && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 6 }}>
          {activityBits.join(" · ")}
        </div>
      )}
    </motion.button>
  );
}
