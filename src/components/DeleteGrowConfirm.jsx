import { useState } from "react";
import { Download, Check } from "lucide-react";
import ConfirmModal from "./ConfirmModal.jsx";
import { api } from "../lib/api.js";
import { downloadRundown } from "../lib/rundown.js";
import { clearWizardDraft } from "../lib/wizardDraft.js";
import { MONO } from "./SetupWizard/styleHelpers.jsx";

// Deleting a grow space for good, which is only allowed once its rundown is
// saved.
//
// Archiving is the ordinary way to be finished with a space and it keeps
// everything. This is the other one: the space and every row keyed to it leave
// the database and do not come back. So the file comes first, and not as
// advice: the button below fetches the rundown, and only the token that comes
// back with it will get a delete past the server. Closing this and reopening it
// means fetching it again.

function actionButton({ done, busy }) {
  const on = done ? "var(--c-accent)" : "var(--c-text-dim)";
  return {
    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    width: "100%", padding: "12px 14px", borderRadius: 10,
    background: done ? "rgba(var(--c-accent-rgb), 0.12)" : "var(--c-surface-1)",
    border: `1px solid ${done ? "rgba(var(--c-accent-rgb), 0.4)" : "var(--c-border-strong)"}`,
    color: on, fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
    cursor: busy ? "default" : "pointer", opacity: busy ? 0.6 : 1,
  };
}

export default function DeleteGrowConfirm({ growId, growName, survey, onClose, onDeleted }) {
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  // The token the rundown was issued with. Until this exists there is nothing
  // to delete with, and the server would refuse anyway.
  const [rundownAt, setRundownAt] = useState(null);
  const [step, setStep] = useState(1);
  const [error, setError] = useState(null);
  const name = growName?.trim() || "this environment";

  async function saveRundown() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      setRundownAt(await downloadRundown(growId, { name: growName, survey }));
    } catch (e) {
      setError(e?.message || "Could not build the rundown. Nothing was deleted.");
    } finally { setSaving(false); }
  }

  async function doDelete() {
    if (busy || !rundownAt) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteGrow(growId, rundownAt);
      clearWizardDraft(growId);
      await onDeleted?.(growId);
    } catch (e) {
      // The commonest failure is a token that has gone stale while the modal
      // sat open. Send them back to the download rather than to a dead end.
      if (e?.body?.code === "rundown_required") {
        setRundownAt(null);
        setStep(1);
        setError("That rundown is no longer current. Save a fresh one and try again.");
      } else {
        setError(e?.message || "Could not delete this environment.");
      }
      setBusy(false);
    }
  }

  return (
    <>
      <ConfirmModal
        open={step === 1}
        tone="destructive"
        title={`Delete "${name}" for good?`}
        message={"This is not the archive. The space and everything in it leave the app and do not come back. Save its rundown first: every day logged, every plant's history, the stage changes, the readings, the photographs and the drying log, as one file you keep."}
        confirmLabel={rundownAt ? "Continue" : "Save the rundown first"}
        cancelLabel="Cancel"
        confirmDisabled={!rundownAt}
        onConfirm={() => setStep(2)}
        onCancel={onClose}
      >
        <button type="button" className="touch-target" onClick={saveRundown} disabled={saving} style={actionButton({ done: Boolean(rundownAt), busy: saving })}>
          {rundownAt ? <Check size={14} strokeWidth={2.2} /> : <Download size={14} strokeWidth={1.9} />}
          {saving ? "Building the rundown…" : rundownAt ? "Rundown saved" : "Save the rundown"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 10.5, lineHeight: 1.7, color: "var(--c-text-ghost)", marginTop: 9 }}>
          {rundownAt
            ? "Check it landed in your files before you carry on. Photographs are in it at thumbnail size; the full-resolution originals are not, and they go with the space."
            : "Deleting stays locked until this file has been built and handed to you."}
        </div>
        {error && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-danger-soft)", marginTop: 9 }}>{error}</div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={step === 2}
        tone="destructive"
        title="Last chance"
        message={`"${name}" and every row it ever wrote will be gone from the app. You have the rundown; this is everything the rundown does not hold.`}
        confirmLabel={busy ? "Deleting…" : "Delete forever"}
        cancelLabel="Keep it"
        confirmDisabled={busy}
        onConfirm={doDelete}
        onCancel={onClose}
      />
    </>
  );
}
