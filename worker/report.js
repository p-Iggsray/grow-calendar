// @ts-check
// Comprehensive, print-optimised HTML report for a single grow. Pulls the full
// profile/setup, the recorded stage timeline, a day-by-day journal of
// everything logged, and season stats into one styled document that the grower
// can read in a tab and "Save as PDF". Nothing in it is predicted: every date
// shown is a date the grower recorded. Photographs are linked rather than
// embedded - see the note above the photo query for why.
import { error } from "./util.js";
import { photoUrl } from "./photoStore.js";
import { parseDate } from "../src/lib/dates-core.js";
import { loadStageTimeline } from "./stages.js";
import { dayOfGrow, stageGroup, stageLabel, stageOnDate } from "../src/lib/stageTimeline.js";
import { growLocation, strainSummary } from "../src/lib/growProfile.js";
import { catMarkSvg } from "../src/lib/catMark.js";
import { displayUnit, formatWater, isWaterUnit } from "../src/lib/waterUnits.js";
import { cropOf, flushTotals, words } from "../src/lib/crops.js";
import { ensureGrowEventsSchema } from "./events.js";
import { rowToEntry } from "./growLog.js";
import { recordRows } from "../src/lib/dayRecord.js";
import { noteToHtml } from "../src/lib/richText.js";
import { weeksAndDays } from "../src/lib/dates-core.js";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAY_MS = 86400000;

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}
function parseField(raw) {
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function ymdOf(d) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function asDate(d) {
  if (d instanceof Date) return Number.isNaN(d.getTime()) ? null : d;
  if (typeof d === "string") { const p = parseDate(d); return p && !Number.isNaN(p.getTime()) ? p : null; }
  return null;
}
function fmtNice(d) {
  const date = asDate(d);
  if (!date) return esc(String(d ?? ""));
  return `${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
function fmtLong(d) {
  const date = asDate(d);
  if (!date) return esc(String(d ?? ""));
  return `${WEEKDAYS[date.getDay()]} · ${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}
function humanize(key) {
  return String(key)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, c => c.toUpperCase())
    .trim();
}
function tryArr(s) {
  if (Array.isArray(s)) return s;
  if (!s) return [];
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : []; } catch { return []; }
}
function num(v) { return v == null || v === "" ? null : (Number.isFinite(+v) ? +v : null); }

// A plant_log row's detail, parsed. Flushes carry their number and weights
// there, the same shape the app writes.
function shapeEntry(row) {
  let detail = null;
  if (row?.detail) { try { detail = JSON.parse(row.detail); } catch { detail = null; } }
  return { kind: row?.kind ?? "note", detail };
}
function flushText(row) {
  const e = shapeEntry(row);
  if (e.kind !== "flush" || !e.detail) return "";
  const d = e.detail;
  return [
    d.flush ? `Flush ${d.flush}` : "Flush",
    d.wetG ? `${d.wetG} g wet` : null,
    d.dryG ? `${d.dryG} g dry` : null,
  ].filter(Boolean).join(" · ");
}


function chip(stage) {
  const label = stageLabel(stage);
  const group = stageGroup(stage);
  if (!label || !group) return "";
  return `<span class="chip" style="background:${group.color}1f;color:${group.color};border-color:${group.color}">${esc(label)}</span>`;
}

const HEALTH = {
  thriving: { label: "Thriving", bg: "#dcfce7", fg: "#14532d", bd: "#22c55e" },
  healthy:  { label: "Healthy",  bg: "#e9f7ee", fg: "#166534", bd: "#4ade80" },
  stressed: { label: "Stressed", bg: "#fef3c7", fg: "#7c3a00", bd: "#f59e0b" },
  sick:     { label: "Sick",     bg: "#fee2e2", fg: "#991b1b", bd: "#ef4444" },
};
function healthBadge(h) {
  const v = HEALTH[h];
  if (!v) return `<span class="hbadge">${esc(humanize(h))}</span>`;
  return `<span class="hbadge" style="background:${v.bg};color:${v.fg};border-color:${v.bd}">${v.label}</span>`;
}

// Render an arbitrary survey value as readable text (handles strings, numbers,
// booleans, primitive arrays, and arrays/objects of simple shape).
function renderValue(v) {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" || typeof v === "string") return esc(String(v));
  if (Array.isArray(v)) {
    const parts = v.map(item => {
      if (item == null) return "";
      if (typeof item === "object") {
        const inner = Object.entries(item)
          .filter(([, val]) => val != null && val !== "" && typeof val !== "object")
          .map(([k, val]) => `${humanize(k)}: ${esc(String(val))}`)
          .join(", ");
        return inner;
      }
      return esc(String(item));
    }).filter(Boolean);
    return parts.length ? `<ul class="vlist">${parts.map(p => `<li>${p}</li>`).join("")}</ul>` : "";
  }
  if (typeof v === "object") {
    const inner = Object.entries(v)
      .filter(([, val]) => val != null && val !== "" && typeof val !== "object")
      .map(([k, val]) => `${humanize(k)}: ${esc(String(val))}`)
      .join(", ");
    return esc(inner);
  }
  return esc(String(v));
}

export async function getGrowReport(env, user, growId, unit = "gal") {
  const waterUnit = isWaterUnit(unit) ? unit : "gal";
  const row = await env.DB.prepare(
    "SELECT * FROM grows WHERE id = ? AND user_id = ?",
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  const survey = parseField(row.survey) ?? {};
  // The grow's recorded history: what every stage label and day number below
  // is read from.
  const { events: stageEvents, firstDate } = await loadStageTimeline(env, user.id, growId);

  const [logRes, noteRes] = await Promise.all([
    env.DB.prepare("SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? ORDER BY date").bind(user.id, growId).all(),
    env.DB.prepare("SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND body != '' ORDER BY date").bind(user.id, growId).all(),
  ]);
  const logRows = logRes.results ?? [];
  const noteRows = noteRes.results ?? [];

  // Per-plant growth/health log (plant roster lives in survey.strains). The
  // table is created lazily, so tolerate it not existing yet.
  let plantLogRows = [];
  try {
    const r = await env.DB.prepare(
      "SELECT plant_id, date, kind, detail, body, height, height_unit, health FROM plant_log WHERE user_id = ? AND grow_id = ? ORDER BY plant_id, date",
    ).bind(user.id, growId).all();
    plantLogRows = r.results ?? [];
  } catch { /* plant_log not created yet */ }

  // Custom calendar events, shown inline on their journal days. Same ordering
  // as worker/events.js: by date, timed events first, ties by creation.
  let eventRows = [];
  try {
    await ensureGrowEventsSchema(env);
    const r = await env.DB.prepare(
      "SELECT date, title, time, notes FROM grow_events WHERE user_id = ? AND grow_id = ? ORDER BY date, time IS NULL, time, created_at",
    ).bind(user.id, growId).all();
    eventRows = r.results ?? [];
  } catch { /* grow_events unavailable */ }

  // Every photo of this grow, by address.
  //
  // This used to select the `thumb` column with no LIMIT and inline each one as
  // base64 twice, once beside its journal day and again in the plates. At the
  // app's own cap of 800 photos that is ~40MB of rows and ~80MB of HTML built
  // around them, in a worker with 128MB, so the report did not get slow at the
  // top end - it died. Selecting ids instead means the document holds no image
  // bytes at all and the browser fetches the thumbnails it is about to draw.
  //
  // The trade is that the HTML is no longer self-contained: saved to disk and
  // reopened without a session, the tiles would be empty. Printing and printing
  // to PDF are unaffected, because the browser loads the images before it
  // paginates, and those are what this page is for.
  let photoRows = [];
  try {
    const r = await env.DB.prepare(
      "SELECT id, date, plant_id FROM journal_photos WHERE user_id = ? AND grow_id = ? ORDER BY date, created_at",
    ).bind(user.id, growId).all();
    photoRows = r.results ?? [];
  } catch { /* no photos table yet */ }

  const html = renderReport({ row, survey, stageEvents, firstDate, logRows, noteRows, plantLogRows, eventRows, photoRows, waterUnit });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderReport(ctx) {
  const { row, survey, stageEvents, firstDate, logRows, noteRows, plantLogRows, eventRows, photoRows = [], waterUnit } = ctx;

  const name = row.display_name || "My Grow";
  const status = row.status || "active";
  // The report is written in the words of whatever this space grows.
  const crop = cropOf(survey);
  const w = words(crop);
  const location = growLocation(survey);
  const strains = strainSummary(survey);
  const plants = Array.isArray(survey.strains) ? survey.strains : [];

  // ── Stats (grow-scoped) ──────────────────────────────────────────────────
  let totalWater = 0, feedDays = 0, tempMin = null, tempMax = null;
  for (const r of logRows) {
    if (num(r.water_gal) != null) totalWater += num(r.water_gal);
    if (r.feed) feedDays++;
    if (num(r.temp_low) != null) tempMin = tempMin == null ? num(r.temp_low) : Math.min(tempMin, num(r.temp_low));
    if (num(r.temp_high) != null) tempMax = tempMax == null ? num(r.temp_high) : Math.max(tempMax, num(r.temp_high));
  }
  const logDays = new Set(logRows.map(r => r.date)).size;
  // The unit this grow was actually watered in decides how its totals read;
  // only a grow with nothing to go on falls back to the unit asked for.
  const growWaterUnit = displayUnit(logRows.flatMap(r => tryArr(r.water_plants)), waterUnit);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = ymdOf(today);
  const currentStage = stageOnDate(stageEvents, todayKey);
  const growDay = dayOfGrow(firstDate, todayKey);

  // ── Headline stat strip ──────────────────────────────────────────────────
  const stats = [
    ["Growing", w.cropLabel],
    firstDate ? ["Started", fmtNice(asDate(firstDate))] : null,
    growDay != null ? ["Day", String(growDay)] : null,
    currentStage ? ["Current stage", stageLabel(currentStage)] : null,
    plants.length ? [w.Units, String(plants.length)] : null,
    ["Days logged", String(logDays)],
    ["Total water", formatWater(totalWater, growWaterUnit)],
    feedDays ? ["Feed days", String(feedDays)] : null,
    eventRows.length ? ["Events", String(eventRows.length)] : null,
  ].filter(Boolean);
  const statStrip = `<div class="stripe">${stats.map(([l, v]) =>
    `<div class="stat"><div class="stat-v">${esc(v)}</div><div class="stat-l">${esc(l)}</div></div>`).join("")}</div>`;

  // ── Setup / profile ──────────────────────────────────────────────────────
  const profileRows = [];
  if (location) profileRows.push(["Location", esc(location)]);
  if (strains) profileRows.push([w.Varieties, esc(strains)]);
  // The crop has its own line at the top of the report, so it does not need a
  // second one down here among the raw survey fields.
  const shownKeys = new Set(["location", "strains", "crop"]);
  for (const [k, v] of Object.entries(survey)) {
    if (shownKeys.has(k)) continue;
    const rendered = renderValue(v);
    if (rendered) profileRows.push([humanize(k), rendered]);
  }
  const profileSection = profileRows.length ? section("Setup & Profile",
    `<div class="defs">${profileRows.map(([l, v]) =>
      `<div class="def"><div class="def-l">${esc(l)}</div><div class="def-v">${v}</div></div>`).join("")}</div>`) : "";

  // ── Plants: roster + per-plant growth/health timeline ────────────────────
  let plantsSection = "";
  if (plants.length) {
    const logByPlant = new Map();
    for (const r of (plantLogRows ?? [])) {
      if (!logByPlant.has(r.plant_id)) logByPlant.set(r.plant_id, []);
      logByPlant.get(r.plant_id).push(r);
    }
    const cards = plants.map((p, i) => {
      const pname = (p?.name || "").trim() || `${w.Unit} ${i + 1}`;
      const meta = [
        p?.type ? humanize(p.type) : null,
        p?.flowerWeeks ? `${p.flowerWeeks} wk ${crop === "mushrooms" ? "to flush" : "flower"}` : null,
        crop === "mushrooms" ? null : (p?.photo === false ? "Autoflower" : (p?.photo === true ? "Photoperiod" : null)),
        p?.status ? humanize(p.status) : null,
      ].filter(Boolean).join(" · ");
      const entries = (logByPlant.get(p?.id) ?? []);
      const timeline = entries.length
        ? `<div class="ptimeline">${entries.map(e => {
            const h = num(e.height) != null ? `${num(e.height)}${esc(e.height_unit || "")}` : "";
            return `<div class="prow">
              <span class="pdate">${fmtNice(e.date)}</span>
              ${h ? `<span class="pmetric">${h}</span>` : ""}
              ${flushText(e) ? `<span class="pmetric">${esc(flushText(e))}</span>` : ""}
              ${e.health ? healthBadge(e.health) : ""}
              ${e.body ? `<span class="pbody">${esc(e.body)}</span>` : ""}
            </div>`;
          }).join("")}</div>`
        : `<p class="empty">Nothing logged for this ${esc(w.unit)} yet.</p>`;
      // What a tub has actually given, which is the number its whole run is for.
      const yield_ = flushTotals(entries.map(shapeEntry));
      const yieldLine = yield_.flushes
        ? `<div class="plant-meta">${yield_.flushes} flush${yield_.flushes === 1 ? "" : "es"} · ${yield_.wetG} g wet · ${yield_.dryG} g dry</div>`
        : "";
      return `<div class="plant">
        <div class="plant-head"><span class="plant-name">${esc(pname)}</span>${meta ? `<span class="plant-meta">${esc(meta)}</span>` : ""}</div>
        ${yieldLine}
        ${timeline}
      </div>`;
    }).join("");
    plantsSection = section(`${w.Units} · ${plants.length}`, cards);
  }

  // ── The recorded stage timeline ──────────────────────────────────────────
  let timelineSection = "";
  if (stageEvents.length) {
    timelineSection = section("Stage Changes",
      `<div class="timeline">${stageEvents.map(e => {
        const day = dayOfGrow(firstDate, e.date);
        return `<div class="tl"><span class="tl-icon">•</span><span class="tl-label">Moved to ${esc(stageLabel(e.stage))}</span><span class="tl-date">${fmtNice(asDate(e.date))}${day != null ? ` · day ${day}` : ""}</span></div>`;
      }).join("")}</div>`);
  }

  // ── How long the grow spent in each stage ────────────────────────────────
  let phasesSection = "";
  if (stageEvents.length) {
    const phaseCards = stageEvents.map((e, i) => {
      const start = asDate(e.date);
      // The stage ran until the next switch, or until today if it is current.
      const endKey = i + 1 < stageEvents.length ? stageEvents[i + 1].date : todayKey;
      const end = asDate(endKey);
      if (!start || !end || end < start) return "";
      const range = start.getTime() === end.getTime() ? fmtNice(start) : `${fmtNice(start)} - ${fmtNice(end)}`;
      const days = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
      return `<div class="phase">
        <div class="phase-head">${chip(e.stage)}<span class="phase-range">${range}</span><span class="phase-days">${days} day${days === 1 ? "" : "s"}</span></div>
      </div>`;
    }).join("");
    if (phaseCards) phasesSection = section("Time In Each Stage", phaseCards);
  }

  // ── Day-by-day journal ───────────────────────────────────────────────────
  // Photographs, indexed by the day they were taken. Used twice: a small strip
  // inside each journal day, and the dated plates section further down.
  const photosByDate = new Map();
  for (const p of photoRows) {
    if (!p?.id || !p?.date) continue;
    if (!photosByDate.has(p.date)) photosByDate.set(p.date, []);
    photosByDate.get(p.date).push(p);
  }
  const plantNameById = new Map(plants.filter((p) => p?.id).map((p) => [p.id, p.name || ""]));

  const byDate = new Map();
  const slot = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, log: null, note: null, events: [] });
    return byDate.get(d);
  };
  for (const r of logRows) slot(r.date).log = r;
  for (const r of noteRows) slot(r.date).note = r.body;
  for (const r of eventRows) slot(r.date).events.push(r);
  // A day you photographed is a day with a record, even if nothing was typed
  // on it. Without this the journal skipped it entirely and the picture only
  // survived in the plates.
  for (const d of photosByDate.keys()) slot(d);
  const journalDates = [...byDate.keys()].sort();

  const journalCards = journalDates.map(d => {
    const e = byDate.get(d);
    const stage = firstDate && d >= firstDate ? stageOnDate(stageEvents, d) : null;

    // What was logged, folded by the same tested code the app's own journal
    // page uses. The report used to fold it again here and got it wrong three
    // ways: training and health rows are objects, so joining them printed
    // "[object Object]", and an unattributed watering was called "plant"
    // whatever the space grew.
    const rows = e.log ? recordRows({ log: rowToEntry(e.log), weather: null, crop }) : [];
    const L = e.log;
    // EC has no home in recordRows - it is a hydro reading the day's form
    // still takes - so it is appended rather than dropped.
    if (L && (num(L.ec_in) != null || num(L.ec_out) != null)) {
      rows.push({ key: "ec", label: "EC in/out", text: `${L.ec_in ?? "?"} / ${L.ec_out ?? "?"}` });
    }
    const metricsHtml = rows.length
      ? `<div class="metrics">${rows.map((r) => {
          const body = r.items
            ? r.items.map((it) => `<span class="m-item">${esc(it.name)}${
                it.amount ? `<b class="m-amt">${esc(it.amount)}</b>` : ""
              }${it.detail ? `<span class="m-det">${esc(it.detail)}</span>` : ""}</span>`).join("")
            : `<span class="m-item">${esc(r.text ?? "")}${
                r.source === "forecast" ? `<span class="m-det">from the sky</span>` : ""
              }</span>`;
          // A value read out of the day's writing says so, the same way it
          // does on screen, so the paper record is as honest as the app.
          const mark = r.read ? `<span class="m-read" title="read from the day's entry">&#9679;</span>` : "";
          return `<div class="metric"><span class="m-l">${esc(r.label)}${mark}</span><span class="m-v">${body}</span></div>`;
        }).join("")}</div>`
      : "";

    // Custom calendar events on this day
    const eventsHtml = e.events.length
      ? `<div class="events">${e.events.map(ev =>
          `<div class="ev"><span class="ev-time">${ev.time ? esc(ev.time) : "all day"}</span><span class="ev-title">${esc(ev.title)}</span>${ev.notes ? `<span class="ev-notes">${esc(ev.notes)}</span>` : ""}</div>`).join("")}</div>`
      : "";

    // The day's writing. Entries carry the editor's own markup now - headings,
    // bold, lists - so escaping it printed the tags themselves. noteToHtml is
    // the same whitelist sanitiser the app renders with: only b/i/u/p/br/ul/
    // ol/li/h1..h3/font survive it, and a legacy plain-text note is escaped
    // and keeps its line breaks.
    const noteHtml = e.note ? `<div class="daynote">${noteToHtml(e.note)}</div>` : "";

    // This day's photographs, small, beside the words they belong to. The same
    // images are set larger in the plates section; both point at the same
    // address, so the browser fetches each thumbnail once and draws it twice.
    const shots = photosByDate.get(d) ?? [];
    const stripHtml = shots.length
      ? `<div class="jshots">${shots.map((p) =>
          `<img class="jshot" src="${esc(photoUrl(p.id, "thumb"))}" alt="${esc(`${fmtLong(d)} photograph`)}" loading="lazy">`).join("")}</div>`
      : "";

    const dayNum = dayOfGrow(firstDate, d);
    if (!metricsHtml && !eventsHtml && !noteHtml && !stripHtml) return "";
    return `<div class="jday">
      <div class="jhead">
        <span class="jdate">${fmtLong(d)}</span>
        ${dayNum != null ? `<span class="jday-n">Day ${dayNum}</span>` : ""}
        ${stage ? chip(stage) : ""}
      </div>
      ${metricsHtml}${eventsHtml}${noteHtml}${stripHtml}
    </div>`;
  }).filter(Boolean).join("");

  const journalSection = journalCards
    ? section(`Journal · ${journalDates.length} day${journalDates.length === 1 ? "" : "s"} recorded`, journalCards)
    : section("Journal", `<p class="empty">No daily entries recorded yet.</p>`);

  // ── Plates: every photograph, in the order they were taken ───────────────
  // The point of this section is to be flicked through. Each dated block is a
  // contact sheet of that day, headed with the date, the day of the grow and
  // the stage it was in, so growth reads down the page without hunting for
  // context. A block is kept whole on one page where it fits.
  const plateDates = [...photosByDate.keys()].sort();
  const platesSection = plateDates.length
    ? section(`Plates · ${photoRows.length} photograph${photoRows.length === 1 ? "" : "s"}`,
      `<p class="lede">Every photograph of this grow, oldest first, grouped by the day it was taken.</p>` +
      plateDates.map((d) => {
        const shots = photosByDate.get(d);
        const stage = firstDate && d >= firstDate ? stageOnDate(stageEvents, d) : null;
        const dayNum = dayOfGrow(firstDate, d);
        return `<div class="plate">
          <div class="plate-head">
            <span class="plate-date">${fmtLong(d)}</span>
            ${dayNum != null ? `<span class="plate-day">Day ${dayNum}</span>` : ""}
            ${stage ? chip(stage) : ""}
            <span class="plate-n">${shots.length} photo${shots.length === 1 ? "" : "s"}</span>
          </div>
          <div class="sheet">${shots.map((p) => {
            const who = p.plant_id ? plantNameById.get(p.plant_id) : "";
            return `<figure class="frame">
              <img src="${esc(photoUrl(p.id, "thumb"))}" alt="${esc(`${fmtLong(d)}${who ? ` - ${who}` : ""}`)}" loading="lazy">
              ${who ? `<figcaption>${esc(who)}</figcaption>` : ""}
            </figure>`;
          }).join("")}</div>
        </div>`;
      }).join(""))
    : "";

  // ── Stats summary ────────────────────────────────────────────────────────
  const summaryRows = [
    ["Days with a log entry", String(logDays)],
    ["Total water applied", formatWater(totalWater, growWaterUnit)],
    ["Feed days", String(feedDays)],
    tempMin != null ? ["Lowest temp recorded", `${tempMin}°F`] : null,
    tempMax != null ? ["Highest temp recorded", `${tempMax}°F`] : null,
    ["Day notes written", String(noteRows.length)],
    photoRows.length ? ["Photographs", String(photoRows.length)] : null,
    eventRows.length ? ["Calendar events", String(eventRows.length)] : null,
    firstDate ? ["Length of record", weeksAndDays(dayOfGrow(firstDate, ymdOf(today)) ?? 0)] : null,
  ].filter(Boolean);
  const statsSection = section("Season Stats",
    `<div class="defs">${summaryRows.map(([l, v]) =>
      `<div class="def"><div class="def-l">${esc(l)}</div><div class="def-v">${esc(v)}</div></div>`).join("")}</div>`);

  const generated = `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} - Grow Report</title>
<style>${CSS}</style>
</head><body>
<div class="toolbar no-print">
  <div class="tb-name">${esc(name)} - Grow Report</div>
  <button onclick="window.print()" class="tb-btn">Save as PDF / Print</button>
</div>
<main>
  <header class="cover">
    <div class="brandline">${catMarkSvg({ width: 34, ink: "#111", eye: "#fff", pupil: "#111", face: "#fff", fill: "#111" })}<span class="eyebrow">Black Cat Botanicals · Grow Report</span></div>
    <h1>${esc(name)}</h1>
    <div class="sub">
      <span class="badge badge-${esc(status)}">${esc(status)}</span>
      ${location ? `<span>${esc(location)}</span>` : ""}
      ${strains ? `<span>${esc(strains)}</span>` : ""}
    </div>
    ${statStrip}
  </header>
  <nav class="toc">
    <h2>Contents</h2>
    <ol>
      ${[
        profileSection ? "Setup &amp; Profile" : null,
        plantsSection ? `${esc(w.Units)}` : null,
        timelineSection ? "Stage Changes" : null,
        phasesSection ? "Time In Each Stage" : null,
        journalCards ? "Journal, day by day" : null,
        platesSection ? "Plates, the photographic record" : null,
        "Season Stats",
      ].filter(Boolean).map((t) => `<li>${t}</li>`).join("")}
    </ol>
  </nav>
  ${profileSection}
  ${plantsSection}
  ${timelineSection}
  ${phasesSection}
  ${journalSection}
  ${platesSection}
  ${statsSection}
  <footer class="foot">
    Generated ${esc(generated)} · Black Cat Botanicals. For educational and personal
    record-keeping only - not medical, legal, or professional cultivation advice.
  </footer>
</main>
</body></html>`;
}

function section(title, inner) {
  return `<section class="card"><h2>${esc(title)}</h2>${inner}</section>`;
}

const CSS = `
:root{--g:#b06a1e;--gd:#1a1512;--ink:#1c1917;--mut:#7a6f63;--line:#e6e0d8;--bg:#f7f5f1;--card:#fff;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:Georgia,'Times New Roman',serif;color:var(--ink);background:var(--bg);line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.mono,.eyebrow,.stat-l,.def-l,.m-l,.chip,.badge,.tb-name,.tl-label{font-family:'Courier New',monospace;}
.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 20px;background:var(--gd);color:#f6efe4;}
.tb-name{font-size:13px;letter-spacing:1px;}
.tb-btn{font-family:'Courier New',monospace;font-size:13px;letter-spacing:1px;cursor:pointer;
  background:#f6efe4;color:var(--gd);border:none;border-radius:8px;padding:9px 16px;font-weight:700;}
.tb-btn:hover{background:#fff;}
main{max-width:820px;margin:0 auto;padding:24px 20px 60px;}
.cover{padding:8px 0 4px;}
.eyebrow{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--mut);margin-bottom:6px;}
.brandline{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
.brandline svg{display:block;flex:none;}
.brandline .eyebrow{margin-bottom:0;}
h1{font-size:34px;line-height:1.1;margin:0 0 10px;color:var(--gd);letter-spacing:-0.5px;}
.sub{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--mut);font-size:15px;margin-bottom:18px;}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;padding:3px 9px;border-radius:999px;border:1px solid var(--g);color:#7c4a12;background:#fdf3e7;}
.badge-harvested{border-color:#2f8f4e;color:#14532d;background:#e9f7ee;}
.badge-abandoned{border-color:#9ca3af;color:#4b5563;background:#f3f4f6;}
.stripe{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px;}
.stat{flex:1 1 120px;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;}
.stat-v{font-size:20px;font-weight:700;color:var(--gd);}
.stat-l{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);margin-top:3px;}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:18px 0;box-shadow:0 1px 2px rgba(0,0,0,.03);}
.card h2{font-size:13px;letter-spacing:2px;text-transform:uppercase;color:var(--g);margin:0 0 14px;font-family:'Courier New',monospace;border-bottom:1px solid var(--line);padding-bottom:10px;}
.defs{display:grid;grid-template-columns:1fr;gap:10px;}
.def{display:flex;gap:14px;align-items:baseline;border-bottom:1px dotted var(--line);padding-bottom:8px;}
.def-l{flex:0 0 150px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:var(--mut);}
.def-v{flex:1;font-size:15px;}
.vlist{margin:0;padding-left:18px;}
.timeline{display:grid;gap:8px;}
.tl{display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px dotted var(--line);}
.tl-icon{font-size:16px;width:22px;text-align:center;}
.tl-label{flex:1;font-size:12px;letter-spacing:.5px;}
.tl-date{font-size:14px;color:var(--gd);font-weight:600;}
.chip{display:inline-block;font-size:10px;letter-spacing:.5px;padding:2px 9px;border-radius:999px;border:1px solid;font-weight:700;}
.phase{border-left:3px solid var(--g);padding:4px 0 4px 16px;margin:0 0 12px;}
.phase-head{display:flex;align-items:center;gap:10px;}
.phase-range{font-size:13px;color:var(--mut);font-family:'Courier New',monospace;}
.phase-days{margin-left:auto;font-size:12px;color:var(--mut);font-family:'Courier New',monospace;}
.plant{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px;break-inside:avoid;}
.plant-head{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:6px;}
.plant-name{font-size:17px;font-weight:700;color:var(--gd);}
.plant-meta{font-size:11px;letter-spacing:.5px;text-transform:uppercase;color:var(--mut);font-family:'Courier New',monospace;}
.ptimeline{display:grid;gap:6px;}
.prow{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:14px;border-bottom:1px dotted var(--line);padding:4px 0;}
.pdate{font-family:'Courier New',monospace;font-size:12px;color:var(--gd);font-weight:700;min-width:96px;}
.pmetric{background:#eef6f0;border-radius:6px;padding:2px 8px;font-weight:600;font-size:13px;}
.pbody{flex:1;color:#3f5a45;}
.hbadge{font-family:'Courier New',monospace;font-size:10px;letter-spacing:.5px;padding:2px 8px;border-radius:999px;border:1px solid #cbd5cf;background:#f1f5f2;color:#475c4d;}
.jday{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px;break-inside:avoid;}
.jhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:6px;}
.jdate{font-family:'Courier New',monospace;font-size:13px;letter-spacing:.5px;color:var(--gd);font-weight:700;}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;}
.metric{background:#eef6f0;border-radius:8px;padding:5px 10px;font-size:13px;}
.m-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);margin-right:6px;}
.m-v{font-weight:600;}
.events{display:grid;gap:4px;margin:8px 0;}
.ev{display:flex;align-items:baseline;flex-wrap:wrap;gap:8px;font-size:14px;}
.ev-time{font-family:'Courier New',monospace;font-size:11px;color:var(--gd);font-weight:700;min-width:52px;}
.ev-title{font-weight:600;}
.ev-notes{color:#3f5a45;font-size:13px;}
.daynote{font-size:14px;background:#fffdf3;border:1px solid #f1e9c8;border-radius:8px;padding:8px 12px;margin:8px 0;white-space:pre-wrap;}
.empty{color:var(--mut);font-style:italic;}
.foot{font-size:11px;color:var(--mut);text-align:center;margin-top:30px;line-height:1.6;font-family:'Courier New',monospace;}
/* ── The photographic record ───────────────────────────────────────────── */
.lede{font-size:13px;color:var(--mut);margin:0 0 14px;font-style:italic;}
.plate{margin:0 0 18px;break-inside:avoid;}
.plate-head{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap;
  border-bottom:1px solid #d8e0d4;padding-bottom:5px;margin-bottom:9px;}
.plate-date{font-weight:700;font-size:14px;}
.plate-day,.plate-n{font-family:'Courier New',monospace;font-size:11px;color:var(--mut);}
.plate-n{margin-left:auto;}
.sheet{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;}
.frame{margin:0;break-inside:avoid;}
.frame img{width:100%;aspect-ratio:1/1;object-fit:cover;display:block;
  border:1px solid #d8e0d4;border-radius:4px;background:#f2f0e8;}
.frame figcaption{font-size:10px;color:var(--mut);margin-top:3px;text-align:center;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
/* The strip beside a day's words. */
.jshots{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px;}
.jshot{width:74px;height:74px;object-fit:cover;border:1px solid #d8e0d4;
  border-radius:4px;background:#f2f0e8;}
.m-item{display:block;}
.m-amt{font-family:'Courier New',monospace;margin-left:6px;}
.m-det{color:#3f5a45;margin-left:6px;}
.m-read{color:#4a7c59;font-size:8px;vertical-align:super;margin-left:3px;}
.jday-n{font-family:'Courier New',monospace;font-size:11px;color:var(--mut);}
/* Entry markup, set as a page rather than printed as tags. */
.daynote h1{font-size:16px;margin:.5em 0 .2em;}
.daynote h2{font-size:14px;margin:.5em 0 .15em;}
.daynote ul,.daynote ol{margin:.3em 0;padding-left:22px;}
.daynote p{margin:0 0 .4em;}
.toc{border:1px solid #d8e0d4;border-radius:10px;padding:16px 20px;margin:0 0 18px;
  background:#fbfaf5;}
.toc h2{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:var(--mut);margin:0 0 8px;}
.toc ol{margin:0;padding-left:20px;font-size:14px;line-height:1.9;}

@media print{
  body{background:#fff;}
  .no-print{display:none!important;}
  main{max-width:none;padding:0;}
  .card,.jday,.phase,.plate,.frame{break-inside:avoid;box-shadow:none;}
  .card{border-color:#d8e0d4;}
  /* A journal day and its photographs stay together; a heading never ends a
     page with nothing under it. */
  h2{break-after:avoid;}
  .plate-head,.jhead{break-after:avoid;}
  .toc{break-after:page;}
  .cover{break-after:page;}
  /* Letter, with room for the running foot. Chrome and Safari both put the
     page number there from the @page rule. */
  @page{
    size:letter;
    margin:16mm 14mm 18mm;
    @bottom-center{content:counter(page);font-family:'Courier New',monospace;font-size:9pt;color:#6b7f6b;}
  }
  /* Thumbnails print at ~1.6in, which is where a 480px source stops being the
     limiting factor and the paper does. */
  .sheet{grid-template-columns:repeat(4,1fr);gap:6px;}
  .jshot{width:64px;height:64px;}
  a{text-decoration:none;color:inherit;}
}
@media(max-width:520px){.def{flex-direction:column;gap:2px;}.def-l{flex-basis:auto;}}
`;
