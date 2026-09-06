import { useState } from "react";
import { ymd } from "../../lib/api.js";
import { useGrowLog } from "../../lib/useGrowLog.js";
import { useEnvDay } from "../../lib/useEnvDay.js";
import {
  LogSection, AddEntryButton, sumWater,
  WaterEntry, WaterAllPlants, TrainingEntry, PlantHealthEntry,
} from "./logEntries.jsx";
import EnvSensorCard from "./EnvSensorCard.jsx";
import ChoiceField from "../ChoiceField.jsx";
import { NUTRIENT_PRODUCTS, TUB_CONDITIONS } from "../../lib/choices.js";
import { displayUnit, fanOutWater, formatWater, loadWaterUnit, waterRow } from "../../lib/waterUnits.js";
import { cropOf, words } from "../../lib/crops.js";
import { readsOwnClimate } from "../../lib/growEnvironment.js";

// The structured daily log, edited in place on the journal page: environment
// numbers (or the controller-import rollup), per-plant watering & nutrients,
// training, and health checks. Ported from the removed day-tasks overlay -
// this is now the ONLY writing surface for the daily log.

const fieldNameStyle = {
  fontFamily: "var(--font-ui)", fontSize: 11,
  letterSpacing: 1, color: "var(--c-text-muted)", textTransform: "uppercase",
};

export default function DayLogEditor({ date, growId, plants = [], environment = "outdoor", crop, hasWeatherLocation = true, active = true }) {
  const w = words(crop);
  const mushrooms = cropOf(crop) === "mushrooms";
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

  // Indoor and greenhouse grows can pull the day's environment from a
  // controller import (temp/RH/VPD); either way they read their own climate,
  // which the Conditions card at the top of the day owns.
  const sensorGrow = environment !== "outdoor";
  const ownClimate = readsOwnClimate(environment);
  const { day: envDay } = useEnvDay(growId, date ? ymd(date) : null, sensorGrow && active);

  // Per-plant watering. water_gal is kept as the day's total (sum of all
  // plants) so the stats "total water" aggregation keeps working.
  function setWater(a) { setLogFields({ water_plants: a, water_gal: sumWater(a) }); }
  // A fresh row starts in the unit you last watered in, so a litre grow never
  // has to correct the unit on every row it adds.
  function addWater()           { setWater([...(logEntry.water_plants ?? []), newRow({ amount: "", unit: loadWaterUnit(crop), gal: "" })]); }
  // "All plants got 3 L" is several waterings, and it is recorded as several:
  // one row per plant, each holding the amount that plant actually received.
  function addWaterForAll(amount, unit) {
    const rows = logPlants.length
      ? fanOutWater(logPlants, amount, unit)
      : [waterRow(newRow({}), amount, unit)];
    setWater([...(logEntry.water_plants ?? []), ...rows]);
  }
  // "__row" replaces the whole row: the amount and its unit have to move
  // together or the canonical gallons drift out of step with what is shown.
  function updateWater(i, k, v) {
    const a = [...(logEntry.water_plants ?? [])];
    a[i] = k === "__row" ? v : { ...a[i], [k]: v };
    setWater(a);
  }
  function removeWater(i)       { const a = [...(logEntry.water_plants ?? [])]; a.splice(i, 1); setWater(a); }

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

      {/* ── Environment ──
          Nobody types a climate number here any more. A space with its own
          climate reads its instruments into the Conditions card at the top of
          the day; a space under the sky has its high, low and humidity pulled
          from its location. So all that is left for this section is a
          controller import, when there is one, and a line saying where an
          outdoor grow's numbers come from. */}
      {sensorGrow && envDay ? (
        <LogSection label="Environment" first>
          <EnvSensorCard day={envDay} logEntry={logEntry} onFill={setLogFields} />
        </LogSection>
      ) : !ownClimate ? (
        <LogSection label="Weather" first>
          <div style={{
            border: "1px solid var(--c-border)", borderRadius: 10,
            padding: "11px 12px", fontSize: 11.5, lineHeight: 1.6,
            color: "var(--c-text-ghost)",
          }}>
            <span style={{ display: "block", color: "var(--c-text-muted)", marginBottom: 3 }}>
              Nothing to type here.
            </span>
            {hasWeatherLocation ? (
              <>
                This grow is outdoors, so the day&rsquo;s high, low and humidity are its
                location&rsquo;s weather. They are pulled in and logged for you, and shown
                in the Weather card on this day.
              </>
            ) : (
              <>
                This grow is outdoors, so its high, low and humidity are the weather
                where it grows rather than anything to type. Add the grow&rsquo;s location
                (the banner on the Calendar page) and every day logs its own.
              </>
            )}
          </div>
        </LogSection>
      ) : null}

      {/* ── Plant selector for the per-plant sections below ── */}
      {logPlants.length > 0 && (
        <div style={{ margin: "16px 0" }}>
          <div style={{ ...fieldNameStyle, marginBottom: 8 }}>Log entries for</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {[{ key: "all", label: `All ${w.units}` }, ...logPlants.map(p => ({ key: p.id, label: p.name || "Unnamed" }))].map(opt => {
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
      <LogSection label={w.waterSection}>
        {(logEntry.water_plants ?? []).map((w, i) => ({ w, i }))
          .filter(({ w }) => matches(w))
          .map(({ w, i }) => (
            <WaterEntry
              key={i}
              entry={w}
              hidePlant={scoped}
              plants={logPlants}
              unitWord={w.unit}
              crop={crop}
              onChangeField={(k, v) => updateWater(i, k, v)}
              onRemove={() => removeWater(i)}
            />
          ))}
        {!scoped && logPlants.length > 0 && (
          <WaterAllPlants count={logPlants.length} title={w.waterAllTitle} unitWord={w.unit} crop={crop} onAdd={addWaterForAll} />
        )}
        <AddEntryButton
          onClick={addWater}
          label={scoped
            ? `ADD ${w.waterNoun.toUpperCase()} FOR ${(selPlant?.name || w.Unit).toUpperCase()}`
            : `ADD ONE ${w.Unit.toUpperCase()}'S ${w.waterNoun.toUpperCase()}`}
        />
        {sumWater(logEntry.water_plants) && (
          <div style={{
            marginTop: 10, textAlign: "right",
            fontFamily: "var(--font-ui)", fontSize: 12,
            letterSpacing: 0.5, color: "var(--c-text-faint)",
          }}>
            {/* Read out in the unit the day was actually logged in, never in
                whatever unit happens to be remembered. */}
            Total: {formatWater(sumWater(logEntry.water_plants), displayUnit(logEntry.water_plants, loadWaterUnit(crop)))}
          </div>
        )}
        <div style={{ marginTop: 14 }}>
          <span style={{ ...fieldNameStyle, display: "block", marginBottom: 5 }}>
            {mushrooms ? "Fresh air / conditions note" : "Feed / Nutrients"}
          </span>
          <ChoiceField
            value={logEntry.feed ?? ""}
            onChange={(v) => setLogField("feed", v)}
            presets={mushrooms ? TUB_CONDITIONS : NUTRIENT_PRODUCTS}
            fieldKey={mushrooms ? "tub-conditions" : "nutrient-mix"}
            placeholder={mushrooms ? "What you did for the tub today" : "Choose what you fed"}
            searchLabel={mushrooms ? "Search notes" : "Search nutrients"}
          />
        </div>
      </LogSection>

      {/* ── Training: a tub is not shaped, so there is nothing to record ── */}
      {!mushrooms && (
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
      )}

      {/* ── Health ── */}
      <LogSection label={w.healthSection}>
        {(logEntry.plant_health ?? []).map((h, i) => ({ h, i }))
          .filter(({ h }) => matches(h))
          .map(({ h, i }) => (
            <PlantHealthEntry
              key={i}
              entry={h}
              crop={crop}
              hidePlant={scoped}
              plants={logPlants}
              onChangeField={(k, v) => updateHealth(i, k, v)}
              onRemove={() => removeHealth(i)}
            />
          ))}
        <AddEntryButton onClick={addHealth} label={scoped ? `ADD HEALTH FOR ${(selPlant?.name || w.Unit).toUpperCase()}` : "ADD HEALTH OBSERVATION"} />
      </LogSection>
    </div>
  );
}
