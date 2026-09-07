// The measured facts of one day, read as a record rather than as a form.
//
// A journal page has two halves that want different typography: the numbers
// somebody logged, and the words somebody wrote. This folds the first half into
// a short list that can be set at the head of the page, so what went in, what
// it was fed and what the air was doing are the first things read, standing
// clear of the prose underneath.
//
// Every value keeps the unit it was written in. Nothing is converted for
// display, summed across plants, or filled in from anywhere.
//
// Pure - no React - so it is tested directly.

import { words } from "./crops.js";
import { displayUnit, fromGallons, rowDisplay, unitLabel } from "./waterUnits.js";

function num(v) {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

// A watering row worth printing: one that names a plant or carries an amount.
// A row naming no plant is a whole-grow watering, which is a real thing to
// record, not an empty row.
function keptWaterRows(log) {
  return (log?.water_plants ?? []).filter(
    (r) => r && (r.plant || r.plantId || rowDisplay(r).amount != null),
  );
}

/**
 * The air, from whichever instrument actually read it.
 *
 * A space's own log wins: a tent's thermometer knows the tent, and the
 * forecast does not. An outdoor space logs nothing itself, so it reads back
 * what the sky recorded for it, and says so.
 */
export function climateLine(log, weather) {
  for (const [source, from] of [["logged", log], ["forecast", weather]]) {
    const high = num(from?.temp_high ?? from?.high);
    const low = num(from?.temp_low ?? from?.low);
    const humidity = num(from?.humidity);
    if (high == null && low == null && humidity == null) continue;
    const temp = high != null && low != null
      ? `${Math.round(high)}° / ${Math.round(low)}°`
      : high != null ? `${Math.round(high)}°`
      : low != null ? `${Math.round(low)}°`
      : null;
    const rh = humidity != null ? `${Math.round(humidity)}% RH` : null;
    return { text: [temp, rh].filter(Boolean).join(" · "), source };
  }
  return null;
}

/**
 * One day's log as an ordered list of record rows.
 *
 * Water comes first because it is what most days are about, and it is listed
 * plant by plant: a single total never says which plant got what. Rows are
 * omitted entirely when there is nothing to say, so the head of the page is
 * never a column of dashes.
 */
export function recordRows({ log, weather, crop } = {}) {
  const w = words(crop);
  const rows = [];
  // Which of these values were read out of the day's writing rather than typed
  // into the log form. The page says so on each one: a number that filled
  // itself in should never be indistinguishable from one you entered.
  const readFrom = log?.read_from ?? {};
  const wasRead = (...keys) => keys.some((k) => readFrom[k] === true);

  const watered = keptWaterRows(log);
  if (watered.length > 0) {
    rows.push({
      key: "water",
      label: w.waterField,
      read: wasRead("water"),
      items: watered.map((r) => {
        const { amount, unit } = rowDisplay(r);
        return {
          name: String(r.plant ?? "").trim() || `All ${w.units}`,
          amount: amount == null || amount === "" ? null : `${amount} ${unitLabel(unit)}`,
        };
      }),
    });
  } else if (num(log?.water_gal) != null && num(log.water_gal) > 0) {
    // A day logged before waterings were recorded per plant: a total is all
    // there is, so say it as a total rather than inventing a plant for it.
    const unit = displayUnit(log.water_plants, "gal");
    rows.push({
      key: "water",
      label: w.waterField,
      read: wasRead("water"),
      items: [{ name: `All ${w.units}`, amount: `${fromGallons(log.water_gal, unit)} ${unitLabel(unit)}` }],
    });
  }

  const feed = String(log?.feed ?? "").trim();
  if (feed) rows.push({ key: "feed", label: "Feed", text: feed, read: wasRead("feed") });

  const trained = (log?.training ?? []).filter((t) => t && String(t.action ?? "").trim());
  if (trained.length > 0) {
    rows.push({
      key: "training",
      label: "Training",
      read: wasRead("training"),
      items: trained.map((t) => ({
        name: String(t.plant ?? "").trim() || `All ${w.units}`,
        detail: String(t.action).trim(),
      })),
    });
  }

  const checked = (log?.plant_health ?? []).filter(
    (h) => h && (h.plant || h.plantId || h.color || h.trichomes || h.notes),
  );
  if (checked.length > 0) {
    rows.push({
      key: "health",
      label: "Health",
      read: wasRead("plant_health"),
      items: checked.map((h) => ({
        name: String(h.plant ?? "").trim() || w.Unit,
        detail: [
          h.color,
          h.trichomes ? `${h.trichomes} trichomes` : null,
          h.notes,
        ].filter(Boolean).join(" · ") || "checked over",
      })),
    });
  }

  const climate = climateLine(log, weather);
  if (climate) rows.push({
      key: "climate", label: "Climate", text: climate.text, source: climate.source,
      read: climate.source === "logged" && wasRead("temp_high", "temp_low", "humidity"),
    });

  return rows;
}
