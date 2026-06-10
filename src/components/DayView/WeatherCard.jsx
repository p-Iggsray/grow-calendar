// --- Weather card (Threats tab, today + future only) ---

const SEVERITY_COLOR = {
  Extreme: "#ef4444",
  Severe:  "#f97316",
  Moderate:"#facc15",
  Minor:   "#a3e635",
};

function alertSeverityColor(severity) {
  return SEVERITY_COLOR[severity] ?? "#facc15";
}

function fmt12h(iso) {
  const d = new Date(iso);
  const h = d.getHours();
  const ampm = h < 12 ? "am" : "pm";
  return `${h % 12 || 12}${ampm}`;
}

export function WeatherCard({ weather, loading }) {
  if (loading) {
    return (
      <div style={{
        background: "rgba(56,189,248,0.06)", borderRadius: 10,
        border: "1px solid rgba(56,189,248,0.15)", padding: "12px 14px",
        fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-info-dim)",
        letterSpacing: 1, textTransform: "uppercase",
      }}>
        Loading weather…
      </div>
    );
  }

  if (!weather) return null;

  const { alerts, hourly, highLow } = weather;
  const hasAlerts = alerts.length > 0;
  const hasHighLow = highLow.high !== null;
  const hasHourly = hourly.length > 0;

  if (!hasAlerts && !hasHighLow && !hasHourly) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* NWS alerts */}
      {hasAlerts && alerts.map(alert => (
        <div key={alert.id} style={{
          background: `${alertSeverityColor(alert.severity)}11`,
          border: `1px solid ${alertSeverityColor(alert.severity)}44`,
          borderRadius: 10, padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 14 }}>⚠️</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: alertSeverityColor(alert.severity), fontFamily: "'Courier New', monospace", letterSpacing: 0.5 }}>
              {alert.event}
            </span>
            {alert.severity && (
              <span style={{ fontSize: 11, fontFamily: "'Courier New', monospace", letterSpacing: 1, color: alertSeverityColor(alert.severity), opacity: 0.8 }}>
                {alert.severity.toUpperCase()}
              </span>
            )}
          </div>
          {alert.headline && (
            <div style={{ fontSize: 12, color: "var(--c-text-dim)", lineHeight: 1.6 }}>
              {alert.headline}
            </div>
          )}
        </div>
      ))}

      {/* Today's high/low + hourly strip */}
      {(hasHighLow || hasHourly) && (
        <div style={{
          background: "rgba(56,189,248,0.06)", borderRadius: 10,
          border: "1px solid rgba(56,189,248,0.15)", padding: "10px 12px",
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasHourly ? 10 : 0 }}>
            <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, letterSpacing: 1.5, color: "var(--c-info-dim)", textTransform: "uppercase" }}>
              NWS Forecast
            </span>
            {hasHighLow && (
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 12, color: "var(--c-text-dim)" }}>
                <span style={{ color: "var(--c-temp-hot)" }}>↑{highLow.high}°</span>
                {" "}
                <span style={{ color: "var(--c-info)" }}>↓{highLow.low}°</span>
              </span>
            )}
          </div>

          {hasHourly && (
            <div style={{ display: "flex", gap: 6, overflowX: "auto", paddingBottom: 2 }}>
              {hourly.map((h, i) => (
                <div key={i} style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 3, minWidth: 44, flexShrink: 0,
                }}>
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: "var(--c-info-dim)" }}>
                    {fmt12h(h.startTime)}
                  </span>
                  <span style={{ fontSize: 14 }}>
                    {h.isDaytime ? "☀️" : "🌙"}
                  </span>
                  <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, fontWeight: 700, color: "var(--c-text-dim)" }}>
                    {h.temp}°
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
