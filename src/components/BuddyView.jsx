import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { useToday, MONTH_NAMES, DOW_SHORT, sameDay, fmtL } from "../lib/dates.js";
import { ymd } from "../lib/api.js";
import { STAGE_ORDER, dayOfGrow, stageGroup, stageLabel, stageOnDate } from "../lib/stageTimeline.js";
import { AppShellSkeleton } from "./LoadingScreens.jsx";

const MONO = "var(--font-ui)";
const SERIF = "var(--font-ui)";

// Single-character glyph per stage so the shared calendar is readable without
// colour (WCAG 1.4.1).
const STAGE_GLYPH = {
  germination: "G", seedling: "S", vegetative: "V", flowering: "F",
  flushing: "~", harvest: "H", drying: "D", curing: "C", done: "•",
};

function keyOf(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Tiny read-only calendar (no click handlers, no selection)
function ReadCalendar({ today, year, month, stageEvents, firstDate }) {
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div style={{ background: "var(--c-surface-1)", borderRadius: 14, border: "1px solid var(--c-border-soft)", overflow: "hidden", margin: "0 14px" }}>
      <div style={{ textAlign: "center", padding: "14px 16px 8px", fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "var(--c-text)" }}>
        {MONTH_NAMES[month]} {year}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px" }}>
        {DOW_SHORT.map((l, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 11, color: "var(--c-text-ghost)", fontFamily: MONO, fontWeight: 700, padding: "2px 0" }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, padding: "6px 10px 12px" }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} style={{ minHeight: 38 }} />;
          const key = keyOf(year, month, date.getDate());
          const stage = firstDate && key >= firstDate ? stageOnDate(stageEvents, key) : null;
          const color = stage ? stageGroup(stage)?.color : null;
          const isToday = sameDay(date, today);
          const glyph = stage ? (STAGE_GLYPH[stage] ?? "") : "";
          return (
            <div
              key={date.getDate()}
              style={{
                borderRadius: 8, minHeight: 38,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                background: isToday
                  ? `${color || "var(--c-accent)"}22`
                  : color ? `${color}18` : "transparent",
                border: isToday
                  ? `2px solid ${color || "var(--c-accent)"}`
                  : "2px solid transparent",
                opacity: color ? 1 : 0.2,
              }}
            >
              <span style={{ fontSize: 12, fontFamily: MONO, color: "var(--c-text-dim)", lineHeight: 1 }}>
                {date.getDate()}
              </span>
              {glyph && (
                <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color, lineHeight: 1 }}>
                  {glyph}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Where the grow is today, and how long it has been going.
function TodayCard({ today, stageEvents, firstDate }) {
  const todayKey = ymd(today);
  const stage = stageOnDate(stageEvents, todayKey);
  if (!stage) return null;
  const color = stageGroup(stage)?.color;
  const growDay = dayOfGrow(firstDate, todayKey);

  return (
    <div style={{
      margin: "14px 14px 0",
      background: `${color}12`,
      border: `1px solid ${color}44`,
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 11, color, letterSpacing: 1, textTransform: "uppercase" }}>
          {stageLabel(stage)} · Today
        </span>
      </div>
      {growDay && (
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--c-text)", letterSpacing: -0.2 }}>
          Day {growDay} of the grow
        </div>
      )}
    </div>
  );
}

// Every stage this grow has actually moved through, newest last.
function StageHistory({ today, stageEvents, firstDate }) {
  if (!stageEvents.length) return null;
  const todayKey = ymd(today);
  return (
    <div style={{
      margin: "16px 14px 0",
      background: "var(--c-surface-1)", borderRadius: 14,
      border: "1px solid var(--c-border-soft)", padding: "12px 16px 6px",
    }}>
      <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, color: "var(--c-text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
        Stage history
      </div>
      {stageEvents.map((e) => {
        const [y, m, d] = e.date.split("-").map(Number);
        const color = stageGroup(e.stage)?.color;
        const day = dayOfGrow(firstDate, e.date);
        return (
          <div key={e.date + e.stage} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "8px 0",
            borderTop: "1px solid var(--c-border-faint)",
          }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--c-text)", flex: 1 }}>
              {stageLabel(e.stage)}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", flexShrink: 0 }}>
              {fmtL(new Date(y, m - 1, d))}
              {e.date === todayKey ? " · today" : day ? ` · day ${day}` : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Local copy of PhaseLegend: the shared component is fine to duplicate here
// because this public route mounts outside PlanProvider.
const SWATCHES = (() => {
  const seen = new Set();
  const out = [];
  for (const stage of STAGE_ORDER) {
    const group = stageGroup(stage);
    if (!group || seen.has(group.key)) continue;
    seen.add(group.key);
    const members = STAGE_ORDER.filter((s) => stageGroup(s)?.key === group.key);
    out.push({ key: group.key, color: group.color, label: members.map(stageLabel).join(" · ") });
  }
  return out;
})();

function BuddyPhaseLegend() {
  return (
    <details style={{
      background: "rgba(255,255,255,0.03)", borderRadius: 12,
      border: "1px solid var(--c-border-faint)",
    }}>
      <summary className="touch-target" style={{
        listStyle: "none", padding: "10px 14px",
        cursor: "pointer",
        fontSize: 11, letterSpacing: 2, color: "var(--c-text-faint)",
        textTransform: "uppercase", fontFamily: MONO,
        display: "flex", alignItems: "center", gap: 6,
      }}>
        <span aria-hidden="true">›</span> What do the colors mean?
      </summary>
      <div style={{ padding: "4px 14px 12px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px 12px" }}>
          {SWATCHES.map((v) => (
            <div key={v.key} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: v.color, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: "var(--c-text-muted)", fontFamily: MONO }}>{v.label}</span>
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

export default function BuddyView({ token }) {
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const today = useToday();

  useEffect(() => {
    api.getSharedView(token)
      .then(d => setData(d))
      .catch(e => setLoadErr(e.message || "This share link is invalid or has been revoked."));
  }, [token]);

  const stageEvents = data?.stageEvents ?? [];
  const firstDate = data?.firstDate ?? null;
  const growName = data?.growName || "Grow Calendar";
  const strainNames = (data?.survey?.strains ?? []).map(s => s.name).filter(Boolean);

  if (loadErr) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center",
        background: "var(--c-bg)", padding: 24, textAlign: "center",
      }}>
        <div style={{ fontSize: 36, marginBottom: 16 }}>🌿</div>
        <div style={{ fontSize: 15, color: "var(--c-text-dim)", fontFamily: SERIF, lineHeight: 1.7, maxWidth: 320 }}>
          {loadErr}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--c-text-ghost)", fontFamily: MONO, letterSpacing: 1 }}>
          Ask the grower for a fresh link.
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--c-bg)" }}>
        <AppShellSkeleton />
      </div>
    );
  }

  return (
    <div style={{ background: "var(--c-bg)", minHeight: "100vh", paddingBottom: 40, fontFamily: SERIF, color: "var(--c-text)" }}>
      {/* Header */}
      <div style={{
        background: "var(--c-header-bg)",
        padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 16px",
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 3, color: "var(--c-text-muted)", textTransform: "uppercase", marginBottom: 4 }}>
          Buddy view · read only
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: "var(--c-text)", letterSpacing: -0.5, marginBottom: 2 }}>
          🌿 {growName}
        </div>
        {strainNames.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", letterSpacing: 0.5 }}>
            {strainNames.join(" · ")}
          </div>
        )}
      </div>

      {/* Today */}
      <TodayCard today={today} stageEvents={stageEvents} firstDate={firstDate} />

      {/* Calendar */}
      <div style={{ marginTop: 16 }}>
        <ReadCalendar
          today={today}
          year={today.getFullYear()}
          month={today.getMonth()}
          stageEvents={stageEvents}
          firstDate={firstDate}
        />
      </div>

      {/* What has actually happened */}
      <StageHistory today={today} stageEvents={stageEvents} firstDate={firstDate} />

      {/* Stage legend */}
      <div style={{ margin: "16px 14px 0" }}>
        <BuddyPhaseLegend />
      </div>

      {stageEvents.length === 0 && (
        <div style={{ textAlign: "center", marginTop: 20, padding: "0 24px", fontFamily: MONO, fontSize: 12, color: "var(--c-text-muted)", lineHeight: 1.7 }}>
          Nothing recorded yet. This calendar fills in as the grower moves plants
          through their stages.
        </div>
      )}

      <div style={{ textAlign: "center", marginTop: 24, fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 1 }}>
        Read-only buddy view · no account required
      </div>
    </div>
  );
}
