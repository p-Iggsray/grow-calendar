import { MONO } from "./styleHelpers.jsx";

// Choose how this grow's daily tasks are populated:
//   first grow? yes            -> "guided"  (full AI plan, like the original)
//   first grow? no + autofill  -> "autofill" (MJ fills the whole season once)
//   first grow? no + manual    -> "manual"  (you enter your own tasks)
function Choice({ active, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        padding: "14px 16px", borderRadius: 12, marginBottom: 10,
        background: active ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? "rgba(34,197,94,0.55)" : "var(--c-border-strong)"}`,
        color: "var(--c-text)",
      }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: active ? "var(--c-accent)" : "var(--c-text)" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--c-text-dim)", lineHeight: 1.5, marginTop: 4 }}>{desc}</div>
    </button>
  );
}

export function StepTasks({ firstGrow, setFirstGrow, autofill, setAutofill }) {
  return (
    <div>
      <div style={{ fontSize: 13.5, color: "var(--c-text-dim)", lineHeight: 1.6, marginBottom: 18 }}>
        How should we set up your daily tasks? You can always change tasks later.
      </div>

      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 8 }}>
        Is this your first grow?
      </div>
      <Choice
        active={firstGrow === true}
        title="Yes — guide me"
        desc="MJ builds a complete day-by-day plan tailored to your setup, like a coach. Best if you're new."
        onClick={() => { setFirstGrow(true); setAutofill(null); }}
      />
      <Choice
        active={firstGrow === false}
        title="No — I've done this before"
        desc="Skip the full guided plan. You'll choose how tasks get filled in next."
        onClick={() => setFirstGrow(false)}
      />

      {firstGrow === false && (
        <div style={{ marginTop: 18 }}>
          <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 8 }}>
            Auto-fill tasks with AI?
          </div>
          <Choice
            active={autofill === true}
            title="Yes — auto-fill the season"
            desc="MJ fills in the whole season's daily tasks once. You can edit or re-run anytime."
            onClick={() => setAutofill(true)}
          />
          <Choice
            active={autofill === false}
            title="No — I'll add my own"
            desc="Start with an empty calendar. Add your own tasks phase by phase, choosing how many phases each covers."
            onClick={() => setAutofill(false)}
          />
        </div>
      )}
    </div>
  );
}
