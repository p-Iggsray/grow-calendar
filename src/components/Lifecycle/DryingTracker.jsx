import { useState } from "react";
import { Scissors, Check, Thermometer, Droplets } from "lucide-react";
import { usePlan } from "../../lib/usePlan.jsx";
import {
  normalizeLifecycle, dryProgress, dryReadiness,
  DRY_CHECKLIST, DRY_MIN, DRY_MAX, DRY_IDEAL_TEMP_F, DRY_IDEAL_RH,
} from "../../lib/lifecycle.js";
import { fmtL } from "../../lib/dates-core.js";
import ConfirmModal from "../ConfirmModal.jsx";
import {
  MONO, ymd, PhaseScreen, Card, Eyebrow, DayHero, ProgressBar,
  ReadyBadge, CTAButton, Stat, useLifecycleSave,
} from "./shared.jsx";

const DRY_ACCENT = "#f59e0b"; // amber - drying

export default function DryingTracker({ today }) {
  const { lifecycle } = usePlan();
  const lc = normalizeLifecycle(lifecycle);
  const { save, busy } = useLifecycleSave();
  const [confirmCure, setConfirmCure] = useState(false);

  const prog = dryProgress(lc, today);
  const ready = dryReadiness(lc, today);
  const checklist = lc.dryChecklist ?? {};
  const moveEmphasized = ready.status === "ready" || ready.status === "window";

  // Today's environment log (one entry per day).
  const todayKey = ymd(today);
  const todayLog = lc.dryLogs.find(l => l.date === todayKey);
  const [temp, setTemp] = useState(todayLog?.tempF != null ? String(todayLog.tempF) : "");
  const [rh, setRh] = useState(todayLog?.rh != null ? String(todayLog.rh) : "");

  function toggleCheck(key) {
    save({ dryChecklist: { ...checklist, [key]: !checklist[key] } });
  }

  function saveEnvLog() {
    const entry = {
      date: todayKey,
      tempF: temp === "" ? null : Number(temp),
      rh: rh === "" ? null : Number(rh),
      note: todayLog?.note ?? "",
    };
    const rest = lc.dryLogs.filter(l => l.date !== todayKey);
    save({ dryLogs: [...rest, entry] });
  }

  function moveToCuring() {
    setConfirmCure(false);
    save({ phase: "curing", cureStartedAt: ymd(today) });
  }

  return (
    <PhaseScreen>
      <Card style={{ borderColor: "rgba(245,158,11,0.3)" }}>
        <Eyebrow color={DRY_ACCENT}>Drying · {DRY_MIN}-{DRY_MAX} day window</Eyebrow>
        <DayHero
          dayNum={prog?.dayNum ?? 1}
          accent={DRY_ACCENT}
          caption={prog?.estReadyDate ? `Target ready around ${fmtL(prog.estReadyDate)}` : "Hanging to dry"}
        />
        <div style={{ marginTop: 14 }}>
          <ProgressBar pct={prog?.pct ?? 0} accent={DRY_ACCENT} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Stat label="Day" value={prog?.dayNum ?? 1} />
          <Stat label="Min" value={`${DRY_MIN}d`} />
          <Stat label="Max" value={`${DRY_MAX}d`} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Optimal time to cure</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <ReadyBadge status={ready.status}>
            {ready.status === "ready" ? "Ready to jar" : ready.status === "window" ? "Almost there" : "Still drying"}
          </ReadyBadge>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-dim)" }}>{ready.reason}</div>
      </Card>

      <Card>
        <Eyebrow>Dryness check</Eyebrow>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {DRY_CHECKLIST.map(({ key, label }) => {
            const on = checklist[key] === true;
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCheck(key)}
                disabled={busy}
                style={{
                  display: "flex", alignItems: "center", gap: 10,
                  width: "100%", padding: "12px 14px", borderRadius: 12, minHeight: 48,
                  background: on ? "rgba(34,197,94,0.12)" : "var(--c-surface-2)",
                  border: `1px solid ${on ? "rgba(34,197,94,0.4)" : "var(--c-border)"}`,
                  color: on ? "var(--c-accent)" : "var(--c-text-dim)",
                  cursor: busy ? "default" : "pointer", textAlign: "left",
                  fontFamily: "var(--font-ui)", fontSize: 14,
                }}>
                <span style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                  border: `1.5px solid ${on ? "var(--c-accent)" : "var(--c-border-strong)"}`,
                  background: on ? "var(--c-accent)" : "transparent",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {on && <Check size={14} strokeWidth={3} color="var(--c-bg)" />}
                </span>
                {label}
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <Eyebrow>Dry-space log (optional)</Eyebrow>
        <div style={{ fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)", marginBottom: 12 }}>
          Ideal ~{DRY_IDEAL_TEMP_F}°F / {DRY_IDEAL_RH}% RH
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <EnvField icon={Thermometer} label="Temp °F" value={temp} onChange={setTemp} />
          <EnvField icon={Droplets} label="RH %" value={rh} onChange={setRh} />
        </div>
        <button
          type="button"
          onClick={saveEnvLog}
          disabled={busy}
          style={{
            marginTop: 12, width: "100%", padding: "11px", borderRadius: 12, minHeight: 44,
            background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
            color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 12, letterSpacing: 1,
            cursor: busy ? "default" : "pointer",
          }}>
          {todayLog ? "Update today's reading" : "Log today's reading"}
        </button>
      </Card>

      <CTAButton onClick={() => setConfirmCure(true)} disabled={busy} emphasized={moveEmphasized}>
        <Scissors size={15} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        Move to curing
      </CTAButton>

      <ConfirmModal
        open={confirmCure}
        title="Move to curing?"
        message="This ends drying and starts the curing tracker (jars at ~62% RH). The drying day counter stops here."
        confirmLabel="Start curing"
        cancelLabel="Not yet"
        onConfirm={moveToCuring}
        onCancel={() => setConfirmCure(false)}
      />
    </PhaseScreen>
  );
}

function EnvField({ icon: Icon, label, value, onChange }) {
  return (
    <label style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-faint)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
        <Icon size={12} strokeWidth={1.8} /> {label}
      </span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="-"
        style={{
          width: "100%", boxSizing: "border-box",
          background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
          border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10,
          padding: "12px 14px", fontSize: 16, fontFamily: "var(--font-ui)", outline: "none",
        }}
      />
    </label>
  );
}
