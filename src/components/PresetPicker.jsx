import { useState } from "react";
import { PRESETS, FEED_PHASES } from "../lib/feedPresets.js";
import { PHASES } from "../lib/growData.js";
import { api } from "../lib/api.js";

const MONO = "'Courier New', monospace";

export default function PresetPicker({ currentPresetId, onApplied, onCancel }) {
  const [applying, setApplying] = useState(null); // preset id being applied
  const [error, setError] = useState("");

  async function applyPreset(preset) {
    if (applying) return;
    setApplying(preset.id);
    setError("");
    try {
      await Promise.all(
        FEED_PHASES.map(phase =>
          api.savePlanPhase(phase, { tasks: preset.tasks[phase] })
        )
      );
      onApplied(preset.id);
    } catch (err) {
      setError(err.message || "Failed to apply preset. Please try again.");
      setApplying(null);
    }
  }

  return (
    <>
      {/* Scrim */}
      <div
        onClick={onCancel}
        style={{
          position: "fixed", inset: 0, zIndex: 50,
          background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
        }}
      />

      {/* Sheet */}
      <div style={{
        position: "fixed", left: 0, right: 0, bottom: 0, zIndex: 51,
        background: "var(--c-panel-bg)",
        borderTop: "1px solid var(--c-border)",
        borderRadius: "18px 18px 0 0",
        padding: "20px 18px calc(28px + env(safe-area-inset-bottom, 0px))",
        maxHeight: "82vh", overflowY: "auto",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-ghost)", textTransform: "uppercase", marginBottom: 4 }}>
          Feed Schedule
        </div>
        <div style={{ fontSize: 17, fontWeight: 800, color: "var(--c-text)", marginBottom: 4, letterSpacing: -0.3 }}>
          Choose a preset
        </div>
        <div style={{ fontSize: 12, color: "var(--c-text-faint)", fontFamily: MONO, marginBottom: 16, lineHeight: 1.6 }}>
          Overwrites tasks for {FEED_PHASES.length} feeding phases ({FEED_PHASES.map(p => PHASES[p]?.label ?? p).join(", ")}). Flush and harvest phases are untouched.
        </div>

        {error && (
          <div style={{ fontSize: 12, color: "#f87171", fontFamily: MONO, marginBottom: 12, padding: "8px 12px", background: "rgba(248,113,113,0.08)", borderRadius: 8, border: "1px solid rgba(248,113,113,0.2)" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 14 }}>
          {PRESETS.map(preset => {
            const isActive = currentPresetId === preset.id;
            const isApplying = applying === preset.id;
            return (
              <div
                key={preset.id}
                style={{
                  background: isActive ? "rgba(74,222,128,0.07)" : "var(--c-surface-1)",
                  border: `1px solid ${isActive ? "rgba(74,222,128,0.35)" : "var(--c-border)"}`,
                  borderRadius: 12, padding: "14px 16px",
                  display: "flex", gap: 14, alignItems: "flex-start",
                }}
              >
                <span style={{ fontSize: 24, lineHeight: 1, flexShrink: 0, marginTop: 2 }}>{preset.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--c-text)" }}>{preset.name}</span>
                    {isActive && (
                      <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: "var(--c-accent)", background: "rgba(74,222,128,0.12)", border: "1px solid rgba(74,222,128,0.3)", borderRadius: 5, padding: "1px 6px" }}>
                        ACTIVE
                      </span>
                    )}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 0.5, marginBottom: 6 }}>
                    {preset.brand}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--c-text-faint)", lineHeight: 1.6, marginBottom: 12 }}>
                    {preset.description}
                  </div>
                  <button
                    type="button"
                    className="touch-target"
                    onClick={() => applyPreset(preset)}
                    disabled={Boolean(applying) || isActive}
                    style={{
                      padding: "9px 16px", borderRadius: 8,
                      background: isActive
                        ? "rgba(74,222,128,0.06)"
                        : isApplying
                        ? "rgba(74,222,128,0.12)"
                        : "rgba(74,222,128,0.15)",
                      border: "1px solid rgba(74,222,128,0.35)",
                      color: isActive ? "var(--c-text-ghost)" : "var(--c-accent)",
                      fontFamily: MONO, fontSize: 11, letterSpacing: 1,
                      cursor: isActive || applying ? "default" : "pointer",
                      opacity: applying && !isApplying ? 0.5 : 1,
                      transition: "opacity 0.15s",
                    }}
                  >
                    {isApplying ? "Applying…" : isActive ? "Already applied" : "Apply to my plan"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="touch-target"
          onClick={onCancel}
          style={{
            width: "100%", padding: "13px", borderRadius: 12,
            background: "var(--c-border-faint)", border: "1px solid var(--c-border-strong)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 1, cursor: "pointer",
          }}
        >
          Cancel
        </button>
      </div>
    </>
  );
}
