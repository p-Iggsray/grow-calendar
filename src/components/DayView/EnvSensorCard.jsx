import { Thermometer, Droplets, Gauge, Check } from "lucide-react";

// Indoor / greenhouse grows: the day's environment comes from the controller
// import (VIVOSUN style CSV) instead of hand-typed numbers. Shows the imported
// rollup and offers a one-tap "Save to log" so stats and the report still get
// temp_high / temp_low / humidity in the daily log.
export default function EnvSensorCard({ day, logEntry, onFill }) {
  const t = day.temp ?? {};
  const h = day.humidity ?? {};
  const v = day.vpd ?? {};

  const fill = {
    temp_high: t.max != null ? Math.round(t.max) : null,
    temp_low: t.min != null ? Math.round(t.min) : null,
    humidity: h.avg != null ? Math.round(h.avg) : null,
  };
  const inSync =
    (logEntry?.temp_high ?? null) === fill.temp_high &&
    (logEntry?.temp_low ?? null) === fill.temp_low &&
    (logEntry?.humidity ?? null) === fill.humidity;

  return (
    <div style={{
      background: "rgba(56,189,248,0.06)", border: "1px solid rgba(56,189,248,0.18)",
      borderRadius: 14, padding: "12px 14px",
    }}>
      <div style={{ display: "flex", gap: 8 }}>
        <Metric icon={Thermometer} color="#f97316" label="Temp"
          value={t.avg != null ? `${t.avg}` : "-"} sub={t.min != null ? `${t.min} to ${t.max} F` : ""} />
        <Metric icon={Droplets} color="#38bdf8" label="Humidity"
          value={h.avg != null ? `${h.avg}%` : "-"} sub={h.min != null ? `${h.min} to ${h.max}` : ""} />
        <Metric icon={Gauge} color="#a855f7" label="VPD"
          value={v.avg != null ? `${v.avg}` : "-"} sub="kPa" />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginTop: 11 }}>
        <span style={{ fontSize: 11, color: "var(--c-text-faint)" }}>
          {day.samples} readings from your controller import
        </span>
        {inSync ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5, flexShrink: 0,
            fontSize: 11.5, fontWeight: 600, color: "var(--c-accent)",
          }}>
            <Check size={13} strokeWidth={2.5} /> In the log
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onFill(fill)}
            style={{
              flexShrink: 0, padding: "7px 12px", borderRadius: 10,
              background: "rgba(56,189,248,0.14)", border: "1px solid rgba(56,189,248,0.35)",
              color: "var(--c-info)", fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>
            Save to log
          </button>
        )}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, color, label, value, sub }) {
  return (
    <div style={{ flex: 1, textAlign: "center" }}>
      <Icon size={14} strokeWidth={1.8} style={{ color, marginBottom: 3 }} />
      <div style={{ fontFamily: "var(--font-num)", fontSize: 16, fontWeight: 700, color: "var(--c-text)" }}>{value}</div>
      <div style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--c-text-ghost)", marginTop: 1 }}>{label}</div>
      {sub && <div style={{ fontFamily: "var(--font-num)", fontSize: 10, color: "var(--c-text-faint)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
