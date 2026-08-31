import { useEffect, useState } from "react";
import { api } from "../../lib/api.js";
import { resolveSurveyForSetup } from "../../lib/stageAnchor.js";
import { loadWizardDraft, saveWizardDraft, clearWizardDraft } from "../../lib/wizardDraft.js";
import ConfirmModal from "../ConfirmModal.jsx";
import ScreenHeader from "../ScreenHeader.jsx";
import { defaultSurvey } from "./defaultSurvey.js";
import { MONO, SERIF } from "./styleHelpers.jsx";
import { StepBasics } from "./StepBasics.jsx";
import { StepStrains } from "./StepStrains.jsx";
import { StepTimeline } from "./StepTimeline.jsx";
import { StepSetup } from "./StepSetup.jsx";
import { StepSupplies } from "./StepSupplies.jsx";
import { StepReview } from "./StepReview.jsx";
import { GeneratingScreen } from "./GeneratingScreen.jsx";

// ─── Wizard shell ────────────────────────────────────────────────────────────

const STEPS = [
  { id: "basics",   title: "Space Basics" },
  { id: "strains",  title: "Your Strains" },
  { id: "timeline", title: "Where You're At" },
  { id: "setup",    title: "Your Setup" },
  { id: "supplies", title: "Supplies" },
  { id: "review",   title: "Review & Create" },
];

export default function SetupWizard({ onComplete, onCancel, initialSurvey, growId }) {
  // Restore any autosaved draft for this grow so backing out of setup (or the
  // app closing mid-wizard) never loses progress. Draft answers win over
  // initialSurvey because they are the user's most recent input.
  const [draft] = useState(() => loadWizardDraft(growId, STEPS.length));
  const [step, setStep] = useState(draft ? draft.step : 0);
  const [survey, setSurvey] = useState(() => ({
    ...defaultSurvey(),
    ...(initialSurvey || {}),
    ...(draft?.survey || {}),
  }));
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState("");
  const [confirmExit, setConfirmExit] = useState(false);

  // Autosave every answer and the current step.
  useEffect(() => {
    if (generating) return;
    saveWizardDraft(growId, { survey, step });
  }, [growId, survey, step, generating]);

  function update(field, value) {
    setSurvey(s => ({ ...s, [field]: value }));
  }

  // Returns null when the step is complete, or a short hint explaining what is
  // still needed - shown next to the Next button instead of a dead disabled state.
  function advanceHint() {
    if (step === 1 && !survey.strains.every(s => s.name.trim().length > 0)) {
      return "Name each strain to continue";
    }
    return null;
  }
  function canAdvance() { return advanceHint() === null; }

  async function generate() {
    setGenerating(true);
    setGenError("");
    try {
      // Expand the strain list into one roster entry per plant, each tagged
      // with the stage the grower says they are in, before sending.
      const resolved = resolveSurveyForSetup(survey);
      await api.setupGrow(growId, resolved);
      clearWizardDraft(growId);
      onComplete();
    } catch (err) {
      setGenError(err.message || "Setup failed. Please try again.");
      setGenerating(false);
    }
  }

  const isLast = step === STEPS.length - 1;

  return (
    <div style={{
      minHeight: "100vh",
      fontFamily: SERIF,
      color: "var(--c-text)",
      background: "var(--c-bg)",
      display: "flex",
      flexDirection: "column",
    }}>
      {/* Same header as every other window: back steps through the wizard,
          and the right slot keeps the way out. */}
      <div style={{ flexShrink: 0 }}>
        <ScreenHeader
          eyebrow={`Step ${step + 1} of ${STEPS.length}`}
          title={STEPS[step].title}
          onBack={!generating && step > 0 ? () => setStep(s => s - 1) : undefined}
          backLabel="Previous step"
          right={onCancel && !generating ? (
            <button
              type="button"
              className="touch-target"
              onClick={() => setConfirmExit(true)}
              style={{
                flexShrink: 0, padding: "9px 13px", borderRadius: 18,
                background: "var(--c-surface-2)", border: "none",
                color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 11.5,
                letterSpacing: 0.3, cursor: "pointer",
              }}>
              Save &amp; exit
            </button>
          ) : null}
        />
        {/* Progress through the steps */}
        <div style={{ height: 3, background: "var(--c-surface-2)" }}>
          <div style={{
            height: "100%",
            background: "linear-gradient(90deg, #22c55e, var(--c-accent))",
            width: `${((step + 1) / STEPS.length) * 100}%`,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 16px" }}>
        {generating ? (
          <GeneratingScreen />
        ) : (
          <>
            {step === 0 && <StepBasics survey={survey} update={update} />}
            {step === 1 && <StepStrains survey={survey} update={update} />}
            {step === 2 && <StepTimeline survey={survey} update={update} />}
            {step === 3 && <StepSetup survey={survey} update={update} />}
            {step === 4 && <StepSupplies survey={survey} update={update} />}
            {step === 5 && <StepReview survey={survey} />}

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

      {!generating && advanceHint() && (
        <div style={{
          textAlign: "center", fontSize: 12, color: "var(--c-text-faint)",
          padding: "0 16px 6px",
        }}>
          {advanceHint()}
        </div>
      )}

      {/* Navigation */}
      {!generating && (
        <div style={{
          padding: "16px",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
          borderTop: "1px solid var(--c-border-soft)",
          display: "flex", gap: 12,
          background: "var(--c-surface-1)",
          flexShrink: 0,
        }}>
          <button
            type="button"
            disabled={!canAdvance()}
            onClick={() => isLast ? generate() : setStep(s => s + 1)}
            style={{
              flex: 1, padding: "14px", borderRadius: 12,
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
            {isLast ? "Create My Calendar" : "Next"}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmExit}
        title="Save and exit setup?"
        message="Everything you have entered is saved on this device. This environment will show as In Setup on the Spaces tab - tap it anytime to pick up right where you left off."
        confirmLabel="Save & exit"
        cancelLabel="Keep editing"
        onConfirm={() => { setConfirmExit(false); onCancel?.(); }}
        onCancel={() => setConfirmExit(false)}
      />
    </div>
  );
}
