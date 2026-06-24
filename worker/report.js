// @ts-check
// Comprehensive, print-optimised HTML report for a single grow. Pulls the full
// profile/setup, the phase-by-phase plan, a day-by-day journal of everything
// recorded, and season stats into one self-contained styled document that the
// grower can read in a tab and "Save as PDF".
import { error } from "./util.js";
import { parseConfig, parseDate } from "../src/lib/planConfig.js";
import { getPhase, getDetail, buildMilestones, getGrowProgress, PHASES, THREATS } from "../src/lib/growData.js";
import { growLocation, strainSummary } from "../src/lib/growProfile.js";

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

function chip(phase) {
  const p = PHASES[phase];
  if (!p) return "";
  return `<span class="chip" style="background:${p.light};color:${p.dark};border-color:${p.color}">${esc(p.label)}</span>`;
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

export async function getGrowReport(env, user, growId) {
  const row = await env.DB.prepare(
    "SELECT * FROM grows WHERE id = ? AND user_id = ?",
  ).bind(growId, user.id).first();
  if (!row) return error(404, "grow not found");

  const rawConfig = parseField(row.config);
  const config = rawConfig ? parseConfig(rawConfig) : null;
  const survey = parseField(row.survey) ?? {};
  const generatedPlan = parseField(row.generated_plan);
  const phaseOverrides = parseField(row.phase_overrides) ?? {};

  const ovRes = await env.DB.prepare(
    "SELECT date, payload FROM plan_day_overrides WHERE user_id = ? AND grow_id = ? ORDER BY date",
  ).bind(user.id, growId).all();
  const overrides = {};
  for (const r of ovRes.results ?? []) { try { overrides[r.date] = JSON.parse(r.payload); } catch { /* skip */ } }

  const [logRes, noteRes, checkRes, taskNoteRes] = await Promise.all([
    env.DB.prepare("SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? ORDER BY date").bind(user.id, growId).all(),
    env.DB.prepare("SELECT date, body FROM day_notes WHERE user_id = ? AND grow_id = ? AND body != '' ORDER BY date").bind(user.id, growId).all(),
    env.DB.prepare("SELECT date, task_index, state FROM task_checkoffs WHERE user_id = ? AND grow_id = ? ORDER BY date, task_index").bind(user.id, growId).all(),
    env.DB.prepare("SELECT date, task_index, note FROM task_notes WHERE user_id = ? AND grow_id = ? ORDER BY date, task_index").bind(user.id, growId).all(),
  ]);
  const logRows = logRes.results ?? [];
  const noteRows = noteRes.results ?? [];
  const checkRows = checkRes.results ?? [];
  const taskNoteRows = taskNoteRes.results ?? [];

  const html = renderReport({
    row, config, survey, generatedPlan, phaseOverrides, overrides,
    logRows, noteRows, checkRows, taskNoteRows,
  });

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function renderReport(ctx) {
  const { row, config, survey, generatedPlan, phaseOverrides, overrides, logRows, noteRows, checkRows, taskNoteRows } = ctx;

  const name = row.display_name || "My Grow";
  const status = row.status || "active";
  const location = growLocation(survey);
  const strains = strainSummary(survey, generatedPlan);

  // ── Stats (grow-scoped) ──────────────────────────────────────────────────
  let totalWater = 0, feedDays = 0, tempMin = null, tempMax = null;
  for (const r of logRows) {
    if (num(r.water_gal) != null) totalWater += num(r.water_gal);
    if (r.feed) feedDays++;
    if (num(r.temp_low) != null) tempMin = tempMin == null ? num(r.temp_low) : Math.min(tempMin, num(r.temp_low));
    if (num(r.temp_high) != null) tempMax = tempMax == null ? num(r.temp_high) : Math.max(tempMax, num(r.temp_high));
  }
  let tDone = 0, tSkip = 0, tBlock = 0;
  for (const c of checkRows) {
    if (c.state === "done") tDone++; else if (c.state === "skipped") tSkip++; else if (c.state === "blocked") tBlock++;
  }
  const logDays = new Set(logRows.map(r => r.date)).size;

  const today = new Date();
  const currentPhase = config ? getPhase(today, config) : null;
  const progress = config && config.start && config.hazeHarvest ? getGrowProgress(today, config) : null;

  // ── Headline stat strip ──────────────────────────────────────────────────
  const stats = [
    config?.start ? ["Season start", fmtNice(config.start)] : null,
    config?.hazeHarvest ? ["Final harvest", fmtNice(config.hazeHarvest)] : null,
    progress != null ? ["Progress", `${progress}%`] : null,
    currentPhase ? ["Current phase", PHASES[currentPhase]?.label ?? currentPhase] : null,
    ["Days logged", String(logDays)],
    ["Total water", `${Math.round(totalWater * 10) / 10} gal`],
    ["Tasks done", String(tDone)],
    feedDays ? ["Feed days", String(feedDays)] : null,
  ].filter(Boolean);
  const statStrip = `<div class="stripe">${stats.map(([l, v]) =>
    `<div class="stat"><div class="stat-v">${esc(v)}</div><div class="stat-l">${esc(l)}</div></div>`).join("")}</div>`;

  // ── Setup / profile ──────────────────────────────────────────────────────
  const profileRows = [];
  if (location) profileRows.push(["Location", esc(location)]);
  if (strains) profileRows.push(["Strains", esc(strains)]);
  const shownKeys = new Set(["location", "strains"]);
  for (const [k, v] of Object.entries(survey)) {
    if (shownKeys.has(k)) continue;
    const rendered = renderValue(v);
    if (rendered) profileRows.push([humanize(k), rendered]);
  }
  const profileSection = profileRows.length ? section("Setup & Profile",
    `<div class="defs">${profileRows.map(([l, v]) =>
      `<div class="def"><div class="def-l">${esc(l)}</div><div class="def-v">${v}</div></div>`).join("")}</div>`) : "";

  // ── Plan timeline (milestones) ───────────────────────────────────────────
  let timelineSection = "";
  if (config) {
    const ms = buildMilestones(config).filter(m => asDate(m.date));
    if (ms.length) {
      timelineSection = section("Key Dates",
        `<div class="timeline">${ms.map(m =>
          `<div class="tl"><span class="tl-icon">${esc(m.icon || "•")}</span><span class="tl-label">${esc(m.label)}</span><span class="tl-date">${fmtNice(m.date)}</span></div>`).join("")}</div>`);
    }
  }

  // ── Phase-by-phase plan ──────────────────────────────────────────────────
  let planSection = "";
  if (config && config.start && config.hazeHarvest) {
    const ranges = [];
    let cur = null;
    for (let t = config.start.getTime(); t <= config.hazeHarvest.getTime(); t += DAY_MS) {
      const date = new Date(t);
      const phase = getPhase(date, config);
      if (!phase) continue;
      if (!cur || cur.phase !== phase) { cur = { phase, start: date, end: date }; ranges.push(cur); }
      else cur.end = date;
    }
    const phaseCards = ranges.map(r => {
      const detail = getDetail(r.start, config, overrides, generatedPlan, phaseOverrides);
      if (!detail) return "";
      const range = r.start.getTime() === r.end.getTime() ? fmtNice(r.start) : `${fmtNice(r.start)} – ${fmtNice(r.end)}`;
      const tasks = (detail.tasks ?? []).map(t => `<li>${esc(t)}</li>`).join("");
      return `<div class="phase">
        <div class="phase-head">${chip(r.phase)}<span class="phase-range">${range}</span></div>
        ${detail.summary ? `<p class="phase-sum">${esc(detail.summary)}</p>` : ""}
        ${tasks ? `<ul class="tasks">${tasks}</ul>` : ""}
        ${detail.notes ? `<p class="note-line"><strong>Note:</strong> ${esc(detail.notes)}</p>` : ""}
      </div>`;
    }).join("");
    planSection = section("The Plan", phaseCards);
  }

  // ── Season threats ───────────────────────────────────────────────────────
  const threatsSection = (THREATS && THREATS.length) ? section("Season Threats to Watch",
    `<div class="threats">${THREATS.map(t =>
      `<div class="threat"><div class="threat-t">${esc(t.title)}</div><div class="threat-d">${esc(t.desc)}</div></div>`).join("")}</div>`) : "";

  // ── Day-by-day journal ───────────────────────────────────────────────────
  const byDate = new Map();
  const slot = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, log: null, note: null, checks: [], taskNotes: [] });
    return byDate.get(d);
  };
  for (const r of logRows) slot(r.date).log = r;
  for (const r of noteRows) slot(r.date).note = r.body;
  for (const r of checkRows) slot(r.date).checks.push(r);
  for (const r of taskNoteRows) slot(r.date).taskNotes.push(r);
  for (const d of Object.keys(overrides)) slot(d);
  const journalDates = [...byDate.keys()].sort();

  const journalCards = journalDates.map(d => {
    const e = byDate.get(d);
    const date = asDate(d);
    const phase = config && date ? getPhase(date, config) : null;
    const detail = config && date ? getDetail(date, config, overrides, generatedPlan, phaseOverrides) : null;
    const tasks = detail?.tasks ?? [];

    // Grow-log metrics
    const metrics = [];
    if (e.log) {
      const L = e.log;
      if (num(L.water_gal) != null) metrics.push(["Water", `${num(L.water_gal)} gal`]);
      if (L.feed) metrics.push(["Feed", esc(L.feed)]);
      if (num(L.temp_high) != null || num(L.temp_low) != null) metrics.push(["Temp", `${L.temp_high ?? "?"}° / ${L.temp_low ?? "?"}°F`]);
      if (num(L.humidity) != null) metrics.push(["Humidity", `${num(L.humidity)}%`]);
      if (num(L.ec_in) != null || num(L.ec_out) != null) metrics.push(["EC in/out", `${L.ec_in ?? "?"} / ${L.ec_out ?? "?"}`]);
      const wp = tryArr(L.water_plants); if (wp.length) metrics.push(["Watered", esc(wp.join(", "))]);
      const tr = tryArr(L.training); if (tr.length) metrics.push(["Training", esc(tr.join(", "))]);
      const ph = tryArr(L.plant_health); if (ph.length) metrics.push(["Plant health", esc(ph.join(", "))]);
    }
    const metricsHtml = metrics.length
      ? `<div class="metrics">${metrics.map(([l, v]) => `<div class="metric"><span class="m-l">${esc(l)}</span><span class="m-v">${v}</span></div>`).join("")}</div>`
      : "";

    // Completed / resolved tasks
    const checksHtml = e.checks.length
      ? `<ul class="checks">${e.checks.map(c => {
          const label = tasks[c.task_index] != null ? esc(tasks[c.task_index]) : `Task #${c.task_index + 1}`;
          const mark = c.state === "done" ? "✓" : c.state === "skipped" ? "⤼" : "✕";
          return `<li class="chk chk-${esc(c.state)}"><span class="mark">${mark}</span> ${label}</li>`;
        }).join("")}</ul>`
      : "";

    // Per-task notes
    const taskNotesHtml = e.taskNotes.length
      ? e.taskNotes.map(t => {
          const label = tasks[t.task_index] != null ? esc(tasks[t.task_index]) : `Task #${t.task_index + 1}`;
          return `<p class="tnote"><strong>${label}:</strong> ${esc(t.note)}</p>`;
        }).join("")
      : "";

    // Day note + overrides
    const noteHtml = e.note ? `<p class="daynote">${esc(e.note)}</p>` : "";
    const ov = overrides[d];
    let ovHtml = "";
    if (ov) {
      const bits = [];
      if (ov.editedTasks && Object.keys(ov.editedTasks).length) bits.push(`${Object.keys(ov.editedTasks).length} task(s) edited`);
      if (Array.isArray(ov.addedTasks) && ov.addedTasks.length) bits.push(`${ov.addedTasks.length} task(s) added`);
      if (Array.isArray(ov.removedTasks) && ov.removedTasks.length) bits.push(`${ov.removedTasks.length} task(s) removed`);
      if (ov.note) bits.push("custom day note");
      if (bits.length) ovHtml = `<p class="ov">Edited this day: ${esc(bits.join(", "))}</p>`;
    }

    if (!metricsHtml && !checksHtml && !taskNotesHtml && !noteHtml && !ovHtml) return "";
    return `<div class="jday">
      <div class="jhead"><span class="jdate">${fmtLong(d)}</span>${phase ? chip(phase) : ""}</div>
      ${metricsHtml}${noteHtml}${checksHtml}${taskNotesHtml}${ovHtml}
    </div>`;
  }).filter(Boolean).join("");

  const journalSection = journalCards
    ? section(`Journal · ${journalDates.length} day${journalDates.length === 1 ? "" : "s"} recorded`, journalCards)
    : section("Journal", `<p class="empty">No daily entries recorded yet.</p>`);

  // ── Stats summary ────────────────────────────────────────────────────────
  const summaryRows = [
    ["Days with a log entry", String(logDays)],
    ["Total water applied", `${Math.round(totalWater * 10) / 10} gal`],
    ["Feed days", String(feedDays)],
    tempMin != null ? ["Lowest temp recorded", `${tempMin}°F`] : null,
    tempMax != null ? ["Highest temp recorded", `${tempMax}°F`] : null,
    ["Tasks completed", String(tDone)],
    tSkip ? ["Tasks skipped", String(tSkip)] : null,
    tBlock ? ["Tasks blocked", String(tBlock)] : null,
    ["Day notes written", String(noteRows.length)],
  ].filter(Boolean);
  const statsSection = section("Season Stats",
    `<div class="defs">${summaryRows.map(([l, v]) =>
      `<div class="def"><div class="def-l">${esc(l)}</div><div class="def-v">${esc(v)}</div></div>`).join("")}</div>`);

  const generated = `${MONTHS[today.getMonth()]} ${today.getDate()}, ${today.getFullYear()}`;

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)} — Grow Report</title>
<style>${CSS}</style>
</head><body>
<div class="toolbar no-print">
  <div class="tb-name">${esc(name)} — Grow Report</div>
  <button onclick="window.print()" class="tb-btn">Save as PDF / Print</button>
</div>
<main>
  <header class="cover">
    <div class="eyebrow">The Grow Calendar · Grow Report</div>
    <h1>${esc(name)}</h1>
    <div class="sub">
      <span class="badge badge-${esc(status)}">${esc(status)}</span>
      ${location ? `<span>${esc(location)}</span>` : ""}
      ${strains ? `<span>${esc(strains)}</span>` : ""}
    </div>
    ${statStrip}
  </header>
  ${profileSection}
  ${timelineSection}
  ${planSection}
  ${threatsSection}
  ${journalSection}
  ${statsSection}
  <footer class="foot">
    Generated ${esc(generated)} · The Grow Calendar. For educational and personal
    record-keeping only — not medical, legal, or professional cultivation advice.
  </footer>
</main>
</body></html>`;
}

function section(title, inner) {
  return `<section class="card"><h2>${esc(title)}</h2>${inner}</section>`;
}

const CSS = `
:root{--g:#2f8f4e;--gd:#14532d;--ink:#1b2a1f;--mut:#6b7a6e;--line:#e2e8df;--bg:#f6f8f4;--card:#fff;}
*{box-sizing:border-box;}
html,body{margin:0;padding:0;}
body{font-family:Georgia,'Times New Roman',serif;color:var(--ink);background:var(--bg);line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
.mono,.eyebrow,.stat-l,.def-l,.m-l,.chip,.badge,.tb-name,.tl-label{font-family:'Courier New',monospace;}
.toolbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:12px 20px;background:var(--gd);color:#eafff0;}
.tb-name{font-size:13px;letter-spacing:1px;}
.tb-btn{font-family:'Courier New',monospace;font-size:13px;letter-spacing:1px;cursor:pointer;
  background:#eafff0;color:var(--gd);border:none;border-radius:8px;padding:9px 16px;font-weight:700;}
.tb-btn:hover{background:#fff;}
main{max-width:820px;margin:0 auto;padding:24px 20px 60px;}
.cover{padding:8px 0 4px;}
.eyebrow{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:var(--mut);margin-bottom:6px;}
h1{font-size:34px;line-height:1.1;margin:0 0 10px;color:var(--gd);letter-spacing:-0.5px;}
.sub{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--mut);font-size:15px;margin-bottom:18px;}
.badge{font-size:10px;text-transform:uppercase;letter-spacing:1.5px;padding:3px 9px;border-radius:999px;border:1px solid var(--g);color:var(--gd);background:#e9f7ee;}
.badge-harvested{border-color:#b45309;color:#7c3a00;background:#fef3c7;}
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
.phase{border-left:3px solid var(--g);padding:4px 0 4px 16px;margin:0 0 18px;}
.phase-head{display:flex;align-items:center;gap:10px;margin-bottom:6px;}
.phase-range{font-size:13px;color:var(--mut);font-family:'Courier New',monospace;}
.phase-sum{margin:4px 0 8px;font-size:15px;}
.tasks{margin:6px 0;padding-left:20px;}
.tasks li{margin:4px 0;font-size:14px;}
.note-line{font-size:13px;color:#3f5a45;background:#eef6f0;border-radius:8px;padding:8px 12px;margin:8px 0 0;}
.threats{display:grid;gap:10px;}
.threat{border:1px solid var(--line);border-radius:10px;padding:10px 14px;}
.threat-t{font-weight:700;color:var(--gd);margin-bottom:2px;}
.threat-d{font-size:14px;color:#3f5a45;}
.jday{border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin:0 0 12px;break-inside:avoid;}
.jhead{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;border-bottom:1px solid var(--line);padding-bottom:6px;}
.jdate{font-family:'Courier New',monospace;font-size:13px;letter-spacing:.5px;color:var(--gd);font-weight:700;}
.metrics{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0;}
.metric{background:#eef6f0;border-radius:8px;padding:5px 10px;font-size:13px;}
.m-l{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--mut);margin-right:6px;}
.m-v{font-weight:600;}
.daynote{font-size:14px;background:#fffdf3;border:1px solid #f1e9c8;border-radius:8px;padding:8px 12px;margin:8px 0;white-space:pre-wrap;}
.checks{list-style:none;margin:8px 0;padding:0;}
.chk{font-size:14px;margin:3px 0;}
.chk .mark{display:inline-block;width:18px;font-weight:700;}
.chk-done .mark{color:var(--g);}
.chk-skipped{color:var(--mut);} .chk-skipped .mark{color:#b45309;}
.chk-blocked{color:#9b1c1c;} .chk-blocked .mark{color:#9b1c1c;}
.tnote{font-size:13px;margin:4px 0;color:#3f5a45;}
.ov{font-size:12px;color:var(--mut);font-style:italic;margin:6px 0 0;}
.empty{color:var(--mut);font-style:italic;}
.foot{font-size:11px;color:var(--mut);text-align:center;margin-top:30px;line-height:1.6;font-family:'Courier New',monospace;}
@media print{
  body{background:#fff;}
  .no-print{display:none!important;}
  main{max-width:none;padding:0;}
  .card,.jday,.phase{break-inside:avoid;box-shadow:none;}
  .card{border-color:#d8e0d4;}
  @page{margin:14mm;}
}
@media(max-width:520px){.def{flex-direction:column;gap:2px;}.def-l{flex-basis:auto;}}
`;
