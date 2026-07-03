import { CalendarDays, BookOpen } from "lucide-react";
import { daysBetween, fmt } from "../lib/dates.js";
import { phaseFamily } from "../lib/growData.js";
import { tapHaptic } from "../lib/haptics.js";

// The home hero. Shows the grower's own grow (name, phase, season progress) - // not the app's name - like a real mobile app. The season range is computed
// from the grow's config, and the current phase drives the accent color.
// Ends in the Calendar/Journal section tabs so the page reads as one unit.
const ENV_LABEL = { indoor: "Indoor", outdoor: "Outdoor", greenhouse: "Greenhouse" };

const VIEWS = [
  { id: "calendar", label: "Calendar", Icon: CalendarDays },
  { id: "journal",  label: "Journal",  Icon: BookOpen },
];

export default function Header({
  growName, environment, todayPhase, todayStyle, nextMs, daysToNext,
  location, strains, config, today, view, onChangeView, onPickMilestone,
}) {
  const envLabel = ENV_LABEL[environment] ?? null;
  const seasonStart = config?.germinate ?? config?.start;
  const seasonEnd = config?.hazeHarvest;
  const totalDays = seasonStart && seasonEnd ? daysBetween(seasonEnd, seasonStart) + 1 : null;
  const rawDay = seasonStart && today ? daysBetween(today, seasonStart) + 1 : null;
  const dayNum = rawDay != null && totalDays != null ? Math.max(1, Math.min(totalDays, rawDay)) : null;
  const pct = dayNum != null && totalDays ? Math.round(((dayNum - 1) / (totalDays - 1 || 1)) * 100) : 0;

  const fam = todayPhase ? phaseFamily(todayPhase) : null;
  const accent = fam?.color || "#4ade80";
  const phaseLabel = todayStyle?.label ?? "Off season";
  const msTappable = Boolean(onPickMilestone && nextMs && !nextMs.done);

  return (
    <div style={{
      position: "relative",
      overflow: "hidden",
      background: "var(--c-header-bg)",
      borderRadius: "0 0 var(--radius-xl) var(--radius-xl)",
      boxShadow: "var(--shadow-card)",
      paddingTop: "calc(14px + env(safe-area-inset-top, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 12,
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
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
          fontSize: 10.5, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
          color: "var(--c-text-faint)", marginBottom: 2,
        }}>
          Grow Log{envLabel ? ` · ${envLabel}` : ""}{location ? ` · ${location}` : ""}
        </div>
        <div style={{
          fontSize: 23, fontWeight: 800, letterSpacing: -0.6, lineHeight: 1.15,
          color: "var(--c-text)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {growName || "The Grow Calendar"}
        </div>
        {strains && (
          <div style={{
            fontSize: 12, color: "var(--c-text-muted)", marginTop: 2,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
          }}>
            {strains}
          </div>
        )}
      </div>

      {/* Season progress module - phase, day count, progress bar, and the next
          milestone all live in ONE compact card. */}
      <div style={{
        position: "relative", marginTop: 10,
        background: "var(--c-surface-1)",
        border: "1px solid var(--c-border-faint)",
        borderRadius: 13, padding: "9px 12px 10px",
        backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 7 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: todayStyle ? accent : "var(--c-text-ghost)",
              boxShadow: todayStyle ? `0 0 6px ${accent}88` : "none",
            }} />
            <span style={{
              fontSize: 13, fontWeight: 650, color: "var(--c-text)",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
              {phaseLabel}
            </span>
          </span>
          {dayNum != null && (
            <span style={{ fontSize: 11.5, color: "var(--c-text-dim)", flexShrink: 0 }}>
              Day <span style={{ fontFamily: "var(--font-num)", fontWeight: 700, color: "var(--c-text)" }}>{dayNum}</span>
              <span style={{ color: "var(--c-text-faint)" }}> of {totalDays}</span>
            </span>
          )}
        </div>

        <div style={{ height: 5, borderRadius: 3, background: "var(--c-surface-2)", overflow: "hidden" }}>
          <div style={{
            width: `${pct}%`, height: "100%", borderRadius: 3,
            background: `linear-gradient(90deg, ${accent}99, ${accent})`,
            transition: "width 1s ease",
          }} />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6, gap: 8 }}>
          <span style={{ fontSize: 10, fontFamily: "var(--font-num)", color: "var(--c-text-faint)", flexShrink: 0 }}>
            {seasonStart ? fmt(seasonStart) : ""}
          </span>
          {/* Next milestone, tappable to jump to that day on the calendar. */}
          {nextMs ? (
            <button
              type="button"
              onClick={msTappable ? () => { tapHaptic(); onPickMilestone(); } : undefined}
              disabled={!msTappable}
              style={{
                display: "inline-flex", alignItems: "center", gap: 5, minWidth: 0,
                background: "none", border: "none", padding: "2px 4px",
                cursor: msTappable ? "pointer" : "default",
                fontSize: 11.5, fontFamily: "var(--font-ui)",
              }}>
              <span aria-hidden="true" style={{ fontSize: 12 }}>{nextMs.icon}</span>
              <span style={{
                color: nextMs.done ? "var(--c-accent)" : daysToNext === 0 ? "var(--c-warn)" : "var(--c-text-dim)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                fontWeight: nextMs.done || daysToNext === 0 ? 650 : 500,
              }}>
                {nextMs.done ? nextMs.label
                  : daysToNext === 0 ? `${nextMs.label} is today`
                  : <>Next: {nextMs.label} <span style={{ fontFamily: "var(--font-num)", fontWeight: 700, color: "var(--c-text)" }}>{daysToNext}d</span></>}
              </span>
            </button>
          ) : (
            <span style={{ fontSize: 10, fontFamily: "var(--font-num)", fontWeight: 600, color: accent }}>{pct}%</span>
          )}
          <span style={{ fontSize: 10, fontFamily: "var(--font-num)", color: "var(--c-text-faint)", flexShrink: 0 }}>
            {seasonEnd ? fmt(seasonEnd) : ""}
          </span>
        </div>
      </div>

      {/* Section tabs: Calendar | Journal */}
      {onChangeView && (
        <div style={{
          position: "relative", marginTop: 10,
          display: "flex", gap: 4, padding: 4, borderRadius: 13,
          background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
        }}>
          {VIEWS.map(({ id, label, Icon }) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => { if (!active) { tapHaptic(); onChangeView(id); } }}
                aria-pressed={active}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 10, cursor: "pointer",
                  background: active ? "var(--c-surface-2)" : "none",
                  border: active ? "1px solid var(--c-border)" : "1px solid transparent",
                  color: active ? "var(--c-text)" : "var(--c-text-muted)",
                  fontFamily: "var(--font-ui)", fontSize: 12.5, fontWeight: active ? 700 : 500,
                  letterSpacing: 0.3,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                  transition: "background 0.15s, color 0.15s",
                }}>
                <Icon size={14} strokeWidth={2} />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
