// @ts-check
// The page a label's code opens: a public profile of one strain.
//
// It is deliberately about the STRAIN and nothing else. Hand somebody a jar and
// they can read what the variety is; they cannot read your grow. No rating, no
// notes, no dates, no spaces, no session - the page never touches a user row,
// so there is nothing here to leak.
//
// The profile is written once by the model and then cached forever. Two things
// keep an open, unauthenticated endpoint from being a way to spend somebody
// else's quota:
//
//   * a profile is only ever generated for a name already in strain_catalog,
//     which means a name somebody actually grows, not any string in a URL
//   * generation respects the same global daily ceiling as everything else,
//     and when it is out of room the page still renders from the catalog's own
//     facts rather than failing
//
// So the worst an attacker can do is read pages that already exist.

import { strainNameKey } from "../src/lib/strainLibrary.js";
import { askGeminiForJson } from "./providers/gemini.js";
import { GEMINI_MODEL } from "./mj/constants.js";
import { bumpModelUsage, readMjModelUsage, todayInET } from "./mj/usage.js";
import { GEMINI_DAILY_LIMIT } from "./limits.js";
import { logError } from "./log.js";

const TYPE_WORD = { indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" };

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

let _profileSchemaReady = false;
async function ensureProfileSchema(env) {
  if (_profileSchemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS strain_profile (
      name_key   TEXT PRIMARY KEY,
      body       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  _profileSchemaReady = true;
}

// What the model is allowed to answer with. Every field optional: a strain it
// has never heard of should come back thin rather than invented.
const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    lineage: { type: "string" },
    aroma: { type: "array", items: { type: "string" } },
    flavour: { type: "array", items: { type: "string" } },
    effects: { type: "array", items: { type: "string" } },
    terpenes: { type: "array", items: { type: "string" } },
    growing: { type: "string" },
    difficulty: { type: "string" },
  },
};

const INSTRUCTION = [
  "You write short reference entries about cannabis and mushroom cultivars for growers.",
  "Given a cultivar name, describe what is generally known about it.",
  "Be factual and plain. No marketing language, no medical claims, no dosage advice.",
  "If you do not recognise the name, return only the fields you can honestly fill and omit the rest. An empty object is a valid answer: a made-up lineage is worse than no lineage.",
  "summary: two or three sentences on what this cultivar is.",
  "lineage: the cross it came from, if it is known.",
  "aroma, flavour, effects, terpenes: a few short words each, not sentences.",
  "growing: two or three sentences on how it grows - vigour, height, flowering time, what it likes.",
  "difficulty: one of easy, moderate, or demanding.",
].join("\n");

function tryParse(s) {
  try { const v = JSON.parse(s); return v && typeof v === "object" ? v : null; } catch { return null; }
}

/**
 * Pure: the page's HTML.
 *
 * `catalog` is what growers have recorded about the name (its type, whether it
 * is photoperiod, how long it flowers). `profile` is the written entry, or null
 * when there is not one yet - the page still stands up without it.
 */
export function renderStrainPage(catalog, profile) {
  const name = catalog?.name ?? "Unknown strain";
  const facts = [
    catalog?.type ? ["Type", TYPE_WORD[catalog.type] ?? catalog.type] : null,
    catalog?.photo === 1 ? ["Growth", "Photoperiod"] : catalog?.photo === 0 ? ["Growth", "Autoflower"] : null,
    catalog?.flower_weeks ? ["Flowering", `${catalog.flower_weeks} weeks`] : null,
    profile?.difficulty ? ["To grow", profile.difficulty] : null,
  ].filter(Boolean);

  const chips = (label, list) => {
    const items = (Array.isArray(list) ? list : []).map((s) => String(s).trim()).filter(Boolean).slice(0, 8);
    if (!items.length) return "";
    return `<section><h2>${esc(label)}</h2><ul class="chips">${
      items.map((s) => `<li>${esc(s)}</li>`).join("")}</ul></section>`;
  };

  const para = (label, text) => {
    const t = String(text ?? "").trim();
    return t ? `<section><h2>${esc(label)}</h2><p>${esc(t)}</p></section>` : "";
  };

  const body = profile
    ? [
        profile.summary ? `<p class="lede">${esc(profile.summary)}</p>` : "",
        profile.lineage ? `<p class="lineage"><span>Lineage</span> ${esc(profile.lineage)}</p>` : "",
        facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
          `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : "",
        chips("Aroma", profile.aroma),
        chips("Flavour", profile.flavour),
        chips("Effects", profile.effects),
        chips("Terpenes", profile.terpenes),
        para("Growing it", profile.growing),
      ].join("")
    : [
        `<p class="lede">No written profile for this one yet.</p>`,
        facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
          `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : "",
      ].join("");

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}</title>
<style>
:root{color-scheme:light dark;--bg:#faf7f2;--fg:#1a2e1a;--mut:#4a6a4a;--line:rgba(0,0,0,0.12);--card:#fff;}
@media(prefers-color-scheme:dark){:root{--bg:#0e1a12;--fg:#e8f5e3;--mut:#a0d0a0;--line:rgba(255,255,255,0.12);--card:#141f16;}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
main{max-width:640px;margin:0 auto;padding:28px 20px 60px;}
.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--mut);}
h1{font-size:34px;line-height:1.1;letter-spacing:-0.5px;margin:6px 0 0;}
.lede{font-size:17px;margin:18px 0 0;}
.lineage{margin:14px 0 0;color:var(--mut);font-size:14px;}
.lineage span{text-transform:uppercase;letter-spacing:1.2px;font-size:10px;font-weight:700;margin-right:6px;}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:20px 0 0;}
.facts div{background:var(--card);padding:11px 13px;}
dt{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);font-weight:700;}
dd{margin:3px 0 0;font-size:16px;font-weight:600;}
section{margin:26px 0 0;}
h2{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--mut);margin:0 0 9px;font-weight:700;}
p{margin:0;}
.chips{list-style:none;display:flex;flex-wrap:wrap;gap:7px;margin:0;padding:0;}
.chips li{border:1px solid var(--line);border-radius:14px;padding:5px 11px;font-size:14px;background:var(--card);}
footer{margin:36px 0 0;padding-top:16px;border-top:1px solid var(--line);
  font-size:11.5px;color:var(--mut);line-height:1.6;}
</style>
</head><body><main>
  <div class="eyebrow">Strain profile</div>
  <h1>${esc(name)}</h1>
  ${body}
  <footer>
    A general reference entry, written by this app's assistant and not verified
    against any laboratory result. Nothing here describes any particular
    harvest. For educational and personal record-keeping only.
  </footer>
</main></body></html>`;
}

function page(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Public and immutable enough to sit in a CDN for a day.
      "cache-control": status === 200 ? "public, max-age=86400" : "no-store",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

/** GET /s/:key - the public page for one strain. No session, no user data. */
export async function getStrainPage(env, rawKey) {
  const key = strainNameKey(decodeURIComponent(String(rawKey ?? "")));
  if (!key) return page(renderStrainPage(null, null), 404);

  // Only a name somebody actually grows gets a page, which is also what stops
  // an open endpoint from becoming a way to generate arbitrary text.
  let catalog = null;
  try {
    catalog = await env.DB.prepare(
      "SELECT name, type, flower_weeks, photo FROM strain_catalog WHERE name_key = ?",
    ).bind(key).first();
  } catch { /* catalog not created yet */ }
  if (!catalog) {
    return page(renderStrainPage({ name: "Not found" }, null), 404);
  }

  await ensureProfileSchema(env);
  const cached = await env.DB.prepare(
    "SELECT body FROM strain_profile WHERE name_key = ?",
  ).bind(key).first();
  if (cached?.body) return page(renderStrainPage(catalog, tryParse(cached.body)));

  const profile = await writeProfile(env, catalog);
  return page(renderStrainPage(catalog, profile));
}

// Write the entry once, then keep it. A failure here is not an error the reader
// should see: the page renders from the catalog's own facts instead.
async function writeProfile(env, catalog) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const today = todayInET();
  try {
    if (await readMjModelUsage(env, today, GEMINI_MODEL) >= GEMINI_DAILY_LIMIT) return null;
    await bumpModelUsage(env, GEMINI_MODEL, today);
    const profile = await askGeminiForJson({
      apiKey,
      model: GEMINI_MODEL,
      instruction: INSTRUCTION,
      text: catalog.name,
      schema: SCHEMA,
      gatewayBase: env.CF_AI_GATEWAY_URL ?? null,
    });
    if (!profile || Object.keys(profile).length === 0) return null;
    await env.DB.prepare(
      `INSERT INTO strain_profile (name_key, body, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(name_key) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
    ).bind(strainNameKey(catalog.name), JSON.stringify(profile)).run();
    return profile;
  } catch (err) {
    logError("strain-profile-failed", { name: catalog.name, message: String(err?.message ?? err) });
    return null;
  }
}
