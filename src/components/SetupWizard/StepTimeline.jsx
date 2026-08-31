import { MONO, SERIF, Label } from "./styleHelpers.jsx";

// "Where are you now" survey. The grower picks the stage their plants are
// currently in and the day it started; that single answer becomes day 1 of the
// space and the first entry on its calendar. Nothing after it is predicted -
// the rest of the calendar is written as the grow actually happens.
export const WIZARD_STAGES = [
  { value: "germination", label: "Germination", icon: "🌰", blurb: "Cracking seeds, taproot showing" },
  { value: "seedling",    label: "Seedling",    icon: "🌱", blurb: "First leaves, gentle light" },
  { value: "vegetative",  label: "Vegetative",  icon: "🌿", blurb: "Leafy growth, building structure" },
  { value: "flowering",   label: "Flowering",   icon: "🌸", blurb: "Buds forming" },
  { value: "flushing",    label: "Flushing",    icon: "💧", blurb: "Plain water before harvest" },
  { value: "harvest",     label: "Harvest",     icon: "✂️", blurb: "Ready to cut" },
];

function todayIso() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function StepTimeline({ survey, update }) {
  const stage = survey.currentStage || "seedling";
  const meta = WIZARD_STAGES.find(s => s.value === stage);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <Label>Where are your plants right now?</Label>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12, lineHeight: 1.6 }}>
          Pick the current stage and your calendar starts right here.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {WIZARD_STAGES.map(s => {
            const sel = s.value === stage;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => update("currentStage", s.value)}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "13px 13px", borderRadius: 14,
                  background: sel ? "rgba(34,197,94,0.16)" : "var(--c-surface-1)",
                  border: `1.5px solid ${sel ? "rgba(34,197,94,0.6)" : "var(--c-surface-2)"}`,
                  display: "flex", flexDirection: "column", gap: 4, minHeight: 78,
                }}>
                <div style={{ fontSize: 22, lineHeight: 1 }}>{s.icon}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: sel ? "var(--c-accent)" : "var(--c-text)" }}>{s.label}</div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-faint)", lineHeight: 1.4 }}>{s.blurb}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <Label>When did {meta?.label.toLowerCase() || "this stage"} start?</Label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="date"
            value={survey.stageStartDate}
            onChange={e => update("stageStartDate", e.target.value)}
            style={{
              flex: 1, background: "var(--c-surface-1)", color: "var(--c-text)",
              border: "1px solid var(--c-border-strong)", borderRadius: 10,
              padding: "12px 14px", fontSize: 16, fontFamily: SERIF,
              outline: "none", boxSizing: "border-box",
            }}
          />
          <button
            type="button"
            onClick={() => update("stageStartDate", todayIso())}
            style={{
              flexShrink: 0, padding: "0 16px", borderRadius: 10,
              background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
              color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5, cursor: "pointer",
            }}>
            Today
          </button>
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 6, lineHeight: 1.7 }}>
          This becomes day 1 of your calendar. Even a rough guess is fine - you
          can log the next stage change whenever it happens.
        </div>
      </div>

    </div>
  );
}
