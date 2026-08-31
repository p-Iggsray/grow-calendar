import { useState, useEffect } from "react";
import { Check, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { Label, Input, RadioGroup, MONO } from "./SetupWizard/styleHelpers.jsx";
import DeleteGrowConfirm from "./DeleteGrowConfirm.jsx";
import ScreenHeader from "./ScreenHeader.jsx";
import { Skeleton } from "./Skeleton.jsx";

const STATUS_OPTIONS = [
  { value: "active",    label: "Active" },
  { value: "harvested", label: "Harvested" },
  { value: "abandoned", label: "Abandoned" },
];

// Edits any environment by id (fetches its own data so it works for the active
// one or any other from the list). There are no dates here on purpose: the
// timeline is written by moving plants between stages as it happens, not
// planned in advance. onSaved reloads the plan so the change shows immediately;
// onDeleted runs after the environment is deleted.
export default function GrowSettings({ growId, onClose, onSaved, onDeleted }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName]     = useState("");
  const [status, setStatus] = useState("active");
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState(null);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    api.getGrow(growId)
      .then(data => {
        if (cancelled) return;
        setName(data.displayName || "");
        setStatus(data.status || "active");
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
              background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.4)",
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

      {/* Danger zone */}
      <div style={{ marginTop: 30, paddingTop: 18, borderTop: "1px solid var(--c-border-faint)" }}>
        <div style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-ghost)", marginBottom: 12,
        }}>
          Danger zone
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={() => setShowDelete(true)}
          style={{
            display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
            width: "100%", padding: "13px 16px", borderRadius: 12,
            background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.35)",
            color: "var(--c-danger-soft)", fontFamily: MONO, fontSize: 12, letterSpacing: 0.5,
            cursor: "pointer",
          }}
        >
          <Trash2 size={14} strokeWidth={1.8} />
          Delete this environment
        </button>
      </div>
      </>
      )}

      </div>

      {showDelete && (
        <DeleteGrowConfirm
          growId={growId}
          growName={name}
          onClose={() => setShowDelete(false)}
          onDeleted={onDeleted}
        />
      )}
    </div>
  );
}
