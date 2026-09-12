import { useState } from "react";
import ConfirmModal from "./ConfirmModal.jsx";
import { api } from "../lib/api.js";
import { formatBytes } from "../lib/archive.js";

// Putting a grow space away, and the one case where something is lost.
//
// Archiving keeps everything: the calendar, the journal, the day log, every
// plant's history and every photo. So the first confirm is a mild one, and it
// says what archiving means rather than warning about it.
//
// The archive has a ceiling, though, and when it is reached the spaces archived
// longest ago have to go. The server never does that on its own: it answers the
// first call with exactly which spaces would be dropped, and this is where they
// are named, one by one, before anything happens.
export default function ArchiveGrowConfirm({ growId, growName, onClose, onArchived }) {
  const [busy, setBusy] = useState(false);
  // The spaces the server says would have to go. Null until it says so.
  const [evict, setEvict] = useState(null);
  const [failed, setFailed] = useState(null);
  const name = growName?.trim() || "this environment";

  async function archive(agreedToEvict) {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await api.archiveGrow(growId, { evict: agreedToEvict });
      await onArchived?.(growId, res);
    } catch (e) {
      const body = e?.body;
      if (body?.code === "archive_full" && Array.isArray(body.evict) && !agreedToEvict) {
        setEvict(body.evict);
      } else {
        setFailed(e?.message || "Could not archive this environment.");
      }
      setBusy(false);
    }
  }

  const dropping = evict ?? [];
  const dropList = dropping
    .map((g) => `${g.displayName?.trim() || "Unnamed environment"} (${formatBytes(g.bytes)})`)
    .join(", ");

  return (
    <>
      <ConfirmModal
        open={!evict && !failed}
        title={`Archive "${name}"?`}
        message={`It keeps everything - the calendar, the journal, every plant's history and every photo - and comes off the environments list and the calendar switcher. You can bring it back at any time from Archived.`}
        confirmLabel={busy ? "Archiving…" : "Archive"}
        cancelLabel="Cancel"
        onConfirm={() => archive(false)}
        onCancel={onClose}
      />

      {/* The only delete in the app, and it is spelled out. */}
      <ConfirmModal
        open={Boolean(evict)}
        tone="destructive"
        title="The archive is full"
        message={
          `To make room for "${name}", ${dropping.length === 1 ? "the space archived longest ago" : `the ${dropping.length} spaces archived longest ago`} `
          + `will be deleted for good, with everything in them: ${dropList}. This cannot be undone.`
        }
        confirmLabel={busy ? "Working…" : `Delete ${dropping.length === 1 ? "it" : "them"} and archive`}
        cancelLabel="Keep everything"
        onConfirm={() => archive(true)}
        onCancel={onClose}
      />

      <ConfirmModal
        open={Boolean(failed)}
        title="Could not archive"
        message={failed || ""}
        confirmLabel={busy ? "Trying…" : "Try again"}
        cancelLabel="Close"
        onConfirm={() => archive(false)}
        onCancel={onClose}
      />
    </>
  );
}
