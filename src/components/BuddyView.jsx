import { useState, useEffect } from "react";
import { api } from "../lib/api.js";
import { parseConfig } from "../lib/planConfig.js";
import { useToday, MONTH_NAMES, DOW_SHORT, sameDay } from "../lib/dates.js";
import { PHASES, getPhase, getDetail, phaseGlyph } from "../lib/growData.js";
import PhaseLegend from "./PhaseLegend.jsx";

const MONO = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";
const YEAR = 2026;

// Tiny read-only calendar (no click handlers, no selection)
function ReadCalendar({ today, month, config }) {
  const firstDow = new Date(YEAR, month, 1).getDay();
  const daysInMonth = new Date(YEAR, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(YEAR, month, d));

  return (
    <div style={{ background: "var(--c-surface-1)", borderRadius: 14, border: "1px solid var(--c-border-soft)", overflow: "hidden", margin: "0 14px" }}>
      <div style={{ textAlign: "center", padding: "14px 16px 8px", fontSize: 17, fontWeight: 800, letterSpacing: -0.5, color: "var(--c-text)" }}>
        {MONTH_NAMES[month]} {YEAR}
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
          const phase = getPhase(date, config);
          const pStyle = phase ? PHASES[phase] : null;
          const isToday = sameDay(date, today);
          const glyph = pStyle ? phaseGlyph(phase) : "";
          return (
            <div
              key={date.getDate()}
              style={{
                borderRadius: 8, minHeight: 38,
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2,
                background: isToday
                  ? `${pStyle?.color || "var(--c-accent)"}22`
                  : pStyle ? `${pStyle.color}18` : "transparent",
                border: isToday
                  ? `2px solid ${pStyle?.color || "var(--c-accent)"}`
                  : "2px solid transparent",
                opacity: pStyle ? 1 : 0.2,
              }}
            >
              <span style={{ fontSize: 12, fontFamily: MONO, color: "var(--c-text-dim)", lineHeight: 1 }}>
                {date.getDate()}
              </span>
              {glyph && (
                <span style={{ fontSize: 11, fontFamily: MONO, fontWeight: 700, color: pStyle?.color, lineHeight: 1 }}>
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

// Today's phase summary card
function TodayCard({ today, config, generatedPlan, phaseOverrides }) {
  const phase = getPhase(today, config);
  if (!phase) return null;
  const pStyle = PHASES[phase];
  const detail = getDetail(today, config, {}, generatedPlan, phaseOverrides);
  if (!detail) return null;

  return (
    <div style={{
      margin: "14px 14px 0",
      background: `${pStyle?.color}12`,
      border: `1px solid ${pStyle?.color}44`,
      borderRadius: 12, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: pStyle?.color, flexShrink: 0 }} />
        <span style={{ fontFamily: MONO, fontSize: 11, color: pStyle?.color, letterSpacing: 1, textTransform: "uppercase" }}>
          {pStyle?.label ?? phase} · Today
        </span>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--c-text)", marginBottom: 6, letterSpacing: -0.2 }}>
        {detail.title}
      </div>
      {detail.summary && (
        <div style={{ fontSize: 12, color: "var(--c-text-faint)", lineHeight: 1.7, marginBottom: 10, fontStyle: "italic" }}>
          {detail.summary}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(detail.tasks ?? []).slice(0, 6).map((task, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontFamily: MONO, fontSize: 11, color: pStyle?.color, paddingTop: 2, minWidth: 16, flexShrink: 0 }}>{i + 1}.</span>
            <span style={{ fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.7 }}>{task}</span>
          </div>
        ))}
      </div>
    </div>
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

  const config = data?.config ? parseConfig(data.config) : null;
  const month = today.getMonth();
  const growName = data?.generatedPlan?.growName ?? "Grow Calendar";

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

  if (!data || !config) {
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        background: "var(--c-bg)", fontFamily: MONO, fontSize: 12, letterSpacing: 4, color: "var(--c-text-ghost)",
      }}>
        LOADING
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
        {data.generatedPlan?.strains?.length > 0 && (
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", letterSpacing: 0.5 }}>
            {data.generatedPlan.strains.map(s => s.name).filter(Boolean).join(" · ")}
          </div>
        )}
      </div>

      {/* Today */}
      <TodayCard
        today={today}
        config={config}
        generatedPlan={data.generatedPlan}
        phaseOverrides={data.phaseOverrides}
      />

      {/* Calendar */}
      <div style={{ marginTop: 16 }}>
        <ReadCalendar
          today={today}
          month={month}
          config={config}
          generatedPlan={data.generatedPlan}
          phaseOverrides={data.phaseOverrides}
        />
      </div>

      {/* Phase legend */}
      <div style={{ margin: "16px 14px 0" }}>
        <PhaseLegend />
      </div>

      <div style={{ textAlign: "center", marginTop: 24, fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 1 }}>
        Read-only buddy view · no account required
      </div>
    </div>
  );
}
