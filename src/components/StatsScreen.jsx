import { Droplets, Thermometer, CheckSquare, BookOpen } from "lucide-react";
import ScreenHeader from "./ScreenHeader.jsx";
import { useStats } from "../lib/useStats.js";
import { Skeleton } from "./Skeleton.jsx";
import { usePlan } from "../lib/usePlan.jsx";
import { distinctStrains, growLocation } from "../lib/growProfile.js";

const MONO  = "var(--font-ui)";
const SERIF = "var(--font-ui)";

function ms(a, b) {
  return Math.round((a - b) / 86400000);
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

function StrainCard({ name, harvestDate, today, config }) {
  const daysLeft    = ms(harvestDate, today);
  const totalDays   = ms(harvestDate, config.transplant);
  const elapsed     = Math.max(0, ms(today, config.transplant));
  const pct         = Math.min(100, totalDays > 0 ? Math.round((elapsed / totalDays) * 100) : 100);
  const harvested   = daysLeft <= 0;
  const harvestLabel = harvestDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  return (
    <div style={{
      flex: 1, padding: "14px 12px",
      background: "var(--c-surface-1)",
      border: "1px solid var(--c-border)",
      borderRadius: 12,
    }}>
      <div style={{ fontFamily: SERIF, fontSize: 12, color: "var(--c-text-muted)", marginBottom: 8, lineHeight: 1.3 }}>
        {name}
      </div>
      <div style={{
        fontFamily: "var(--font-num)", fontSize: 26, fontWeight: 700, lineHeight: 1,
        color: harvested ? "var(--c-text-ghost)" : "var(--c-accent)",
        marginBottom: 2,
      }}>
        {harvested ? "✓" : daysLeft}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 0.5, marginBottom: 12 }}>
        {harvested ? "harvested" : "days left"}
      </div>
      <div style={{ height: 3, background: "var(--c-border)", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: harvested ? "var(--c-text-ghost)" : "var(--c-accent)", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>{pct}%</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>{harvestLabel}</span>
      </div>
    </div>
  );
}

export default function StatsScreen({ config, today, onClose }) {
  const { survey, activeGrowId } = usePlan();
  const { stats, loading } = useStats(Boolean(config), activeGrowId);
  const location = growLocation(survey);

  // Up to two strain cards: primary maps to gdpHarvest, secondary to hazeHarvest.
  const strainList = distinctStrains(survey);
  const strainCards = [
    { name: strainList[0] || "Primary strain", harvestDate: config.gdpHarvest },
    strainList[1] && config.hazeHarvest
      ? { name: strainList[1], harvestDate: config.hazeHarvest }
      : null,
  ].filter(Boolean);

  const totalSeasonDays = ms(config.hazeHarvest, config.transplant);
  const seasonElapsed   = Math.max(0, ms(today, config.transplant));
  const seasonPct       = Math.min(100, Math.round((seasonElapsed / totalSeasonDays) * 100));
  const startLabel      = config.transplant.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel        = config.hazeHarvest.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const tempVal = stats?.log.tempMin != null
    ? `${stats.log.tempMax}° / ${stats.log.tempMin}°F`
    : "-";

  const taskTotal = stats?.checkoffs.total ?? 0;
  const taskDone  = stats?.checkoffs.done  ?? 0;
  const taskPct   = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  return (
    <div style={{ minHeight: "100vh", paddingBottom: 48 }}>
      <ScreenHeader eyebrow="Insights" title="Season Analytics" onBack={onClose} />
      <div style={{
        paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
        paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      }}>

      {/* Season Overview */}
      <SectionTitle>Season Overview</SectionTitle>
      <div style={{
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        borderRadius: 12, padding: "16px",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)" }}>
            Day {seasonElapsed} of {totalSeasonDays}
          </span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-accent)" }}>
            {seasonPct}%
          </span>
        </div>
        <div style={{ height: 6, background: "var(--c-border)", borderRadius: 3, overflow: "hidden" }}>
          <div style={{
            width: `${seasonPct}%`, height: "100%",
            background: "var(--c-accent)", borderRadius: 3, transition: "width 0.4s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>Transplant · {startLabel}</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>Final harvest · {endLabel}</span>
        </div>
      </div>

      {/* Strain Comparison */}
      <SectionTitle>{strainCards.length > 1 ? "Strain Comparison" : "Strain"}</SectionTitle>
      <div style={{ display: "flex", gap: 10 }}>
        {strainCards.map(card => (
          <StrainCard
            key={card.name}
            name={card.name}
            harvestDate={card.harvestDate}
            today={today}
            config={config}
          />
        ))}
      </div>
      {strainCards.length > 1 && (
        <div style={{
          fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 0.5,
          marginTop: 8, textAlign: "center",
        }}>
          {strainCards[0].name} harvests {Math.abs(ms(strainCards[0].harvestDate, strainCards[1].harvestDate))} days {ms(strainCards[0].harvestDate, strainCards[1].harvestDate) < 0 ? "before" : "after"} {strainCards[1].name}
        </div>
      )}

      {/* By the Numbers */}
      <SectionTitle>By the Numbers</SectionTitle>
      {loading ? (
        <div role="status" aria-busy="true" aria-label="Loading stats" style={{
          background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
          borderRadius: 12, padding: "4px 16px",
        }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 0", borderBottom: i < 3 ? "1px solid var(--c-border-faint)" : "none" }}>
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
          <StatRow icon={Droplets} label="Total water logged" value={`${stats.log.totalWater} gal`} />
          <StatRow icon={Thermometer} label="Temp range logged" value={tempVal} iconColor="#60a5fa" />
          <StatRow icon={CheckSquare} label="Tasks completed" value={`${taskDone} / ${taskTotal} (${taskPct}%)`} iconColor="var(--c-accent)" />
          <StatRow icon={BookOpen} label="Journal entries" value={stats.notes.count} iconColor="#f59e0b" />

        </div>
      ) : null}

      {/* Previous Seasons */}
      <SectionTitle>Previous Seasons</SectionTitle>
      <div style={{
        background: "var(--c-surface-1)", border: "1px solid var(--c-border-strong)",
        borderRadius: 12, padding: "14px 16px", marginBottom: 10,
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <div>
          <div style={{ fontFamily: SERIF, fontSize: 14, color: "var(--c-text)", marginBottom: 3 }}>
            2026 Season
          </div>
          <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-muted)", letterSpacing: 0.4 }}>
            {location ? `${location} · ` : ""}{totalSeasonDays} days
          </div>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 11, letterSpacing: 1.5, padding: "3px 7px",
          color: "var(--c-accent)", borderRadius: 4,
          background: "rgba(74,222,128,0.08)", border: "1px solid rgba(74,222,128,0.2)",
        }}>
          CURRENT
        </span>
      </div>
      <div style={{
        background: "var(--c-surface-1)", border: "1px dashed var(--c-border)",
        borderRadius: 12, padding: "16px", textAlign: "center", opacity: 0.45,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 0.8 }}>
          Year 2 and beyond
        </div>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 4, opacity: 0.7 }}>
          Season comparisons will appear here
        </div>
      </div>
      </div>
    </div>
  );
}
