import { Droplets, Thermometer, BookOpen, CalendarDays } from "lucide-react";
import ScreenHeader from "./ScreenHeader.jsx";
import { useStats } from "../lib/useStats.js";
import { useStageTimeline } from "../lib/useJournal.js";
import { Skeleton } from "./Skeleton.jsx";
import { usePlan } from "../lib/usePlan.jsx";
import { ymd } from "../lib/api.js";
import { dayOfGrow, stageGroup, stageLabel, stageOnDate } from "../lib/stageTimeline.js";
import { distinctStrains, growLocation } from "../lib/growProfile.js";
import { formatWater, loadWaterUnit } from "../lib/waterUnits.js";

const MONO  = "var(--font-ui)";
const SERIF = "var(--font-ui)";

// Whole days between two YYYY-MM-DD keys, inclusive of both ends.
function spanDays(fromKey, toKey) {
  const n = dayOfGrow(fromKey, toKey);
  return n == null ? null : n;
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 3, textTransform: "uppercase",
      color: "var(--c-text-ghost)", fontFamily: MONO, marginBottom: 10, marginTop: 26,
    }}>
      {children}
    </div>
  );
}

function StatRow({ icon: Icon, label, value, iconColor }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "11px 0", borderBottom: "1px solid var(--c-border-faint)",
    }}>
      <Icon size={14} strokeWidth={1.8} style={{ color: iconColor ?? "var(--c-accent)", flexShrink: 0 }} />
      <span style={{ flex: 1, fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", letterSpacing: 0.4 }}>
        {label}
      </span>
      <span style={{ fontFamily: "var(--font-num)", fontSize: 12, color: "var(--c-text)", letterSpacing: 0.4 }}>
        {value}
      </span>
    </div>
  );
}

// One stage the grow actually spent time in, with its share of the whole run.
function StageBar({ stage, days, totalDays, range, current }) {
  const color = stageGroup(stage)?.color ?? "var(--c-accent)";
  const pct = totalDays > 0 ? Math.round((days / totalDays) * 100) : 0;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5, gap: 8 }}>
        <span style={{ fontFamily: SERIF, fontSize: 13, color: "var(--c-text)" }}>
          {stageLabel(stage)}
          {current && (
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-accent)", marginLeft: 7 }}>
              NOW
            </span>
          )}
        </span>
        <span style={{ fontFamily: "var(--font-num)", fontSize: 12, color: "var(--c-text-dim)", flexShrink: 0 }}>
          {days}d
        </span>
      </div>
      <div style={{ height: 6, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.4s" }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 4 }}>
        {range}
      </div>
    </div>
  );
}

function fmtKey(key) {
  const [y, m, d] = String(key).split("-").map(Number);
  if (!y) return key;
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Everything here is measured, never projected: the stage breakdown comes from
// the switches the grower recorded, so there is no countdown to a harvest date
// the app does not actually know.
export default function StatsScreen({ today, onClose }) {
  const { survey, activeGrowId } = usePlan();
  const { stats, loading } = useStats(Boolean(activeGrowId), activeGrowId);
  const { events, firstDate } = useStageTimeline(activeGrowId, Boolean(activeGrowId));
  const location = growLocation(survey);
  const strainList = distinctStrains(survey);

  const todayKey = ymd(today);
  const growDay = dayOfGrow(firstDate, todayKey);
  const currentStage = stageOnDate(events, todayKey);

  // Each recorded stage runs until the next switch, or until today if current.
  const stageSpans = events.map((e, i) => {
    const endKey = i + 1 < events.length ? events[i + 1].date : todayKey;
    const days = spanDays(e.date, endKey);
    return days == null ? null : {
      stage: e.stage,
      days,
      current: i === events.length - 1,
      range: e.date === endKey ? fmtKey(e.date) : `${fmtKey(e.date)} - ${fmtKey(endKey)}`,
    };
  }).filter(Boolean);
  const longestStage = stageSpans.reduce((m, s) => Math.max(m, s.days), 0);

  const tempVal = stats?.log.tempMin != null
    ? `${stats.log.tempMax}° / ${stats.log.tempMin}°F`
    : "-";

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 48 }}>
      <ScreenHeader eyebrow="Insights" title="Grow Analytics" onBack={onClose} />
      <div style={{
        paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      }}>

      {/* Where the grow is right now */}
      <SectionTitle>This Grow</SectionTitle>
      <div style={{
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        borderRadius: 12, padding: "16px",
      }}>
        {growDay != null ? (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span style={{ fontFamily: "var(--font-num)", fontSize: 30, fontWeight: 700, lineHeight: 1, color: "var(--c-accent)" }}>
                {growDay}
              </span>
              <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase" }}>
                days in
              </span>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11.5, color: "var(--c-text-muted)", marginTop: 8, letterSpacing: 0.4 }}>
              {[
                currentStage ? stageLabel(currentStage) : null,
                `started ${fmtKey(firstDate)}`,
                strainList.length ? strainList.join(" · ") : null,
                location,
              ].filter(Boolean).join(" · ")}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text-ghost)", lineHeight: 1.7 }}>
            Nothing recorded yet. Move a plant into a stage on the Environments
            tab and this grow&rsquo;s clock starts.
          </div>
        )}
      </div>

      {/* How long each stage actually took */}
      {stageSpans.length > 0 && (
        <>
          <SectionTitle>Time In Each Stage</SectionTitle>
          <div style={{
            background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
            borderRadius: 12, padding: "16px 16px 6px",
          }}>
            {stageSpans.map((s) => (
              <StageBar
                key={s.stage}
                stage={s.stage}
                days={s.days}
                totalDays={longestStage}
                range={s.range}
                current={s.current}
              />
            ))}
          </div>
        </>
      )}

      {/* By the Numbers */}
      <SectionTitle>By the Numbers</SectionTitle>
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading stats" style={{
          background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
          borderRadius: 12, padding: "4px 16px",
        }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: i < 2 ? "1px solid var(--c-border-faint)" : "none" }}>
              <Skeleton width={14} height={14} radius={4} />
              <Skeleton width="45%" height={11} />
              <div style={{ flex: 1 }} />
              <Skeleton width={56} height={12} />
            </div>
          ))}
        </div>
      ) : stats ? (
        <div style={{
          background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
          borderRadius: 12, padding: "0 16px",
        }}>
          <StatRow icon={CalendarDays} label="Stage changes recorded" value={events.length} iconColor="#c084fc" />
          <StatRow icon={Droplets} label="Total water logged" value={formatWater(stats.log.totalWater, loadWaterUnit())} />
          <StatRow icon={Thermometer} label="Temp range logged" value={tempVal} iconColor="#60a5fa" />
          <StatRow icon={BookOpen} label="Journal entries" value={stats.notes.count} iconColor="#f59e0b" />
        </div>
      ) : null}

      </div>
    </div>
  );
}
