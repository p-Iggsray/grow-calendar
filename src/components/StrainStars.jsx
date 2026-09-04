import { Star } from "lucide-react";
import { tapHaptic } from "../lib/haptics.js";
import { MAX_RATING } from "../lib/strainLibrary.js";

// Five stars. Read-only and small in a list, tappable and big on a strain's
// own page. Tapping the star a strain already sits on clears the rating, so
// there is a way back out of a score you regret without a separate control.
export default function StrainStars({ value = 0, onChange, size = 15, label }) {
  const interactive = typeof onChange === "function";

  const stars = Array.from({ length: MAX_RATING }, (_, i) => {
    const n = i + 1;
    const on = n <= value;
    const star = (
      <Star
        size={size}
        strokeWidth={on ? 1.6 : 1.8}
        fill={on ? "var(--c-harvest)" : "none"}
        style={{ color: on ? "var(--c-harvest)" : "var(--c-text-ghost)", display: "block" }}
      />
    );
    if (!interactive) return <span key={n} aria-hidden="true">{star}</span>;
    // The button is a full 44px in its own right rather than borrowing the
    // shared touch-target padding: five of those expanded hit areas in a row
    // would overlap their neighbours, and a tap near the edge of one star
    // would score the next one along.
    return (
      <button
        key={n}
        type="button"
        onClick={() => { tapHaptic(); onChange(value === n ? 0 : n); }}
        aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
        aria-pressed={on}
        style={{
          width: 44, height: 44, flexShrink: 0, padding: 0,
          background: "none", border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
        {star}
      </button>
    );
  });

  return (
    <div
      role={interactive ? "group" : "img"}
      aria-label={label ?? (value ? `${value} out of ${MAX_RATING} stars` : "Not rated")}
      style={{ display: "flex", alignItems: "center", gap: interactive ? 0 : 2.5, marginLeft: interactive ? -10 : 0 }}>
      {stars}
    </div>
  );
}
