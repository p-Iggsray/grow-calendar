import { useState } from "react";
import { Download, Check } from "lucide-react";
import ConfirmModal from "./ConfirmModal.jsx";
import { api } from "../lib/api.js";
import { formatBytes } from "../lib/archive.js";
import { downloadRundown } from "../lib/rundown.js";
import { MONO } from "./SetupWizard/styleHelpers.jsx";

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
  // Each of those spaces, mapped to the token its rundown was issued with.
  // The server will not drop one without it, and neither will this dialog.
  const [rundowns, setRundowns] = useState({});
  const [savingId, setSavingId] = useState(null);
  const [failed, setFailed] = useState(null);
  const name = growName?.trim() || "this environment";

  async function saveRundownFor(space) {
    if (savingId) return;
    setSavingId(space.id);
    setFailed(null);
    try {
      const at = await downloadRundown(space.id, { name: space.displayName });
      setRundowns((prev) => ({ ...prev, [space.id]: at }));
    } catch (e) {
      setFailed(e?.message || `Could not build the rundown for ${space.displayName || "that space"}. Nothing was deleted.`);
    } finally { setSavingId(null); }
  }

  async function archive(agreedToEvict) {
    if (busy) return;
    setBusy(true);
    setFailed(null);
    try {
      const res = await api.archiveGrow(growId, {
        evict: agreedToEvict,
        ...(agreedToEvict ? { rundowns } : {}),
      });
      await onArchived?.(growId, res);
    } catch (e) {
      const body = e?.body;
      if (body?.code === "archive_full" && Array.isArray(body.evict) && !agreedToEvict) {
        setEvict(body.evict);
      } else if (body?.code === "rundown_required") {
        // A token went stale while the dialog sat open. Drop the ones the
        // server rejected so they have to be saved again.
        const stale = new Set((body.needRundown ?? []).map((g) => g.growId));
        setRundowns((prev) => Object.fromEntries(
          Object.entries(prev).filter(([id]) => !stale.has(id)),
        ));
        setFailed("Those rundowns are no longer current. Save them again and try once more.");
      } else {
        setFailed(e?.message || "Could not archive this environment.");
      }
      setBusy(false);
    }
  }

  const dropping = evict ?? [];
  const allSaved = dropping.every((g) => rundowns[g.id]);

  return (
    <>
      <ConfirmModal
        open={!evict && !failed}
        title={`Archive "${name}"?`}
        message={`It keeps everything - the calendar, the journal, every plant's history and every photo - and comes off the environments list and the calendar switcher. You can bring it back at any time from Archived.`}
        confirmLabel={busy ? "Archiving…" : "Archive"}
        cancelLabel="Cancel"
        confirmDisabled={busy}
        onConfirm={() => archive(false)}
        onCancel={onClose}
      />

      {/* Making room means deleting, so the same rule applies here as anywhere
          else: every space about to go needs its rundown saved first, one at a
          time, named, so nobody agrees to a list they did not read. */}
      <ConfirmModal
        open={Boolean(evict)}
        tone="destructive"
        title="The archive is full"
        message={
          `To make room for "${name}", ${dropping.length === 1 ? "the space archived longest ago" : `the ${dropping.length} spaces archived longest ago`} `
          + "will be deleted for good, with everything in them. Save each one's rundown first."
        }
        confirmLabel={busy ? "Working…" : allSaved ? `Delete ${dropping.length === 1 ? "it" : "them"} and archive` : "Save the rundowns first"}
        cancelLabel="Keep everything"
        confirmDisabled={!allSaved || busy || Boolean(savingId)}
        onConfirm={() => archive(true)}
        onCancel={onClose}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dropping.map((g) => {
            const saved = Boolean(rundowns[g.id]);
            const saving = savingId === g.id;
            return (
              <button
                key={g.id}
                type="button"
                className="touch-target"
                onClick={() => saveRundownFor(g)}
                disabled={Boolean(savingId)}
                style={{
                  display: "flex", alignItems: "center", gap: 9, width: "100%",
                  padding: "11px 13px", borderRadius: 10, textAlign: "left",
                  background: saved ? "rgba(var(--c-accent-rgb), 0.12)" : "var(--c-surface-1)",
                  border: `1px solid ${saved ? "rgba(var(--c-accent-rgb), 0.4)" : "var(--c-border-strong)"}`,
                  color: saved ? "var(--c-accent)" : "var(--c-text-dim)",
                  fontFamily: MONO, fontSize: 12,
                  cursor: savingId ? "default" : "pointer", opacity: savingId && !saving ? 0.6 : 1,
                }}>
                {saved ? <Check size={14} strokeWidth={2.2} /> : <Download size={14} strokeWidth={1.9} />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {g.displayName?.trim() || "Unnamed environment"}
                  </span>
                  <span style={{ display: "block", fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 2 }}>
                    {saving ? "Building the rundown…" : saved ? "Rundown saved" : `${formatBytes(g.bytes)} · save its rundown`}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {failed && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-danger-soft)", marginTop: 9 }}>{failed}</div>
        )}
      </ConfirmModal>

      <ConfirmModal
        open={Boolean(failed) && !evict}
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
