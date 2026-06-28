import { motion } from "framer-motion";
import { MONO, SERIF, TYPE_LABEL, HEALTH_MAP, stageLabel } from "./constants.js";

export default function PlantCard({ plant, metrics, onOpen }) {
  const health = metrics?.health ? HEALTH_MAP[metrics.health] : null;
  return (
    <motion.button
      type="button"
      onClick={onOpen}
      whileTap={{ scale: 0.98 }}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: 16, borderRadius: 14,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        cursor: "pointer",
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
      {metrics?.date && (
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 4 }}>
          Last log: {metrics.date}
        </div>
      )}
    </motion.button>
  );
}
