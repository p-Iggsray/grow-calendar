import { useState, useEffect, useRef, useCallback } from "react";
import { Upload, Thermometer, Droplets, Gauge, Trash2, Loader, ChevronRight } from "lucide-react";
import { api } from "../../lib/api.js";
import { usePlan } from "../../lib/usePlan.jsx";
import { useToast } from "../../lib/useToast.jsx";
import { parseEnvCsv } from "../../lib/envCsv.js";
import { Skeleton } from "../Skeleton.jsx";
import ScreenHeader from "../ScreenHeader.jsx";

const MONO = "var(--font-ui)";
const SERIF = "var(--font-ui)";
const NUM = "var(--font-num)"; // numeric readings only
const TEMP_COLOR = "#f97316";
const HUM_COLOR = "#38bdf8";
const VPD_COLOR = "#a855f7";
const IMPORT_CHUNK = 1000;

function fmtDate(iso) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtTime(ts) {
  // ts = "YYYY-MM-DDTHH:MM"
  const hm = ts?.slice(11, 16);
  if (!hm) return "";
  let [h, mm] = hm.split(":").map(Number);
  const ampm = h < 12 ? "am" : "pm";
  h = h % 12 || 12;
  return `${h}:${String(mm).padStart(2, "0")}${ampm}`;
}

export default function EnvironmentScreen({ onClose }) {
  const { activeGrowId, survey } = usePlan();
  const indoorish = survey?.environment && survey.environment !== "outdoor";
  const { addToast } = useToast();
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [openDay, setOpenDay] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    if (!activeGrowId) { setLoading(false); return; }
    setLoading(true);
    api.getEnvSummary(activeGrowId)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [activeGrowId]);

  useEffect(() => { load(); }, [load]);

  async function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !activeGrowId) return;
    setImporting(true);
    setProgress("Reading file…");
    try {
      const text = await file.text();
      const { readings, skipped } = parseEnvCsv(text);
      if (readings.length === 0) {
        addToast("No readings found in that file. Is it a controller CSV export?");
        return;
      }
      const batches = Math.ceil(readings.length / IMPORT_CHUNK);
      for (let i = 0; i < readings.length; i += IMPORT_CHUNK) {
        setProgress(`Importing… batch ${Math.floor(i / IMPORT_CHUNK) + 1}/${batches}`);
        await api.importEnv(activeGrowId, readings.slice(i, i + IMPORT_CHUNK));
      }
      addToast(`Imported ${readings.length.toLocaleString()} readings${skipped ? ` (${skipped} skipped)` : ""}.`);
      load();
    } catch (err) {
      addToast(`Import failed: ${err?.message ?? "unknown error"}`);
    } finally {
      setImporting(false);
      setProgress("");
    }
  }

  async function clearAll() {
    setConfirmClear(false);
    try {
      await api.clearEnv(activeGrowId);
      setSummary(null);
      load();
      addToast("Environment data cleared.");
    } catch (err) {
      addToast(`Could not clear: ${err?.message ?? "unknown error"}`);
    }
  }

  const overall = summary?.overall;
  const days = summary?.days ?? [];
  const hasData = overall?.samples > 0;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 45, background: "var(--c-bg)", overflowY: "auto",
      fontFamily: SERIF, color: "var(--c-text)", paddingBottom: 40,
    }}>
      <ScreenHeader
        eyebrow="Environment"
        title={openDay ? fmtDate(openDay) : "Grow environment"}
        onBack={openDay ? () => setOpenDay(null) : onClose}
      />

      <div style={{ padding: "16px 14px", display: "flex", flexDirection: "column", gap: 14, maxWidth: 560, margin: "0 auto" }}>
        {openDay ? (
          <DayDetail growId={activeGrowId} date={openDay} />
        ) : (
          <>
            {/* Import */}
            <div className="card" style={{ padding: 16 }}>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={onFile} style={{ display: "none" }} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={importing} style={{
                width: "100%", padding: "14px", borderRadius: 12, minHeight: 50,
                background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.45)",
                color: "var(--c-accent)", fontFamily: MONO, fontSize: 13, letterSpacing: 1,
                cursor: importing ? "default" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 9,
              }}>
                {importing
                  ? <><Loader size={15} style={{ animation: "spin 1s linear infinite" }} /> {progress || "Importing…"}</>
                  : <><Upload size={16} strokeWidth={2} /> Import controller report (.csv)</>}
              </button>
              <div style={{ fontFamily: MONO, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 10, lineHeight: 1.6 }}>
                {indoorish
                  ? "Import the CSV export from your grow controller (VIVOSUN style) and this grow's temp, humidity, and VPD fill in automatically, including each day's log."
                  : "Outdoor grow: conditions are usually logged by hand on each day, but you can still import a sensor CSV here if you run one outside."}
                {" "}Re-importing the same period just updates it - minutes are never double-counted.
              </div>
            </div>

            {loading && (
              <div role="status" aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <Skeleton height={92} radius={14} />
                <Skeleton height={120} radius={14} />
              </div>
            )}

            {!loading && !hasData && (
              <div style={{ textAlign: "center", padding: "30px 16px", color: "var(--c-text-dim)" }}>
                <Gauge size={34} strokeWidth={1.4} style={{ color: "var(--c-text-ghost)", marginBottom: 10 }} />
                <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>No environment data yet.<br />Import a controller report to see averages and a day-by-day log.</div>
              </div>
            )}

            {!loading && hasData && (
              <>
                {/* Overall stats */}
                <div style={{ display: "flex", gap: 10 }}>
                  <StatCard icon={Thermometer} color={TEMP_COLOR} label="Temp °F" stat={overall.temp} />
                  <StatCard icon={Droplets} color={HUM_COLOR} label="Humidity %" stat={overall.humidity} />
                  <StatCard icon={Gauge} color={VPD_COLOR} label="VPD kPa" stat={overall.vpd} dp={2} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <Totals label="Minutes logged" value={overall.samples.toLocaleString()} />
                  <Totals label="Days" value={days.length} />
                  <Totals label="Range" value={`${fmtDate(overall.firstTs)} - ${fmtDate(overall.lastTs)}`} small />
                </div>

                {/* Per-day log */}
                <div>
                  <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: "var(--c-text-faint)", margin: "8px 2px" }}>
                    Daily log
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {days.map(d => <DayRow key={d.date} day={d} onOpen={() => setOpenDay(d.date)} />)}
                  </div>
                </div>

                <button type="button" onClick={() => setConfirmClear(true)} style={{
                  marginTop: 6, alignSelf: "center", background: "none", border: "1px solid var(--c-border)",
                  borderRadius: 10, padding: "9px 14px", color: "var(--c-text-faint)", cursor: "pointer",
                  fontFamily: MONO, fontSize: 11, letterSpacing: 1, display: "flex", alignItems: "center", gap: 7,
                }}>
                  <Trash2 size={13} strokeWidth={1.8} /> Clear all environment data
                </button>
                {confirmClear && (
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button type="button" onClick={clearAll} style={{
                      background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 8,
                      padding: "7px 12px", color: "var(--c-danger-soft)", cursor: "pointer", fontFamily: MONO, fontSize: 11,
                    }}>Delete everything</button>
                    <button type="button" onClick={() => setConfirmClear(false)} style={{
                      background: "none", border: "1px solid var(--c-border)", borderRadius: 8,
                      padding: "7px 12px", color: "var(--c-text-faint)", cursor: "pointer", fontFamily: MONO, fontSize: 11,
                    }}>Cancel</button>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, color, label, stat, dp = 1 }) {
  const v = stat?.avg;
  return (
    <div className="card" style={{ flex: 1, padding: "14px 10px", textAlign: "center" }}>
      <Icon size={16} strokeWidth={1.8} style={{ color, marginBottom: 6 }} />
      <div style={{ fontFamily: NUM, fontSize: 20, fontWeight: 700, color: "var(--c-text)" }}>
        {v == null ? "-" : v.toFixed(dp)}
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: 1, color: "var(--c-text-ghost)", textTransform: "uppercase", marginTop: 2 }}>{label}</div>
      <div style={{ fontFamily: NUM, fontSize: 10, color: "var(--c-text-faint)", marginTop: 5 }}>
        {stat?.min == null ? "" : `${stat.min}-${stat.max}`}
      </div>
    </div>
  );
}

function Totals({ label, value, small }) {
  return (
    <div className="card" style={{ flex: 1, padding: "11px 8px", textAlign: "center" }}>
      <div style={{ fontFamily: NUM, fontSize: small ? 11 : 14, fontWeight: 700, color: "var(--c-text)" }}>{value}</div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: 0.5, color: "var(--c-text-ghost)", textTransform: "uppercase", marginTop: 4 }}>{label}</div>
    </div>
  );
}

function DayRow({ day, onOpen }) {
  return (
    <button type="button" onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left",
      background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)", borderRadius: 14, padding: "11px 13px", cursor: "pointer",
    }}>
      <div style={{ minWidth: 52 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--c-text)" }}>{fmtDate(day.date)}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--c-text-ghost)" }}>{day.samples} min</div>
      </div>
      <div style={{ flex: 1, display: "flex", gap: 12, justifyContent: "flex-end", fontFamily: NUM, fontSize: 12 }}>
        <Metric color={TEMP_COLOR} value={`${day.temp.avg}°`} sub={`${day.temp.min}-${day.temp.max}`} />
        <Metric color={HUM_COLOR} value={`${day.humidity.avg}%`} sub={`${day.humidity.min}-${day.humidity.max}`} />
        <Metric color={VPD_COLOR} value={day.vpd.avg} sub="kPa" />
      </div>
      <ChevronRight size={16} strokeWidth={1.8} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
    </button>
  );
}

function Metric({ color, value, sub }) {
  return (
    <div style={{ textAlign: "right", minWidth: 46 }}>
      <div style={{ color, fontWeight: 700 }}>{value}</div>
      <div style={{ color: "var(--c-text-ghost)", fontSize: 9.5 }}>{sub}</div>
    </div>
  );
}

function DayDetail({ growId, date }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    api.getEnvDay(growId, date).then(d => { if (alive) { setData(d); setLoading(false); } }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [growId, date]);

  if (loading) return <Skeleton height={220} radius={14} />;
  const readings = data?.readings ?? [];
  if (readings.length === 0) return <div style={{ color: "var(--c-text-dim)", padding: 20, textAlign: "center" }}>No readings for this day.</div>;

  return (
    <>
      <div style={{ background: "var(--c-surface-1)", border: "1px solid var(--c-border)", borderRadius: 14, padding: 16 }}>
        <div style={{ display: "flex", gap: 16, marginBottom: 12, fontFamily: MONO, fontSize: 11 }}>
          <span style={{ color: TEMP_COLOR }}>● Temp °F</span>
          <span style={{ color: HUM_COLOR }}>● Humidity %</span>
        </div>
        <DayChart readings={readings} />
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 10, color: "var(--c-text-ghost)", marginTop: 6 }}>
          <span>{fmtTime(readings[0].ts)}</span>
          <span>{readings.length} minutes</span>
          <span>{fmtTime(readings[readings.length - 1].ts)}</span>
        </div>
      </div>
    </>
  );
}

// Dual-line SVG chart. Temp and humidity each scale to their own min/max so both
// trends read clearly over the day. Down-sampled for a smooth, light render.
function DayChart({ readings }) {
  const W = 320, H = 150, padX = 6, padY = 10;
  const stride = Math.max(1, Math.ceil(readings.length / 180));
  const pts = readings.filter((_, i) => i % stride === 0);
  const series = (key) => pts.map(p => p[key]).filter(v => typeof v === "number");
  const temps = series("tempF"), hums = series("humidity");
  if (temps.length < 2 && hums.length < 2) return null;

  function line(key, vals) {
    if (vals.length < 2) return "";
    const min = Math.min(...vals), max = Math.max(...vals);
    const span = max - min || 1;
    const n = pts.length - 1;
    return pts.map((p, i) => {
      const v = p[key];
      if (typeof v !== "number") return null;
      const x = padX + (i / n) * (W - padX * 2);
      const y = padY + (1 - (v - min) / span) * (H - padY * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(" ");
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="150" preserveAspectRatio="none" aria-hidden="true">
      <polyline fill="none" stroke={HUM_COLOR} strokeWidth="1.6" strokeLinejoin="round" points={line("humidity", hums)} opacity="0.9" />
      <polyline fill="none" stroke={TEMP_COLOR} strokeWidth="1.6" strokeLinejoin="round" points={line("tempF", temps)} opacity="0.95" />
    </svg>
  );
}
