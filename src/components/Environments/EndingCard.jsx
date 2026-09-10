import { CheckCircle2, HeartCrack, Undo2 } from "lucide-react";
import { MONO } from "../SetupWizard/styleHelpers.jsx";
import { cropOf } from "../../lib/crops.js";
import { endingHeadline, reasonLabel } from "../../lib/growEnding.js";

// What happened to the last lot, sitting on the space it happened in.
//
// This is the whole point of recording an ending, so it reads as a record and
// not as an error state: the date, whether it finished or was taken, why, and
// what was written down at the time. A run that was stolen is not a failure of
// the app to be tidied away behind a badge.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function fmtDate(key) {
  const [y, m, d] = String(key || "").split("-").map(Number);
  if (!y || !m || !d) return key || "";
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export default function EndingCard({ ending, survey, onUndo, undoing }) {
  if (!ending) return null;
  const crop = cropOf(survey);
  const lost = ending.outcome === "lost";
  const Icon = lost ? HeartCrack : CheckCircle2;
  const tint = lost ? "var(--c-warn)" : "var(--c-accent)";
  const why = lost ? reasonLabel(ending.reason, crop) : null;

  return (
    <div
      className="card"
      style={{
        padding: 14, display: "flex", flexDirection: "column", gap: 10,
        borderColor: lost ? "rgba(247, 215, 116, 0.3)" : "rgba(var(--c-accent-rgb), 0.3)",
      }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <Icon size={15} strokeWidth={2} style={{ color: tint, flexShrink: 0 }} />
        <span style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: 2,
          textTransform: "uppercase", color: tint,
        }}>
          {lost ? "Ended short" : "Finished"}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-ghost)" }}>
          {fmtDate(ending.endedOn)}
        </span>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 13, color: "var(--c-text-dim)" }}>
        {why ? `${why} · ` : ""}{endingHeadline(ending, crop)}
      </div>

      {ending.note && (
        <div style={{
          fontFamily: MONO, fontSize: 12.5, lineHeight: 1.55,
          color: "var(--c-text-muted)", whiteSpace: "pre-wrap",
          borderLeft: "2px solid var(--c-border-strong)", paddingLeft: 10,
        }}>
          {ending.note}
        </div>
      )}

      {onUndo && (
        <button
          type="button"
          className="touch-target"
          onClick={onUndo}
          disabled={undoing}
          style={{
            alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 6,
            background: "transparent", border: "1px solid var(--c-border)", borderRadius: 9,
            padding: "7px 12px", fontFamily: MONO, fontSize: 11,
            color: "var(--c-text-muted)", cursor: undoing ? "default" : "pointer",
          }}>
          <Undo2 size={12} strokeWidth={2} />
          {undoing ? "Undoing…" : "That was a mistake, undo it"}
        </button>
      )}
    </div>
  );
}
