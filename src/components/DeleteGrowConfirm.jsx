import { useState } from "react";
import ConfirmModal from "./ConfirmModal.jsx";
import { api } from "../lib/api.js";

// Two-step ("double reconfirming") destructive confirm for deleting a whole
// grow. Renders nothing but the modals; the parent mounts it when a delete is
// requested and unmounts it on close/after delete. onDeleted runs after the
// grow is gone (parent should reload + close any open settings panel).
export default function DeleteGrowConfirm({ growId, growName, onClose, onDeleted }) {
  const [step, setStep] = useState(1); // 1 = first confirm, 2 = final confirm
  const [busy, setBusy] = useState(false);
  const name = growName?.trim() || "this grow";

  async function doDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await api.deleteGrow(growId);
      await onDeleted?.(growId);
    } catch {
      setBusy(false); // leave the modal open so the user can retry
    }
  }

  return (
    <>
      <ConfirmModal
        open={step === 1}
        title={`Delete "${name}"?`}
        message="This permanently removes the entire grow - its calendar, tasks, notes, grow log, plants, and per-plant history. This cannot be undone."
        confirmLabel="Delete…"
        cancelLabel="Cancel"
        tone="destructive"
        onConfirm={() => setStep(2)}
        onCancel={onClose}
      />
      <ConfirmModal
        open={step === 2}
        title="Are you absolutely sure?"
        message={`Last chance - "${name}" and everything in it will be gone for good.`}
        confirmLabel={busy ? "Deleting…" : "Delete forever"}
        cancelLabel="Keep grow"
        tone="destructive"
        onConfirm={doDelete}
        onCancel={onClose}
      />
    </>
  );
}
