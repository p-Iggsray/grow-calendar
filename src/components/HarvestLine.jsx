import { Scissors } from "lucide-react";
import { harvestLine } from "../lib/plantClock.js";
import { STAGE_GROUP } from "../lib/crops.js";

// The harvest amber, the same colour the calendar tints harvest days with.
export const HARVEST_COLOR = STAGE_GROUP.harvest.color;

const PHASE_COLOR = {
  open: HARVEST_COLOR,
  past: "var(--c-danger-soft)",
  before: "var(--c-text-dim)",
  pending: "var(--c-text-ghost)",
  harvested: "var(--c-text-ghost)",
};

// One line saying where a plant stands against its breeder's window. Nothing
// at all for a plant that has no window (a mushroom tub).
export default function HarvestLine({ window, status, todayKey, size = 11, font = "var(--font-ui)" }) {
  if (!window || !status) return null;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 5,
      fontFamily: font, fontSize: size, lineHeight: 1.4,
      color: PHASE_COLOR[status.phase] ?? "var(--c-text-dim)",
      fontWeight: status.phase === "open" ? 700 : 500,
    }}>
      <Scissors size={size} strokeWidth={2} aria-hidden="true" style={{ flexShrink: 0 }} />
      <span>{harvestLine(window, todayKey)}</span>
    </div>
  );
}
