import { CROPS, cropOf, words } from "../../lib/crops.js";
import { MONO, Label } from "./styleHelpers.jsx";

// The first question, and the one every later question depends on. A tent of
// plants and a monotub of mushrooms run the same app, but not one word of the
// setup after this is the same, so this is asked on its own and answered first.
const CROP_ICON = { cannabis: "🌿", mushrooms: "🍄" };

export function StepCrop({ survey, update }) {
  const current = cropOf(survey);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <Label>What are you growing in this space?</Label>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12, lineHeight: 1.6 }}>
          This sets the stages, the vocabulary and the whole rest of setup.
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          {CROPS.map((crop) => {
            const w = words(crop);
            const sel = crop === current;
            return (
              <button
                key={crop}
                type="button"
                onClick={() => update("crop", crop)}
                style={{
                  textAlign: "left", cursor: "pointer", padding: "15px 14px", borderRadius: 14,
                  background: sel ? "rgba(34,197,94,0.16)" : "var(--c-surface-1)",
                  border: `1.5px solid ${sel ? "rgba(34,197,94,0.6)" : "var(--c-surface-2)"}`,
                  display: "flex", flexDirection: "column", gap: 5, minHeight: 96,
                }}>
                <div style={{ fontSize: 24, lineHeight: 1 }}>{CROP_ICON[crop]}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: sel ? "var(--c-accent)" : "var(--c-text)" }}>
                  {w.cropLabel}
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-faint)", lineHeight: 1.5 }}>
                  {w.cropBlurb}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.8 }}>
        Every space answers this for itself, so a monotub and a flower tent can
        live side by side and each one stays in its own language. Changing it
        later resets the answers below, because none of them carry across.
      </div>
    </div>
  );
}
