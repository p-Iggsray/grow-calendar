import { Label, NumStepper } from "./SetupWizard/styleHelpers.jsx";
import { BREEDER_WEEKS, breederFieldLabel, clampBreederWeeks } from "../lib/plantClock.js";

const SUB_LABEL = { fontSize: 11, color: "var(--c-text-faint)" };

// The breeder's harvest time as a range: the least and the most weeks. What it
// counts from depends on the plant, and the label says which, because an
// autoflower's packet quotes seed to harvest and a photoperiod's quotes
// flowering time.
export default function BreederWeeksField({ min, max, auto, onChange }) {
  const limits = auto ? BREEDER_WEEKS.auto : BREEDER_WEEKS.photo;
  const set = (next) => onChange(clampBreederWeeks(next, auto));
  return (
    <div>
      <Label>{breederFieldLabel({ photo: !auto }, "cannabis")}, weeks</Label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, max-content)", columnGap: 18, rowGap: 4 }}>
        <span style={SUB_LABEL}>At least</span>
        <span style={SUB_LABEL}>At most</span>
        <NumStepper value={min} onChange={(v) => set({ min: v, max: Math.max(v, max) })} min={limits.min} max={limits.max} />
        <NumStepper value={max} onChange={(v) => set({ min, max: v })} min={min} max={limits.max} />
      </div>
      <div style={{ fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.5 }}>
        {auto
          ? "Counted from the day it started. Use the same number twice if the breeder gives one."
          : "Counted from the day it is moved to Flowering. Use the same number twice if the breeder gives one."}
      </div>
    </div>
  );
}
