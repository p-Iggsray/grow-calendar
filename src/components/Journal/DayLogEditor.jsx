import { ymd } from "../../lib/api.js";
import { useGrowLog } from "../../lib/useGrowLog.js";
import { useEnvDay } from "../../lib/useEnvDay.js";
import {
  LogSection, AddEntryButton, sumWater,
  WaterEntry, WaterAllPlants, TrainingEntry, TrainingAllPlants,
  PlantHealthEntry, HealthAllPlants,
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

  const logPlants = (plants ?? []).filter(p => (p.status ?? "growing") === "growing");
  // Every entry says which plant it is about, on the entry itself. There used
  // to be one selector at the top that scoped all three sections at once, which
  // meant the answer to "which plant?" lived somewhere other than the thing it
  // described, and you had to remember which mode you were in.
  const newRow = (extra) => ({ plant: "", ...extra });
  // One row per plant, carrying the plant's id so it links to that plant's own
  // history. This is what "for all of them" means everywhere in the log: not
  // one shared row, but a real record against each.
  const forEveryPlant = (extra) => logPlants.map((p) => ({
    plant: p.name ?? "", ...(p.id ? { plantId: p.id } : {}), ...extra,
  }));

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
  function addTrainingForAll(action) {
    const rows = logPlants.length ? forEveryPlant({ action }) : [newRow({ action })];
    setLogField("training", [...(logEntry.training ?? []), ...rows]);
  }
  function updateTraining(i, k, v) { const a = [...(logEntry.training ?? [])]; a[i] = { ...a[i], [k]: v }; setLogField("training", a); }
  function removeTraining(i)       { const a = [...(logEntry.training ?? [])]; a.splice(i, 1); setLogField("training", a); }
  function addHealth()             { setLogField("plant_health", [...(logEntry.plant_health ?? []), newRow({ color: "", trichomes: "", notes: "" })]); }
  function addHealthForAll(fields) {
    const rows = logPlants.length ? forEveryPlant(fields) : [newRow(fields)];
    setLogField("plant_health", [...(logEntry.plant_health ?? []), ...rows]);
  }
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

      {/* ── Watering & Nutrients ── */}
      <LogSection label={w.waterSection}>
        {/* `row`, not `w`: `w` is this component's crop vocabulary, and a map
            variable of the same name quietly handed WaterEntry the water unit
            where the word for a plant belonged - which is why a cannabis row
            asked about a "Tub". */}
        {(logEntry.water_plants ?? []).map((row, i) => (
            <WaterEntry
              key={i}
              entry={row}
              plants={logPlants}
              unitWord={w.unit}
              crop={crop}
              onChangeField={(k, v) => updateWater(i, k, v)}
              onRemove={() => removeWater(i)}
            />
          ))}
        {logPlants.length > 0 && (
          <WaterAllPlants count={logPlants.length} title={w.waterAllTitle} unitWord={w.unit} crop={crop} onAdd={addWaterForAll} />
        )}
        <AddEntryButton onClick={addWater} label={`ADD ONE ${w.Unit.toUpperCase()}'S ${w.waterNoun.toUpperCase()}`} />
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
        {(logEntry.training ?? []).map((t, i) => (
            <TrainingEntry
              key={i}
              entry={t}
              plants={logPlants}
              onChangeField={(k, v) => updateTraining(i, k, v)}
              onRemove={() => removeTraining(i)}
            />
          ))}
        {logPlants.length > 0 && (
          <TrainingAllPlants count={logPlants.length} unitWord={w.unit} onAdd={addTrainingForAll} />
        )}
        <AddEntryButton onClick={addTraining} label={`ADD ONE ${w.Unit.toUpperCase()}'S TRAINING`} />
      </LogSection>
      )}

      {/* ── Health ── */}
      <LogSection label={w.healthSection}>
        {(logEntry.plant_health ?? []).map((h, i) => (
            <PlantHealthEntry
              key={i}
              entry={h}
              crop={crop}
              plants={logPlants}
              onChangeField={(k, v) => updateHealth(i, k, v)}
              onRemove={() => removeHealth(i)}
            />
          ))}
        {logPlants.length > 0 && (
          <HealthAllPlants count={logPlants.length} unitWord={w.unit} crop={crop} onAdd={addHealthForAll} />
        )}
        <AddEntryButton onClick={addHealth} label={`ADD ONE ${w.Unit.toUpperCase()}'S HEALTH CHECK`} />
      </LogSection>
    </div>
  );
}
