// @ts-check
// The page a label's code opens: a public profile of one strain.
//
// It is deliberately about the STRAIN and nothing else. Hand somebody a jar and
// they can read what the variety is; they cannot read your grow. No rating, no
// notes, no dates, no spaces, no session - the page never touches a user row,
// so there is nothing here to leak.
//
// It used to live at /s/<strain name>, which meant it leaked the one thing it
// had: whether a name was in the catalog at all. A word is guessable, so anyone
// could walk a list of variety names and read back which ones came up 200. In a
// single-person app that catalog is one person's shelf. The address is now a
// random code minted per variety and handed out only to its own label, so the
// page is reachable by scanning the jar and by nothing else.
//
// Mushrooms never get here. They are kept out of the catalog upstream
// (worker/strains.js) and refused again below, because one gate is not a gate.
//
// The page shows only what growers recorded in the catalog: the type, whether
// it is photoperiod, and how long it flowers.

import { catMarkSvg } from "../src/lib/catMark.js";

const TYPE_WORD = { indica: "Indica", sativa: "Sativa", hybrid: "Hybrid" };

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/**
 * Pure: the page's HTML.
 *
 * `catalog` is what growers have recorded about the name (its type, whether it
 * is photoperiod, how long it flowers).
 */
export function renderStrainPage(catalog) {
  const name = catalog?.name ?? "Unknown strain";
  const facts = [
    catalog?.type ? ["Type", TYPE_WORD[catalog.type] ?? catalog.type] : null,
    catalog?.photo === 1 ? ["Growth", "Photoperiod"] : catalog?.photo === 0 ? ["Growth", "Autoflower"] : null,
    catalog?.flower_weeks ? ["Flowering", `${catalog.flower_weeks} weeks`] : null,
  ].filter(Boolean);

  const body = facts.length ? `<dl class="facts">${facts.map(([k, v]) =>
    `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : "";

  return `<!doctype html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(name)}</title>
<style>
:root{color-scheme:dark;--bg:#0c0b0a;--fg:#f5f0e8;--mut:#a0917c;--acc:#e0913f;
  --line:rgba(255,244,228,0.12);--card:#171512;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);
  font:16px/1.65 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;}
main{max-width:640px;margin:0 auto;padding:28px 20px 60px;}
.brand{display:flex;align-items:center;gap:9px;margin:0 0 20px;}
.brand svg{display:block;flex:none;}
.brand span{font-size:11px;letter-spacing:2.4px;text-transform:uppercase;
  font-weight:700;color:var(--mut);}
.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--acc);}
h1{font-size:34px;line-height:1.1;letter-spacing:-0.5px;margin:6px 0 0;}
.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:1px;
  background:var(--line);border:1px solid var(--line);border-radius:10px;overflow:hidden;margin:20px 0 0;}
.facts div{background:var(--card);padding:11px 13px;}
dt{font-size:10px;letter-spacing:1.2px;text-transform:uppercase;color:var(--mut);font-weight:700;}
dd{margin:3px 0 0;font-size:16px;font-weight:600;}
footer{margin:36px 0 0;padding-top:16px;border-top:1px solid var(--line);
  font-size:11.5px;color:var(--mut);line-height:1.6;}
</style>
</head><body><main>
  <div class="brand">${catMarkSvg({ width: 30 })}<span>Black Cat Botanicals</span></div>
  <div class="eyebrow">Strain profile</div>
  <h1>${esc(name)}</h1>
  ${body}
  <footer>
    The variety as growers recorded it in this app. Nothing here describes any
    particular harvest. For educational and personal record-keeping only.
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
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      "x-content-type-options": "nosniff",
    },
  });
}

// Only the shape a minted code can have. Anything else is not a code somebody
// scanned, so it never reaches the database.
const PAGE_CODE_RE = /^[A-Za-z0-9_-]{12,32}$/;

/** GET /s/:code - the public page for one strain. No session, no user data. */
export async function getStrainPage(env, rawCode) {
  const code = decodeURIComponent(String(rawCode ?? ""));
  if (!PAGE_CODE_RE.test(code)) return page(renderStrainPage({ name: "Not found" }), 404);

  // Only a variety somebody actually grows gets a page.
  let catalog = null;
  try {
    catalog = await env.DB.prepare(
      "SELECT name_key, name, type, flower_weeks, photo, crop FROM strain_catalog WHERE page_code = ?",
    ).bind(code).first();
  } catch { /* catalog not created yet */ }
  // The second gate. A row that predates the crop column reads as cannabis,
  // which is what it was: nothing else was ever recorded here.
  if (!catalog || (catalog.crop != null && catalog.crop !== "cannabis")) {
    return page(renderStrainPage({ name: "Not found" }), 404);
  }
  return page(renderStrainPage(catalog));
}
