// Per-device autosave for the new-grow setup wizard. Every answer, the current
// step, and the task-mode choice are written to localStorage as the user types,
// keyed by grow id, so backing out (or the app closing) never loses progress.
// Resuming that grow's setup restores the draft exactly where it left off.

const keyFor = (growId) => `wizardDraft:${growId || "new"}`;

// Pure: validate/clamp a parsed draft so a stale or hand-mangled blob can never
// crash the wizard. Returns null when there is nothing usable to restore.
export function sanitizeWizardDraft(raw, stepCount) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const survey = raw.survey && typeof raw.survey === "object" && !Array.isArray(raw.survey)
    ? raw.survey
    : null;
  if (!survey) return null;
  const step = Number(raw.step);
  const maxStep = Math.max(0, (stepCount || 1) - 1);
  return {
    survey,
    step: Number.isInteger(step) ? Math.min(Math.max(step, 0), maxStep) : 0,
    wantTasks: typeof raw.wantTasks === "boolean" ? raw.wantTasks : null,
  };
}

export function loadWizardDraft(growId, stepCount) {
  try {
    const raw = localStorage.getItem(keyFor(growId));
    return raw ? sanitizeWizardDraft(JSON.parse(raw), stepCount) : null;
  } catch {
    return null;
  }
}

export function saveWizardDraft(growId, draft) {
  try {
    localStorage.setItem(keyFor(growId), JSON.stringify(draft));
  } catch { /* storage unavailable: wizard still works, just without autosave */ }
}

export function clearWizardDraft(growId) {
  try {
    localStorage.removeItem(keyFor(growId));
  } catch { /* storage unavailable */ }
}
