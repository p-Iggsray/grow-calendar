import { useState } from "react";
import { FileText, Plus } from "lucide-react";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToast } from "../../lib/useToast.jsx";
import { api } from "../../lib/api.js";
import { normalizeLifecycle } from "../../lib/lifecycle.js";
import { daysBetween, fmtL } from "../../lib/dates-core.js";
import {
  MONO, PhaseScreen, Card, Eyebrow, Stat, useLifecycleSave,
} from "./shared.jsx";

const DONE_ACCENT = "#22c55e";

function parseLocal(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function GrowComplete({ onStartNewGrow }) {
  const { lifecycle, activeGrowId, survey } = usePlan();
  const lc = normalizeLifecycle(lifecycle);
  const { save, busy } = useLifecycleSave();
  const { addToast } = useToast();

  const [weight, setWeight] = useState(lc.finalWeightG != null ? String(lc.finalWeightG) : "");
  const [notes, setNotes] = useState(lc.finalNotes ?? "");
  const [reportBusy, setReportBusy] = useState(false);

  const dryStart = parseLocal(lc.dryStartedAt);
  const cureStart = parseLocal(lc.cureStartedAt);
  const finished = parseLocal(lc.finishedAt);
  const dryDays = dryStart && cureStart ? daysBetween(cureStart, dryStart) : null;
  const cureDays = cureStart && finished ? daysBetween(finished, cureStart) : null;

  const dirty = (weight === "" ? null : Number(weight)) !== lc.finalWeightG || notes !== lc.finalNotes;

  function saveWrapUp() {
    save({ finalWeightG: weight === "" ? null : Number(weight), finalNotes: notes });
  }

  async function exportReport() {
    if (!activeGrowId || reportBusy) return;
    setReportBusy(true);
    try {
      const html = await api.getGrowReport(activeGrowId);
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `grow-report-${activeGrowId}.html`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      addToast(`Could not export report: ${err?.message ?? "unknown error"}`);
    } finally {
      setReportBusy(false);
    }
  }

  return (
    <PhaseScreen>
      <Card style={{ borderColor: "rgba(34,197,94,0.3)", textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 6 }}>🌿🏆</div>
        <Eyebrow color={DONE_ACCENT}>Grow complete</Eyebrow>
        <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: -0.4 }}>
          Harvested, dried &amp; cured
        </div>
        {finished && (
          <div style={{ fontSize: 13, color: "var(--c-text-dim)", marginTop: 6 }}>
            Finished {fmtL(finished)}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <Stat label="Dried" value={dryDays != null ? `${dryDays}d` : "-"} />
          <Stat label="Cured" value={cureDays != null ? `${cureDays}d` : "-"} />
          <Stat label="Plants" value={Array.isArray(survey?.strains) ? survey.strains.length : "-"} />
        </div>
      </Card>

      <Card>
        <Eyebrow>Final tally</Eyebrow>
        <label style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-faint)", textTransform: "uppercase" }}>
            Final dry weight (g)
          </span>
          <input
            type="number" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value)} placeholder="-"
            style={inputStyle}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: 1, color: "var(--c-text-faint)", textTransform: "uppercase" }}>
            Notes / how it turned out
          </span>
          <textarea
            value={notes} onChange={e => setNotes(e.target.value)} rows={4} placeholder="Smell, smoke, what you'd change next time…"
            style={{ ...inputStyle, resize: "vertical", minHeight: 90, lineHeight: 1.5 }}
          />
        </label>
        <button
          type="button"
          onClick={saveWrapUp}
          disabled={busy || !dirty}
          style={{
            marginTop: 12, width: "100%", padding: "13px", borderRadius: 12, minHeight: 46,
            background: dirty ? "rgba(34,197,94,0.16)" : "var(--c-surface-2)",
            border: `1px solid ${dirty ? "rgba(34,197,94,0.4)" : "var(--c-border)"}`,
            color: dirty ? "var(--c-accent)" : "var(--c-text-faint)",
            fontFamily: MONO, fontSize: 13, letterSpacing: 1,
            cursor: busy || !dirty ? "default" : "pointer",
          }}>
          {busy ? "Saving…" : dirty ? "Save final tally" : "Saved ✓"}
        </button>
      </Card>

      <button type="button" onClick={exportReport} disabled={reportBusy} style={actionStyle}>
        <FileText size={16} strokeWidth={1.8} />
        {reportBusy ? "Preparing report…" : "Export full grow report"}
      </button>

      <button type="button" onClick={onStartNewGrow} style={actionStyle}>
        <Plus size={16} strokeWidth={2} />
        Start a new grow
      </button>
    </PhaseScreen>
  );
}

const inputStyle = {
  width: "100%", boxSizing: "border-box", background: "rgba(0,0,0,0.3)", color: "var(--c-text)",
  border: "1px solid rgba(255,255,255,0.14)", borderRadius: 10, padding: "12px 14px",
  fontSize: 16, fontFamily: "var(--font-ui)", outline: "none",
};

const actionStyle = {
  display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
  width: "100%", padding: "14px 16px", borderRadius: 12, minHeight: 50,
  background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
  color: "var(--c-text-dim)", fontFamily: MONO, fontSize: 13, letterSpacing: 1, cursor: "pointer",
};
