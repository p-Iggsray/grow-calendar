import { useState } from "react";
import { CheckCircle2, Wind, Droplets } from "lucide-react";
import { usePlan } from "../../lib/usePlan.jsx";
import {
  normalizeLifecycle, cureProgress, cureReadiness,
  CURE_MIN, CURE_GOOD, CURE_MAX, CURE_IDEAL_RH,
} from "../../lib/lifecycle.js";
import { fmtL } from "../../lib/dates-core.js";
import ConfirmModal from "../ConfirmModal.jsx";
import {
  MONO, ymd, PhaseScreen, Card, Eyebrow, DayHero, ProgressBar,
  ReadyBadge, CTAButton, Stat, useLifecycleSave,
} from "./shared.jsx";

const CURE_ACCENT = "#a855f7"; // violet — curing

export default function CuringTracker({ today }) {
  const { lifecycle } = usePlan();
  const lc = normalizeLifecycle(lifecycle);
  const { save, busy } = useLifecycleSave();
  const [confirmDone, setConfirmDone] = useState(false);
  const [rh, setRh] = useState("");

  const prog = cureProgress(lc, today);
  const ready = cureReadiness(lc, today);
  const canFinish = (prog?.elapsed ?? 0) >= CURE_MIN;

  const burps = lc.cureLogs.filter(l => l.burped);
  const lastBurp = burps.length ? burps[burps.length - 1].date : null;
  const todayKey = ymd(today);
  const burpedToday = burps.some(l => l.date === todayKey);

  function logBurp() {
    const entry = { date: todayKey, rh: rh === "" ? null : Number(rh), burped: true, note: "" };
    save({ cureLogs: [...lc.cureLogs, entry] });
    setRh("");
  }

  function finishGrow() {
    setConfirmDone(false);
    save({ phase: "done", finishedAt: ymd(today) });
  }

  return (
    <PhaseScreen>
      <Card style={{ borderColor: "rgba(168,85,247,0.3)" }}>
        <Eyebrow color={CURE_ACCENT}>Curing · {CURE_MIN}d min · {CURE_GOOD}d great</Eyebrow>
        <DayHero
          dayNum={prog?.dayNum ?? 1}
          accent={CURE_ACCENT}
          caption={prog?.cureStartedAt ? "" : "Curing in jars"}
        />
        <div style={{ marginTop: 14 }}>
          <ProgressBar pct={prog?.pct ?? 0} accent={CURE_ACCENT} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <Stat label="Min" value={`${CURE_MIN}d`} />
          <Stat label="Great" value={`${CURE_GOOD}d`} />
          <Stat label="Premium" value={`${CURE_MAX}d`} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Cure status</Eyebrow>
        <div style={{ marginBottom: 8 }}>
          <ReadyBadge status={ready.status}>
            {ready.status === "ready" ? "Well cured" : ready.status === "window" ? "Good to go" : "Keep curing"}
          </ReadyBadge>
        </div>
        <div style={{ fontSize: 13.5, lineHeight: 1.6, color: "var(--c-text-dim)" }}>{ready.reason}</div>
      </Card>

      <Card>
        <Eyebrow>Burping</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, fontFamily: MONO, fontSize: 12, color: "var(--c-text-faint)" }}>
          <Wind size={14} strokeWidth={1.8} /> {ready.burp}
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-faint)", textTransform: "uppercase", display: "flex", alignItems: "center", gap: 5 }}>
            <Droplets size={12} strokeWidth={1.8} /> Jar RH % (optional · target {CURE_IDEAL_RH}%)
          </span>
          <input
            type="number" inputMode="decimal" value={rh} onChange={e => setRh(e.target.value)} placeholder="—"
            style={{
              width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
              border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "12px 14px",
              fontSize: 16, fontFamily: "'Georgia', serif", outline: "none",
            }}
          />
        </label>
        <button
          type="button"
          onClick={logBurp}
          disabled={busy}
          style={{
            width: "100%", padding: "13px", borderRadius: 12, minHeight: 46,
            background: burpedToday ? "var(--c-surface-2)" : "rgba(168,85,247,0.16)",
            border: `1px solid ${burpedToday ? "var(--c-border)" : "rgba(168,85,247,0.4)"}`,
            color: burpedToday ? "var(--c-text-dim)" : CURE_ACCENT,
            fontFamily: MONO, fontSize: 13, letterSpacing: 1, cursor: busy ? "default" : "pointer",
          }}>
          {burpedToday ? "Burped today ✓ — log another" : "Log a burp"}
        </button>
        <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 11, color: "var(--c-text-ghost)" }}>
          {burps.length} burp{burps.length === 1 ? "" : "s"} logged{lastBurp ? ` · last ${fmtL(parseLocal(lastBurp))}` : ""}
        </div>
      </Card>

      <CTAButton onClick={() => setConfirmDone(true)} disabled={busy || !canFinish} emphasized={ready.status === "ready"}>
        <CheckCircle2 size={15} strokeWidth={2} style={{ verticalAlign: "-2px", marginRight: 6 }} />
        {canFinish ? "Finish grow" : `Finish unlocks at ${CURE_MIN} days`}
      </CTAButton>

      <ConfirmModal
        open={confirmDone}
        title="Finish this grow?"
        message="This marks the grow complete (harvested) and opens the wrap-up summary. You can still export the full report afterward."
        confirmLabel="Finish grow"
        cancelLabel="Keep curing"
        onConfirm={finishGrow}
        onCancel={() => setConfirmDone(false)}
      />
    </PhaseScreen>
  );
}

// Local date parse for display (avoid UTC shift from new Date("YYYY-MM-DD")).
function parseLocal(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
