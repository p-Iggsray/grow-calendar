import { useState } from "react";
import { api } from "../../lib/api.js";
import { resolveSurveyForSetup } from "../../lib/stageAnchor.js";
import ConfirmModal from "../ConfirmModal.jsx";
import { defaultSurvey } from "./defaultSurvey.js";
import { MONO, SERIF } from "./styleHelpers.jsx";
import { StepBasics } from "./StepBasics.jsx";
import { StepStrains } from "./StepStrains.jsx";
import { StepTimeline } from "./StepTimeline.jsx";
import { StepSetup } from "./StepSetup.jsx";
import { StepSupplies } from "./StepSupplies.jsx";
import { StepTasks } from "./StepTasks.jsx";
import { StepReview } from "./StepReview.jsx";
import { GeneratingScreen } from "./GeneratingScreen.jsx";

// ─── Wizard shell ────────────────────────────────────────────────────────────

const STEPS = [
  { id: "basics",   title: "Grow Basics" },
  { id: "strains",  title: "Your Strains" },
  { id: "timeline", title: "Where You're At" },
  { id: "setup",    title: "Your Setup" },
  { id: "supplies", title: "Supplies" },
  { id: "tasks",    title: "Daily Tasks" },
  { id: "review",   title: "Review & Generate" },
];

export default function SetupWizard({ onComplete, onCancel, initialSurvey, growId }) {
  const [step, setStep] = useState(0);
  const [survey, setSurvey] = useState(() =>
    initialSurvey ? { ...defaultSurvey(), ...initialSurvey } : defaultSurvey()
  );
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  // Daily Tasks step: build a heuristic plan, or start empty and add your own.
  const [wantTasks, setWantTasks] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const taskMode = wantTasks === true ? "heuristic" : wantTasks === false ? "manual" : null;

  function update(field, value) {
    setSurvey(s => ({ ...s, [field]: value }));
  }

  function canAdvance() {
    if (step === 0) return survey.growName.trim().length > 0;
    if (step === 1) return survey.strains.every(s => s.name.trim().length > 0);
    if (step === 2) return (survey.stageStartDate || "").length > 0;
    if (STEPS[step].id === "tasks") return taskMode !== null;
    return true;
  }

  async function generate() {
    setGenerating(true);
    setGenError("");
    try {
      // Convert the "current stage + start date" answer into transplantDate,
      // startType, and per-plant stages before sending.
      const resolved = resolveSurveyForSetup(survey);
      if (growId) {
        await api.setupGrow(growId, resolved, taskMode || "heuristic");
      } else {
        await api.planSetup(resolved);
      }
      onComplete(taskMode || "heuristic");
    } catch (err) {
      setGenError(err.message || "Generation failed. Please try again.");
      setGenerating(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: SERIF,
      color: "var(--c-text)",
      background: "linear-gradient(160deg, #0a1a0d, var(--c-bg))",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        padding: "16px 16px 14px",
        paddingTop: "calc(16px + env(safe-area-inset-top, 0px))",
        borderBottom: "1px solid var(--c-border-soft)",
        background: "rgba(0,0,0,0.2)",
        flexShrink: 0,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-faint)", marginBottom: 4 }}>
          NEW GROW, STEP {step + 1} OF {STEPS.length}
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--c-text)", letterSpacing: -0.3 }}>
          {STEPS[step].title}
        </div>
        {/* Progress bar */}
        <div style={{
          height: 3, background: "var(--c-surface-2)", borderRadius: 2, marginTop: 12,
        }}>
          <div style={{
            height: "100%", borderRadius: 2,
            background: "linear-gradient(90deg, #22c55e, var(--c-accent))",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {generating ? (
          <GeneratingScreen manual={taskMode === "manual"} />
        ) : (
          <>
            {step === 0 && <StepBasics survey={survey} update={update} />}
            {step === 1 && <StepStrains survey={survey} update={update} />}
            {step === 2 && <StepTimeline survey={survey} update={update} />}
            {step === 3 && <StepSetup survey={survey} update={update} />}
            {step === 4 && <StepSupplies survey={survey} update={update} />}
            {step === 5 && <StepTasks wantTasks={wantTasks} setWantTasks={setWantTasks} />}
            {step === 6 && <StepReview survey={survey} taskMode={taskMode} />}

            {genError && (
              <div style={{
                marginTop: 16, padding: "10px 14px", borderRadius: 10,
                background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)",
                fontFamily: MONO, fontSize: 12, color: "var(--c-danger-soft)",
              }}>
                {genError}
              </div>
            )}
          </>
        )}
      </div>

      {/* Navigation */}
      {!generating && (
        <div style={{
          padding: "16px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--c-border-soft)",
          display: "flex", gap: 12,
          background: "rgba(0,0,0,0.3)",
          flexShrink: 0,
        }}>
          {step === 0 && onCancel && (
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              style={{
                flex: 1, padding: "14px", borderRadius: 12,
                background: "var(--c-border-faint)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12,
                letterSpacing: 1, cursor: "pointer",
              }}>
              Cancel
            </button>
          )}
          {step > 0 && (
            <button
              type="button"
              onClick={() => setStep(s => s - 1)}
              style={{
                flex: 1, padding: "14px", borderRadius: 12,
                background: "var(--c-border-faint)",
                border: "1px solid var(--c-border-strong)",
                color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12,
                letterSpacing: 1, cursor: "pointer",
              }}>
              Back
            </button>
          )}
          <button
            type="button"
            disabled={!canAdvance()}
            onClick={() => isLast ? generate() : setStep(s => s + 1)}
            style={{
              flex: 2, padding: "14px", borderRadius: 12,
              background: canAdvance()
                ? (isLast ? "rgba(34,197,94,0.25)" : "rgba(34,197,94,0.18)")
                : "rgba(255,255,255,0.05)",
              border: canAdvance()
                ? (isLast ? "1.5px solid rgba(34,197,94,0.6)" : "1.5px solid rgba(34,197,94,0.4)")
                : "1px solid var(--c-surface-2)",
              color: canAdvance() ? "var(--c-accent)" : "var(--c-text-ghost)",
              fontFamily: MONO, fontSize: 13, letterSpacing: 1,
              cursor: canAdvance() ? "pointer" : "default",
              fontWeight: isLast ? 800 : 400,
            }}>
            {isLast ? (taskMode === "manual" ? "Create My Calendar" : "Build My Calendar") : "Next"}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmCancel}
        title="Discard this new grow?"
        message="You will lose everything entered so far: strains, timeline, and setup. This cannot be undone."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        tone="destructive"
        onConfirm={() => { setConfirmCancel(false); onCancel?.(); }}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
