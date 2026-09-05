import { Thermometer } from "lucide-react";
import { useGrowLog } from "../../lib/useGrowLog.js";
import { climateHint } from "../../lib/growEnvironment.js";

const UI = "var(--font-ui)";

// A space that makes its own weather has to be read off its own instruments.
// This is that: three numbers, right on the day's page, typed straight in.
//
// It sits out in the open rather than behind the daily log, because unlike
// watering or training this is something you do EVERY day, and a thing you do
// every day should not cost two taps to reach. It writes the same
// temp_high / temp_low / humidity fields the daily log has always used, so
// stats, the report and the CSV export need to know nothing about any of this.
function Reading({ label, unit, name, entry, setField, min, max, autoFocus }) {
  const id = `conditions-${name}`;
  return (
    <label htmlFor={id} style={{ flex: 1, minWidth: 0, display: "block" }}>
      <span style={{
        display: "block", fontFamily: UI, fontSize: 10.5, fontWeight: 600,
        letterSpacing: 0.8, textTransform: "uppercase",
        color: "var(--c-text-faint)", marginBottom: 5,
      }}>
        {label}
      </span>
      <span style={{ position: "relative", display: "block" }}>
        <input
          id={id}
          type="number"
          inputMode="numeric"
          step={1}
          min={min}
          max={max}
          autoFocus={autoFocus}
          value={entry[name] ?? ""}
          onChange={(e) => setField(name, e.target.value)}
          style={{
            width: "100%", boxSizing: "border-box",
            background: "var(--c-input-bg)", color: "var(--c-text)",
            border: "1px solid var(--c-border-strong)", borderRadius: 10,
            padding: "10px 26px 10px 11px", fontSize: 16, fontFamily: UI, outline: "none",
          }}
        />
        <span aria-hidden="true" style={{
          position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)",
          fontFamily: UI, fontSize: 12.5, color: "var(--c-text-ghost)", pointerEvents: "none",
        }}>
          {unit}
        </span>
      </span>
    </label>
  );
}

export default function ConditionsCard({ date, growId, environment, active = true }) {
  const { entry, setField, status } = useGrowLog(date, active, growId);

  return (
    <div className="card" style={{ padding: "13px 14px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
        <Thermometer size={13} strokeWidth={2} style={{ color: "var(--c-info)", flexShrink: 0 }} />
        <span style={{
          flex: 1, fontFamily: UI, fontSize: 11, letterSpacing: 2,
          textTransform: "uppercase", color: "var(--c-text-muted)",
        }}>
          Conditions
        </span>
        <span style={{
          fontFamily: UI, fontSize: 10, letterSpacing: 1,
          color: status === "error" ? "var(--c-danger-soft)" : status === "saved" ? "var(--c-accent)" : "var(--c-text-ghost)",
        }}>
          {status === "saving" ? "Saving…" : status === "saved" ? "Saved" : status === "error" ? "Save failed" : ""}
        </span>
      </div>

      <div style={{ display: "flex", gap: 9 }}>
        <Reading label="High" unit="&deg;F" name="temp_high" entry={entry} setField={setField} min={0} max={130} />
        <Reading label="Low" unit="&deg;F" name="temp_low" entry={entry} setField={setField} min={0} max={130} />
        <Reading label="Humidity" unit="%" name="humidity" entry={entry} setField={setField} min={0} max={100} />
      </div>

      <div style={{ fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)", marginTop: 9, lineHeight: 1.55 }}>
        {climateHint(environment)}
      </div>
    </div>
  );
}
