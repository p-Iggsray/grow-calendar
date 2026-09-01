import { useState } from "react";
import { ymd } from "../../lib/api.js";
import { useGrowLog } from "../../lib/useGrowLog.js";
import { useEnvDay } from "../../lib/useEnvDay.js";
import {
  LogSection, LogField, AddEntryButton, sumWater,
  WaterEntry, TrainingEntry, PlantHealthEntry,
} from "./logEntries.jsx";
import EnvSensorCard from "./EnvSensorCard.jsx";
import ChoiceField from "../ChoiceField.jsx";
import { NUTRIENT_PRODUCTS } from "../../lib/choices.js";
import { formatWater, loadWaterUnit } from "../../lib/waterUnits.js";

// The structured daily log, edited in place on the journal page: environment
// numbers (or the controller-import rollup), per-plant watering & nutrients,
// training, and health checks. Ported from the removed day-tasks overlay -
// this is now the ONLY writing surface for the daily log.

const fieldNameStyle = {
  fontFamily: "var(--font-ui)", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
};

export default function DayLogEditor({ date, growId, plants = [], environment = "outdoor", active = true }) {
  const { entry: logEntry, setField: setLogField, setFields: setLogFields, status: logStatus } = useGrowLog(date, active, growId);

  // Which plant the per-plant sections are scoped to ("all" or a plant id).
  const [logPlant, setLogPlant] = useState("all");
  const logPlants = (plants ?? []).filter(p => (p.status ?? "growing") === "growing");
  const scoped = logPlant !== "all";
  const selPlant = logPlants.find(p => p.id === logPlant) || null;
  // Match by plant id; fall back to name for legacy rows that predate id linking.
  const matches = (e) => !scoped || e.plantId === logPlant || (!e.plantId && (e.plant ?? "") === (selPlant?.name ?? ""));
  // New per-plant rows carry the plant's id (when scoped) so they link to the
  // plant's history; name is kept for display + back-compat.
  const newRow = (extra) => ({ plant: selPlant?.name ?? "", ...(scoped ? { plantId: logPlant } : {}), ...extra });

  // Indoor and greenhouse grows pull the day's environment from the controller
  // import (temp/RH/VPD) instead of hand-typed numbers.
  const sensorGrow = environment !== "outdoor";
  const { day: envDay } = useEnvDay(growId, date ? ymd(date) : null, sensorGrow && active);

  // Per-plant watering. water_gal is kept as the day's total (sum of all
  // plants) so the stats "total water" aggregation keeps working.
  function addWater()           { const a = [...(logEntry.water_plants ?? []), newRow({ gal: "" })]; setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  // "__row" replaces the whole row: the amount and its unit have to move
  // together or the canonical gallons drift out of step with what is shown.
  function updateWater(i, k, v) {
    const a = [...(logEntry.water_plants ?? [])];
    a[i] = k === "__row" ? v : { ...a[i], [k]: v };
    setLogFields({ water_plants: a, water_gal: sumWater(a) });
  }
  function removeWater(i)       { const a = [...(logEntry.water_plants ?? [])]; a.splice(i, 1); setLogFields({ water_plants: a, water_gal: sumWater(a) }); }

  function addTraining()           { setLogField("training", [...(logEntry.training ?? []), newRow({ action: "" })]); }
  function updateTraining(i, k, v) { const a = [...(logEntry.training ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("training", a); }
  function removeTraining(i)       { const a = [...(logEntry.training ?? [])]; a.splice(i, 1); setLogField("training", a); }
  function addHealth()             { setLogField("plant_health", [...(logEntry.plant_health ?? []), newRow({ color: "", trichomes: "", notes: "" })]); }
  function updateHealth(i, k, v)   { const a = [...(logEntry.plant_health ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("plant_health", a); }
  function removeHealth(i)         { const a = [...(logEntry.plant_health ?? [])]; a.splice(i, 1); setLogField("plant_health", a); }

  return (
    <div>
      {/* Save status */}
      <div style={{ display: "flex", justifyContent: "flex-end", minHeight: 15, marginBottom: -6 }}>
        <span style={{ fontFamily: "var(--font-ui)", fontSize: 11, color: logStatus === "error" ? "#f87171" : logStatus === "saved" ? "var(--c-accent)" : "#5a7a5a" }}>
          {logStatus === "saving" ? "Saving…" : logStatus === "saved" ? "Saved" : logStatus === "error" ? "Save failed" : ""}
        </span>
      </div>

      {/* ── Environment ── */}
      <LogSection label="Environment" first>
        {sensorGrow && envDay ? (
          <EnvSensorCard day={envDay} logEntry={logEntry} onFill={setLogFields} />
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <LogField label="Temp High (°F)" name="temp_high" entry={logEntry} setField={setLogField} step={1} min={0} max={130} inputMode="numeric" />
              <LogField label="Temp Low (°F)"  name="temp_low"  entry={logEntry} setField={setLogField} step={1} min={0} max={130} inputMode="numeric" />
            </div>
            <div style={{ maxWidth: "50%", paddingRight: 5 }}>
              <LogField label="Humidity (%)" name="humidity" entry={logEntry} setField={setLogField} step={1} min={0} max={100} inputMode="numeric" />
            </div>
            <div style={{ fontSize: 11, color: "var(--c-text-ghost)", marginTop: 8, lineHeight: 1.6 }}>
              {sensorGrow
                ? "No imported readings for this day. Import your controller CSV in More, Environment and this fills in automatically."
                : "Outdoor grow: log the day's conditions by hand."}
            </div>
          </>
        )}
      </LogSection>

      {/* ── Plant selector for the per-plant sections below ── */}
      {logPlants.length > 0 && (
        <div style={{ margin: "16px 0" }}>
          <div style={{ ...fieldNameStyle, marginBottom: 8 }}>Log entries for</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ key: "all", label: "All plants" }, ...logPlants.map(p => ({ key: p.id, label: p.name || "Unnamed" }))].map(opt => {
              const isOn = logPlant === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setLogPlant(opt.key)}
                  style={{
                    padding: "8px 14px", borderRadius: 16,
                    background: isOn ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
                    border: isOn ? "1px solid rgba(74,222,128,0.5)" : "1px solid var(--c-border-strong)",
                    color: isOn ? "var(--c-accent)" : "var(--c-text-muted)",
                    fontFamily: "var(--font-ui)", fontSize: 12, letterSpacing: 0.5,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Watering & Nutrients ── */}
      <LogSection label="Watering & Nutrients">
        {(logEntry.water_plants ?? []).map((w, i) => ({ w, i }))
          .filter(({ w }) => matches(w))
          .map(({ w, i }) => (
            <WaterEntry
              key={i}
              entry={w}
              hidePlant={scoped}
              plants={logPlants}
              onChangeField={(k, v) => updateWater(i, k, v)}
              onRemove={() => removeWater(i)}
            />
          ))}
        <AddEntryButton onClick={addWater} label={scoped ? `ADD WATERING FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD PLANT WATERING"} />
        {sumWater(logEntry.water_plants) && (
          <div style={{
            marginTop: 10, textAlign: "right",
            fontFamily: "var(--font-ui)", fontSize: 12,
            letterSpacing: 0.5, color: "var(--c-text-faint)",
          }}>
            Total: {formatWater(sumWater(logEntry.water_plants), loadWaterUnit())}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <span style={{ ...fieldNameStyle, display: "block", marginBottom: 5 }}>Feed / Nutrients</span>
          <ChoiceField
            value={logEntry.feed ?? ""}
            onChange={(v) => setLogField("feed", v)}
            presets={NUTRIENT_PRODUCTS}
            fieldKey="nutrient-mix"
            placeholder="Choose what you fed"
            searchLabel="Search nutrients"
          />
        </div>
      </LogSection>

      {/* ── Plant Training ── */}
      <LogSection label="Plant Training">
        {(logEntry.training ?? []).map((t, i) => ({ t, i }))
          .filter(({ t }) => matches(t))
          .map(({ t, i }) => (
            <TrainingEntry
              key={i}
              entry={t}
              hidePlant={scoped}
              plants={logPlants}
              onChangeField={(k, v) => updateTraining(i, k, v)}
              onRemove={() => removeTraining(i)}
            />
          ))}
        <AddEntryButton onClick={addTraining} label={scoped ? `ADD TRAINING FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD TRAINING ENTRY"} />
      </LogSection>

      {/* ── Plant Health ── */}
      <LogSection label="Plant Health">
        {(logEntry.plant_health ?? []).map((h, i) => ({ h, i }))
          .filter(({ h }) => matches(h))
          .map(({ h, i }) => (
            <PlantHealthEntry
              key={i}
              entry={h}
              hidePlant={scoped}
              plants={logPlants}
              onChangeField={(k, v) => updateHealth(i, k, v)}
              onRemove={() => removeHealth(i)}
            />
          ))}
        <AddEntryButton onClick={addHealth} label={scoped ? `ADD HEALTH FOR ${(selPlant?.name || "PLANT").toUpperCase()}` : "ADD HEALTH OBSERVATION"} />
      </LogSection>
    </div>
  );
}
