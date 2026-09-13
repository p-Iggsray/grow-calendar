import { useState, useEffect } from "react";
import { Check, Archive, ArchiveRestore, Trash2, FileText } from "lucide-react";
import { api } from "../lib/api.js";
import { Label, Input, RadioGroup, MONO } from "./SetupWizard/styleHelpers.jsx";
import { downloadRundown } from "../lib/rundown.js";
import ArchiveGrowConfirm from "./ArchiveGrowConfirm.jsx";
import DeleteGrowConfirm from "./DeleteGrowConfirm.jsx";
import ScreenHeader from "./ScreenHeader.jsx";
import { Skeleton } from "./Skeleton.jsx";

// How the grow itself is going. Archiving is a separate thing entirely: it is
// about whether the space is in your way, not about how the plants did, and a
// space comes out of the archive at whatever status it went in at.
const STATUS_OPTIONS = [
  { value: "active",    label: "Active" },
  { value: "harvested", label: "Harvested" },
  { value: "abandoned", label: "Stopped" },
];

// Edits any environment by id (fetches its own data so it works for the active
// one or any other from the list). There are no dates here on purpose: the
// timeline is written by moving plants between stages as it happens, not
// planned in advance. onSaved reloads the plan so the change shows immediately;
// onDeleted runs after the environment is deleted.
export default function GrowSettings({ growId, onClose, onSaved, onArchived, onDeleted }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName]     = useState("");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [archivedAt, setArchivedAt] = useState(null);
  const [showArchive, setShowArchive] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [survey, setSurvey] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [rundownBusy, setRundownBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api.getGrow(growId)
      .then(data => {
        if (cancelled) return;
        setName(data.displayName || "");
        setStatus(data.status || "active");
        setArchivedAt(data.archivedAt || null);
        setSurvey(data.survey || null);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setLoadError(e?.message || "Could not load this environment.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [growId]);

  async function handleSave() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await api.patchGrow(growId, { displayName: name.trim() || "Untitled Environment", status });
      await onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save. Try again.");
      setSaving(false);
    }
  }

  async function handleRundown() {
    if (rundownBusy) return;
    setRundownBusy(true);
    setError(null);
    try {
      await downloadRundown(growId, { name, survey });
    } catch (e) {
      setError(e?.message || "Could not build the rundown.");
    } finally { setRundownBusy(false); }
  }

  async function handleRestore() {
    if (restoring) return;
    setRestoring(true);
    setError(null);
    try {
      await api.unarchiveGrow(growId);
      setArchivedAt(null);
      await onSaved?.();
    } catch (e) {
      setError(e?.message || "Could not restore this environment.");
    } finally { setRestoring(false); }
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <ScreenHeader
        eyebrow="Environment"
        title="Settings"
        onBack={onClose}
        backLabel="Back"
        right={(
          <button
            type="button"
            className="touch-target"
            onClick={handleSave}
            disabled={saving || loading || Boolean(loadError)}
            style={{
              display: "flex", alignItems: "center", gap: 5, flexShrink: 0,
              padding: "9px 16px", borderRadius: 20,
              background: "rgba(var(--c-accent-rgb), 0.12)", border: "1px solid rgba(var(--c-accent-rgb), 0.4)",
              color: (saving || loading) ? "var(--c-text-ghost)" : "var(--c-accent)",
              fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
              cursor: (saving || loading) ? "default" : "pointer", opacity: (saving || loading) ? 0.6 : 1,
            }}
          >
            <Check size={14} strokeWidth={2} />
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      />

      <div style={{
        paddingTop: 16,
        paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
        paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
      }}>

      {loading && (
        <div role="status" aria-busy="true" aria-label="Loading environment settings" style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width={90} height={11} />
            <Skeleton width="100%" height={44} radius={10} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width={70} height={11} />
            <Skeleton width="100%" height={44} radius={10} />
          </div>
        </div>
      )}

      {loadError && !loading && (
        <div style={{
          fontFamily: MONO, fontSize: 12, color: "var(--c-danger-soft)",
          background: "rgba(160,50,50,0.1)", border: "1px solid rgba(160,50,50,0.3)",
          borderRadius: 10, padding: "10px 12px",
        }}>
          {loadError}
        </div>
      )}

      {!loading && !loadError && (
      <>
      {/* Name + status. That is the whole of it. */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
        <div>
          {/* A space's name is the grower's own label - always typed, never
              picked from a list. */}
          <Label>Environment name</Label>
          <Input value={name} onChange={setName} placeholder="e.g. Flower Tent, Backyard" />
        </div>
        <div>
          <Label>Status</Label>
          <RadioGroup value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </div>

      <div style={{
        fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.7,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        borderRadius: 10, padding: "12px 14px", marginBottom: 22,
      }}>
        There are no dates to set here. The calendar fills itself in from what
        you record: move a plant to its next stage on the day it happens and
        that day colours in.
      </div>

      {error && (
        <div style={{
          fontFamily: MONO, fontSize: 12, color: "var(--c-danger-soft)",
          background: "rgba(160,50,50,0.1)", border: "1px solid rgba(160,50,50,0.3)",
          borderRadius: 10, padding: "10px 12px", marginTop: 4,
        }}>
          {error}
        </div>
      )}

      {/* The record, as a file. Available at any time and to any space,
          archived ones included: saving what a space did is not a step on the
          way to losing it. */}
      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid var(--c-border-faint)" }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-ghost)", marginBottom: 12,
        }}>
          Its record
        </div>
        <button
          type="button"
          className="touch-target"
          disabled={rundownBusy}
          onClick={handleRundown}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 16px", borderRadius: 12,
            background: "rgba(var(--c-accent-rgb), 0.1)", border: "1px solid rgba(var(--c-accent-rgb), 0.3)",
            color: "var(--c-accent)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
            cursor: rundownBusy ? "default" : "pointer", opacity: rundownBusy ? 0.6 : 1,
          }}
        >
          <FileText size={14} strokeWidth={1.8} />
          {rundownBusy ? "Building the rundown…" : "Save the rundown"}
        </button>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-text-ghost)", lineHeight: 1.7, marginTop: 8 }}>
          Every day logged, every plant&rsquo;s history, the stage changes, the
          readings, the photographs and the drying log, as one printable file.
        </div>
      </div>

      {/* Retiring a space. Archiving keeps every row the space ever wrote, and
          restoring puts it back untouched. Deleting does not, which is why it
          insists on the file above first. */}
      <div style={{ marginTop: 26, paddingTop: 18, borderTop: "1px solid var(--c-border-faint)" }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-ghost)", marginBottom: 12,
        }}>
          {archivedAt ? "Archived" : "Finished with this space?"}
        </div>
        <div style={{
          fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.7,
          marginBottom: 12,
        }}>
          {archivedAt
            ? "This space is in the archive. Everything it recorded was kept, and restoring brings it back exactly as it was."
            : "Archiving takes a space off the list and the calendar switcher and keeps everything in it: the calendar, the journal, every plant's history and every photo. Nothing here deletes."}
        </div>
        <button
          type="button"
          className="touch-target"
          disabled={restoring}
          onClick={() => (archivedAt ? handleRestore() : setShowArchive(true))}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 16px", borderRadius: 12,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
            cursor: restoring ? "default" : "pointer", opacity: restoring ? 0.6 : 1,
          }}
        >
          {archivedAt
            ? <><ArchiveRestore size={14} strokeWidth={1.8} />{restoring ? "Restoring…" : "Restore from the archive"}</>
            : <><Archive size={14} strokeWidth={1.8} />Archive this environment</>}
        </button>

        {/* The other way out, and the final one. It saves the space's rundown
            before it will go through, so what is lost is the app's copy and
            not the record. */}
        <button
          type="button"
          className="touch-target"
          onClick={() => setShowDelete(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 16px", borderRadius: 12, marginTop: 10,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)",
            color: "var(--c-danger-soft)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
            cursor: "pointer",
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          Delete this environment
        </button>
        <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-text-ghost)", lineHeight: 1.7, marginTop: 8 }}>
          Deleting saves this space&rsquo;s rundown first: every day logged, every
          plant&rsquo;s history, the stage changes, the readings and the photographs,
          as one file you keep. Then the space leaves the app for good.
        </div>
      </div>
      </>
      )}

      </div>

      {showArchive && (
        <ArchiveGrowConfirm
          growId={growId}
          growName={name}
          onClose={() => setShowArchive(false)}
          onArchived={onArchived}
        />
      )}

      {showDelete && (
        <DeleteGrowConfirm
          growId={growId}
          growName={name}
          survey={survey}
          onClose={() => setShowDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
