import { ChevronLeft, Loader, Droplets, Thermometer, CheckSquare, BookOpen, Camera, Mic, BarChart2 } from "lucide-react";
import { useStats } from "../lib/useStats.js";
import { STRAIN_1, STRAIN_2, LOCATION } from "../lib/appConfig.js";

const MONO  = "'Courier New', monospace";
const SERIF = "'Georgia', 'Times New Roman', serif";

function ms(a, b) {
  return Math.round((a - b) / 86400000);
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 9, letterSpacing: 3, textTransform: "uppercase",
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
      <span style={{ fontFamily: MONO, fontSize: 12, color: "var(--c-text)", letterSpacing: 0.8 }}>
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
        fontFamily: MONO, fontSize: 26, fontWeight: "bold", lineHeight: 1,
        color: harvested ? "var(--c-text-ghost)" : "var(--c-accent)",
        marginBottom: 2,
      }}>
        {harvested ? "✓" : daysLeft}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)", letterSpacing: 0.5, marginBottom: 12 }}>
        {harvested ? "harvested" : "days left"}
      </div>
      <div style={{ height: 3, background: "var(--c-border)", borderRadius: 2, overflow: "hidden", marginBottom: 5 }}>
        <div style={{ width: `${pct}%`, height: "100%", background: harvested ? "var(--c-text-ghost)" : "var(--c-accent)", borderRadius: 2, transition: "width 0.4s" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)" }}>{pct}%</span>
        <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)" }}>{harvestLabel}</span>
      </div>
    </div>
  );
}

export default function StatsScreen({ config, today, onClose }) {
  const { stats, loading } = useStats(Boolean(config));

  const totalSeasonDays = ms(config.hazeHarvest, config.transplant);
  const seasonElapsed   = Math.max(0, ms(today, config.transplant));
  const seasonPct       = Math.min(100, Math.round((seasonElapsed / totalSeasonDays) * 100));
  const startLabel      = config.transplant.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endLabel        = config.hazeHarvest.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const tempVal = stats?.log.tempMin != null
    ? `${stats.log.tempMax}° / ${stats.log.tempMin}°F`
    : "—";

  const taskTotal = stats?.checkoffs.total ?? 0;
  const taskDone  = stats?.checkoffs.done  ?? 0;
  const taskPct   = taskTotal > 0 ? Math.round((taskDone / taskTotal) * 100) : 0;

  return (
    <div style={{
      paddingTop: "calc(20px + env(safe-area-inset-top, 0px))",
      paddingLeft: "calc(14px + env(safe-area-inset-left, 0px))",
      paddingRight: "calc(14px + env(safe-area-inset-right, 0px))",
      paddingBottom: 48,
      minHeight: "100vh",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--c-text-muted)", padding: "4px 10px 4px 0",
            display: "flex", alignItems: "center",
          }}
        >
          <ChevronLeft size={20} strokeWidth={1.8} />
        </button>
        <BarChart2 size={15} strokeWidth={1.6} style={{ color: "var(--c-text-ghost)" }} />
        <span style={{ fontFamily: SERIF, fontSize: 18, color: "var(--c-text)" }}>
          Season Analytics
        </span>
      </div>

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
          <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)" }}>Transplant · {startLabel}</span>
          <span style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)" }}>Final harvest · {endLabel}</span>
        </div>
      </div>

      {/* Strain Comparison */}
      <SectionTitle>Strain Comparison</SectionTitle>
      <div style={{ display: "flex", gap: 10 }}>
        <StrainCard
          name={STRAIN_1}
          harvestDate={config.gdpHarvest}
          today={today}
          config={config}
        />
        <StrainCard
          name={STRAIN_2}
          harvestDate={config.hazeHarvest}
          today={today}
          config={config}
        />
      </div>
      <div style={{
        fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)", letterSpacing: 0.5,
        marginTop: 8, textAlign: "center",
      }}>
        GDP harvests {ms(config.gdpHarvest, config.hazeHarvest) < 0 ? Math.abs(ms(config.gdpHarvest, config.hazeHarvest)) : ms(config.hazeHarvest, config.gdpHarvest)} days {ms(config.gdpHarvest, config.hazeHarvest) < 0 ? "after" : "before"} Haze
      </div>

      {/* By the Numbers */}
      <SectionTitle>By the Numbers</SectionTitle>
      {loading ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
          <Loader size={18} strokeWidth={1.5} style={{ color: "var(--c-text-ghost)", animation: "spin 1s linear infinite" }} />
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
          <StatRow icon={Camera} label="Photos" value={stats.media.photos} iconColor="#a78bfa" />
          <StatRow icon={Mic} label="Voice notes" value={stats.media.audio} iconColor="#a78bfa" />
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
          <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-muted)", letterSpacing: 0.4 }}>
            {LOCATION} · {totalSeasonDays} days
          </div>
        </div>
        <span style={{
          fontFamily: MONO, fontSize: 9, letterSpacing: 1.5, padding: "3px 7px",
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
        <div style={{ fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", letterSpacing: 0.8 }}>
          Year 2 and beyond
        </div>
        <div style={{ fontFamily: MONO, fontSize: 9, color: "var(--c-text-ghost)", marginTop: 4, opacity: 0.7 }}>
          Season comparisons will appear here
        </div>
      </div>
    </div>
  );
}
