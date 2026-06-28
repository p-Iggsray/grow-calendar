import { STAGE_ORDER, stageLabel } from "./constants.js";

// Visual Seedling→…→Done progress bar. Segments up to (and including) the
// current stage are filled. When onPick is given, each segment is tappable to
// jump straight to that stage.
export default function StageTimeline({ stage, onPick, height = 8 }) {
  const idx = Math.max(0, STAGE_ORDER.indexOf(stage));
  return (
    <div style={{ display: "flex", gap: 4 }}>
      {STAGE_ORDER.map((s, i) => {
        const done = i <= idx;
        const seg = (
          <div style={{
            flex: 1, height, borderRadius: height / 2,
            background: done ? "var(--c-accent)" : "var(--c-surface-2)",
            opacity: done && i !== idx ? 0.55 : 1,
            transition: "background 0.2s, opacity 0.2s",
          }} />
        );
        if (!onPick) return <div key={s} style={{ flex: 1, display: "flex" }}>{seg}</div>;
        return (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            aria-label={`Set stage: ${stageLabel(s)}`}
            title={stageLabel(s)}
            style={{ flex: 1, display: "flex", padding: 0, border: "none", background: "none", cursor: "pointer" }}
          >
            {seg}
          </button>
        );
      })}
    </div>
  );
}
