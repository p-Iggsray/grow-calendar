import { daysBetween, fmt } from "../lib/dates.js";
import { phaseFamily } from "../lib/growData.js";

// The home hero. Shows the grower's own grow (name, phase, season progress) - // not the app's name - like a real mobile app. The season range is computed
// from the grow's config, and the current phase drives the accent color.
export default function Header({ growName, todayPhase, todayStyle, nextMs, daysToNext, location, strains, config, today }) {
  const seasonStart = config?.germinate ?? config?.start;
  const seasonEnd = config?.hazeHarvest;
  const totalDays = seasonStart && seasonEnd ? daysBetween(seasonEnd, seasonStart) + 1 : null;
  const rawDay = seasonStart && today ? daysBetween(today, seasonStart) + 1 : null;
  const dayNum = rawDay != null && totalDays != null ? Math.max(1, Math.min(totalDays, rawDay)) : null;
  const pct = dayNum != null && totalDays ? Math.round(((dayNum - 1) / (totalDays - 1 || 1)) * 100) : 0;

  const fam = todayPhase ? phaseFamily(todayPhase) : null;
  const accent = fam?.color || "#4ade80";
  const phaseLabel = todayStyle?.label ?? "Off season";

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      background: "var(--c-header-bg)",
      borderRadius: "0 0 var(--radius-xl) var(--radius-xl)",
      boxShadow: "var(--shadow-card)",
      paddingTop: "calc(18px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(16px + env(safe-area-inset-right, 0px))",
      paddingBottom: 16,
      paddingLeft: "calc(16px + env(safe-area-inset-left, 0px))",
    }}>
      {/* Soft phase-colored glow in the corner gives the hero depth. */}
      <div aria-hidden="true" style={{
        position: "absolute", top: -90, right: -70, width: 240, height: 240,
        borderRadius: "50%", pointerEvents: "none",
        background: `radial-gradient(circle, ${accent}2e, transparent 68%)`,
      }} />

      {/* Identity */}
      <div style={{ position: "relative" }}>
        <div style={{
          fontSize: 11, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
          color: "var(--c-text-faint)", marginBottom: 3,
        }}>
          Grow Log{location ? ` · ${location}` : ""}
        </div>
        <div style={{
          fontSize: 27, fontWeight: 800, letterSpacing: -0.7, lineHeight: 1.12,
          color: "var(--c-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {growName || "The Grow Calendar"}
        </div>
        {strains && (
          <div style={{
            fontSize: 13, color: "var(--c-text-muted)", marginTop: 3,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {strains}
          </div>
        )}
      </div>

      {/* Season progress module */}
      <div style={{
        position: "relative", marginTop: 14,
        background: "var(--c-surface-1)",
        border: "1px solid var(--c-border-faint)",
        borderRadius: 14, padding: "11px 13px 12px",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: todayStyle ? accent : "var(--c-text-ghost)",
              boxShadow: todayStyle ? `0 0 6px ${accent}88` : "none",
            }} />
            <span style={{
              fontSize: 13.5, fontWeight: 650, color: "var(--c-text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {phaseLabel}
            </span>
          </span>
          {dayNum != null && (
            <span style={{ fontSize: 12, color: "var(--c-text-dim)", flexShrink: 0 }}>
              Day <span style={{ fontFamily: "var(--font-num)", fontWeight: 700, color: "var(--c-text)" }}>{dayNum}</span>
              <span style={{ color: "var(--c-text-faint)" }}> of {totalDays}</span>
            </span>
          )}
        </div>

        <div style={{ height: 6, borderRadius: 3, background: "var(--c-surface-2)", overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg, ${accent}99, ${accent})`,
            transition: "width 1s ease",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 7 }}>
          <span style={{ fontSize: 10.5, fontFamily: "var(--font-num)", color: "var(--c-text-faint)" }}>
            {seasonStart ? fmt(seasonStart) : ""}
          </span>
          <span style={{ fontSize: 10.5, fontFamily: "var(--font-num)", fontWeight: 600, color: accent }}>
            {pct}%
          </span>
          <span style={{ fontSize: 10.5, fontFamily: "var(--font-num)", color: "var(--c-text-faint)" }}>
            {seasonEnd ? fmt(seasonEnd) : ""}
          </span>
        </div>
      </div>

      {/* Next milestone - one clean pill, no wrapping chip soup. */}
      {nextMs && (
        <div style={{ position: "relative", marginTop: 10, display: "flex" }}>
          {nextMs.done ? (
            <span style={pill("rgba(34,197,94,0.12)", "rgba(34,197,94,0.32)")}>
              <span aria-hidden="true">{nextMs.icon}</span>
              <span style={{ color: "var(--c-accent)", fontWeight: 600 }}>{nextMs.label}</span>
            </span>
          ) : daysToNext === 0 ? (
            <span style={pill("rgba(250,204,21,0.12)", "rgba(250,204,21,0.35)")}>
              <span aria-hidden="true">{nextMs.icon}</span>
              <span style={{ color: "var(--c-warn)", fontWeight: 600 }}>{nextMs.label} is today</span>
            </span>
          ) : (
            <span style={pill("var(--c-surface-1)", "var(--c-border-faint)")}>
              <span aria-hidden="true">{nextMs.icon}</span>
              <span style={{ color: "var(--c-text-dim)" }}>
                Next: {nextMs.label}
                <span style={{ color: "var(--c-text-faint)" }}> · </span>
                <span style={{ fontFamily: "var(--font-num)", fontWeight: 700, color: "var(--c-text)" }}>{daysToNext}d</span>
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function pill(bg, border) {
  return {
    display: "inline-flex", alignItems: "center", gap: 7,
    background: bg, border: `1px solid ${border}`,
    borderRadius: 999, padding: "7px 13px",
    fontSize: 12.5,
  };
}
