import { useState, useEffect } from "react";
import { X, Check, Trash2 } from "lucide-react";
import { api } from "../lib/api.js";
import { Label, Input, RadioGroup, MONO, SERIF } from "./SetupWizard/styleHelpers.jsx";
import DeleteGrowConfirm from "./DeleteGrowConfirm.jsx";
import { Skeleton } from "./Skeleton.jsx";

// Full timeline, grouped for scanning. Each row edits one config date key
// independently — nothing cascades, the grower has full manual control.
const DATE_GROUPS = [
  {
    title: "Timeline",
    fields: [
      { key: "start",        label: "Season start" },
      { key: "transplant",   label: "Transplant" },
      { key: "backyardMove", label: "Move outside", hint: "Set equal to transplant to hide the move-outside milestone." },
      { key: "preFlower",    label: "Pre-flower" },
      { key: "flowerStart",  label: "Flower start" },
    ],
  },
  {
    title: "Feeding & flushes",
    fields: [
      { key: "calMag",    label: "Cal-Mag start" },
      { key: "feedStart", label: "Feeding start" },
      { key: "fullDose",  label: "Full-dose nutrients" },
      { key: "flush1",    label: "Flush 1" },
      { key: "flush2",    label: "Flush 2" },
      { key: "flush3",    label: "Flush 3" },
    ],
  },
  {
    title: "Harvest",
    fields: [
      { key: "gdpFlush",    label: "Primary pre-harvest flush" },
      { key: "gdpHarvest",  label: "Primary harvest" },
      { key: "hazeFlush",   label: "Secondary pre-harvest flush" },
      { key: "hazeHarvest", label: "Secondary harvest" },
    ],
  },
];

const ALL_KEYS = DATE_GROUPS.flatMap(g => g.fields.map(f => f.key));

const STATUS_OPTIONS = [
  { value: "active",    label: "Active" },
  { value: "harvested", label: "Harvested" },
  { value: "abandoned", label: "Abandoned" },
];

const dateInputStyle = {
  background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
  border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
  padding: "11px 13px", fontSize: 16, fontFamily: SERIF,
  outline: "none", width: "100%", boxSizing: "border-box",
  colorScheme: "dark",
};

// Edits any grow by id (fetches its own data so it works for the active grow
// or any other from the grows list). onSaved reloads the plan so the
// calendar/milestones reflect changes immediately. onDeleted runs after the
// grow is deleted (parent should reload + close this panel).
export default function GrowSettings({ growId, onClose, onSaved, onDeleted }) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [name, setName]     = useState("");
  const [status, setStatus] = useState("active");
  const [hasConfig, setHasConfig] = useState(false);
  const [dates, setDates]   = useState({});
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
        const cfg = data.config || null;
        setHasConfig(Boolean(cfg));
        const out = {};
        for (const key of ALL_KEYS) out[key] = cfg?.[key] || "";
        setDates(out);
        setLoading(false);
      })
      .catch(e => {
        if (cancelled) return;
        setLoadError(e?.message || "Could not load this grow.");
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [growId]);

  const setDate = (key, val) => setDates(d => ({ ...d, [key]: val }));
  const missing = hasConfig ? ALL_KEYS.filter(k => !dates[k]) : [];

  async function handleSave() {
    if (saving) return;
    if (missing.length > 0) { setError("Every date needs a value before saving."); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = { displayName: name.trim() || "Untitled Grow", status };
      if (hasConfig) payload.config = { ...dates };
      await api.patchGrow(growId, payload);
      await onSaved?.();
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      paddingBottom: "calc(40px + env(safe-area-inset-bottom, 0px))",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <button
          type="button"
          className="touch-target"
          onClick={onClose}
          aria-label="Close"
          style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            width: 40, height: 40, borderRadius: 10,
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", cursor: "pointer",
          }}
        >
          <X size={18} strokeWidth={1.8} />
        </button>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
          Grow Settings
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={handleSave}
          disabled={saving || loading || Boolean(loadError)}
          style={{
            display: "flex", alignItems: "center", gap: 5,
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
      </div>

      {loading && (
        <div role="status" aria-busy="true" aria-label="Loading grow settings" style={{ display: "flex", flexDirection: "column", gap: 20, padding: "8px 0" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width={90} height={11} />
            <Skeleton width="100%" height={44} radius={10} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <Skeleton width={70} height={11} />
            <Skeleton width="100%" height={44} radius={10} />
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <Skeleton width="40%" height={13} />
              <Skeleton width={120} height={36} radius={10} />
            </div>
          ))}
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
      {/* Name + status */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 24 }}>
        <div>
          <Label>Grow name</Label>
          <Input value={name} onChange={setName} placeholder="e.g. Summer 2026 Outdoor" />
        </div>
        <div>
          <Label>Status</Label>
          <RadioGroup value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        </div>
      </div>

      {!hasConfig && (
        <div style={{
          fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", lineHeight: 1.7,
          background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
          borderRadius: 10, padding: "12px 14px", marginBottom: 22,
        }}>
          This grow isn&apos;t set up yet, so it has no timeline to edit. Finish setup to unlock the date editor.
        </div>
      )}

      {/* Date groups */}
      {hasConfig && DATE_GROUPS.map(group => (
        <div key={group.title} style={{ marginBottom: 22 }}>
          <div style={{
            fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
            color: "var(--c-text-ghost)", marginBottom: 12,
            paddingBottom: 8, borderBottom: "1px solid var(--c-border-faint)",
          }}>
            {group.title}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {group.fields.map(({ key, label, hint }) => (
              <div key={key}>
                <Label>{label}</Label>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="date"
                    value={dates[key]}
                    onChange={e => setDate(key, e.target.value)}
                    style={dateInputStyle}
                  />
                  {key === "backyardMove" && dates.transplant && dates.backyardMove !== dates.transplant && (
                    <button
                      type="button"
                      onClick={() => setDate("backyardMove", dates.transplant)}
                      style={{
                        flexShrink: 0, padding: "9px 12px", borderRadius: 10,
                        background: "rgba(255,255,255,0.05)", border: "1px solid var(--c-border-strong)",
                        color: "#8ab89a", fontFamily: MONO, fontSize: 11, letterSpacing: 0.5,
                        cursor: "pointer", whiteSpace: "nowrap",
                      }}
                    >
                      = transplant
                    </button>
                  )}
                </div>
                {hint && (
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 5, lineHeight: 1.6 }}>
                    {hint}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

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
          Delete this grow
        </button>
      </div>
      </>
      )}

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
