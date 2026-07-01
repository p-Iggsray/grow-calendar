import { MONO } from "./styleHelpers.jsx";

// How the grow's daily tasks get populated. Both options are instant and fully
// offline (no AI, no limits): a heuristic plan tailored to the survey answers,
// or a blank calendar the grower fills in.
function Choice({ active, title, desc, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%", textAlign: "left", cursor: "pointer",
        padding: "16px", borderRadius: 14, marginBottom: 12,
        background: active ? "rgba(34,197,94,0.16)" : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${active ? "rgba(34,197,94,0.55)" : "var(--c-border-strong)"}`,
        color: "var(--c-text)",
      }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: active ? "var(--c-accent)" : "var(--c-text)" }}>{title}</div>
      <div style={{ fontSize: 12.5, color: "var(--c-text-dim)", lineHeight: 1.5, marginTop: 4 }}>{desc}</div>
    </button>
  );
}

export function StepTasks({ wantTasks, setWantTasks }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 10 }}>
        Daily tasks
      </div>
      <div style={{ fontSize: 13.5, color: "var(--c-text-dim)", lineHeight: 1.6, marginBottom: 18 }}>
        Do you want a task plan built for you, or would you rather add your own? You can change or
        add tasks either way.
      </div>

      <Choice
        active={wantTasks === true}
        title="Build my task plan"
        desc="Get a full day by day rundown of the best grow patterns, tailored to your environment and setup. Instant, with no limits."
        onClick={() => setWantTasks(true)}
      />
      <Choice
        active={wantTasks === false}
        title="I will add my own tasks"
        desc="Start with an empty calendar and enter tasks yourself, choosing how many phases each one covers."
        onClick={() => setWantTasks(false)}
      />
    </div>
  );
}
