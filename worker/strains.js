// @ts-check
// The strain catalog: every cannabis variety named at setup, kept so naming a
// plant can autofill from what has been grown before. Names only, no user
// association.
//
// TWO THINGS NEVER GO IN HERE, and both matter because a catalog row is the one
// thing in this app with a public face (see worker/strainPage.js):
//
//   * a mushroom variety. Nothing about a mushroom grow is public, ever, and a
//     catalog row is the back door that would have made one so.
//   * anything else a future crop adds. The gate is an allowlist of one, not a
//     list of exclusions, so a crop added later is private until somebody
//     deliberately decides otherwise.
import { json, bytesToBase64Url } from "./util.js";
import { logError } from "./log.js";
import { cropOf } from "../src/lib/crops.js";
import { strainNameKey } from "../src/lib/strainLibrary.js";

// The only crop whose names are allowed a public page.
const PUBLIC_CROP = "cannabis";

const TYPES = new Set(["indica", "sativa", "hybrid"]);

let _strainSchemaReady = false;
async function ensureStrainSchema(env) {
  if (_strainSchemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS strain_catalog (
      name_key     TEXT PRIMARY KEY,   -- lowercased name, for dedup
      name         TEXT NOT NULL,      -- display name (first-seen casing)
      type         TEXT,
      flower_weeks INTEGER,
      photo        INTEGER,            -- 1 = photoperiod, 0 = autoflower
      uses         INTEGER NOT NULL DEFAULT 1,
      updated_at   TEXT NOT NULL
    )
  `).run();
  // Tables created before these columns existed self-heal them.
  // page_code addresses the public page. It is random rather than derived from
  // the name, which is the whole point: the old page lived at /s/<name>, so
  // anyone could confirm which varieties existed by guessing words.
  try { await env.DB.prepare("ALTER TABLE strain_catalog ADD COLUMN page_code TEXT").run(); } catch { /* exists */ }
  try { await env.DB.prepare("ALTER TABLE strain_catalog ADD COLUMN crop TEXT").run(); } catch { /* exists */ }
  await env.DB.prepare(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_strain_catalog_code ON strain_catalog (page_code)"
  ).run();
  // The written profiles cached against these names. Created here as well as in
  // strainPage.js because the sweep deletes from it, and a database where
  // nobody has ever opened a strain page does not have the table yet. That
  // missing table is what made the sweep fail, and a sweep that never finishes
  // is one that never stops being attempted.
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS strain_profile (
      name_key   TEXT PRIMARY KEY,
      body       TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `).run();
  _strainSchemaReady = true;
}

/** A page address nobody can arrive at by guessing a strain name. */
export function newPageCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * Take every name of a crop that is not public out of the catalog, and out of
 * the profile cache with it.
 *
 * The catalog predates the crop column, so rows written before it carry no
 * crop at all. Those cannot be judged by what is in the catalog: the answer is
 * in the grower's own surveys, which is where this reads it from.
 */
export async function purgeNonPublicStrains(env, userId) {
  await ensureStrainSchema(env);
  const res = await env.DB.prepare(
    "SELECT survey FROM grows WHERE user_id = ? AND survey IS NOT NULL"
  ).bind(userId).all();

  const banned = new Set();
  for (const row of res.results ?? []) {
    let survey = null;
    try { survey = JSON.parse(row.survey); } catch { continue; }
    if (cropOf(survey) === PUBLIC_CROP) continue;
    for (const s of survey?.strains ?? []) {
      const key = strainNameKey(s?.name ?? "");
      if (key) banned.add(key);
    }
  }
  if (!banned.size) return 0;

  const marks = [...banned].map(() => "?").join(",");
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM strain_catalog WHERE name_key IN (${marks})`).bind(...banned),
    env.DB.prepare(`DELETE FROM strain_profile WHERE name_key IN (${marks})`).bind(...banned),
  ]);
  return banned.size;
}

/**
 * Upsert a grow's varieties into the catalog. Best-effort: a failure here must
 * never block grow setup.
 *
 * Takes the whole survey rather than its strain list, because the crop is the
 * first thing it has to know. A mushroom tub's varieties are recorded nowhere
 * outside the grower's own record.
 */
export async function recordStrains(env, survey) {
  if (cropOf(survey) !== PUBLIC_CROP) return;
  const strains = survey?.strains;
  if (!Array.isArray(strains) || strains.length === 0) return;
  try {
    await ensureStrainSchema(env);
    const now = new Date().toISOString();
    const seen = new Set();
    for (const s of strains) {
      const name = typeof s?.name === "string" ? s.name.trim().slice(0, 60) : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;        // count each strain once per grow
      seen.add(key);
      const type = TYPES.has(s?.type) ? s.type : null;
      const fw = Number.isFinite(Number(s?.flowerWeeks)) ? Math.max(4, Math.min(20, Math.round(Number(s.flowerWeeks)))) : null;
      const photo = s?.photo === false ? 0 : 1;
      await env.DB.prepare(`
        INSERT INTO strain_catalog (name_key, name, type, flower_weeks, photo, uses, updated_at, crop, page_code)
        VALUES (?, ?, ?, ?, ?, 1, ?, '${PUBLIC_CROP}', ?)
        ON CONFLICT(name_key) DO UPDATE SET
          uses = uses + 1,
          name = excluded.name,
          type = COALESCE(excluded.type, strain_catalog.type),
          flower_weeks = COALESCE(excluded.flower_weeks, strain_catalog.flower_weeks),
          photo = excluded.photo,
          updated_at = excluded.updated_at,
          crop = excluded.crop,
          -- An existing row keeps the code it already handed out, so a label
          -- printed last year still scans.
          page_code = COALESCE(strain_catalog.page_code, excluded.page_code)
      `).bind(key, name, type, fw, photo, now, newPageCode()).run();
    }
  } catch { /* catalog is a nicety; never fail setup over it */ }
}

// GET /api/strains → the catalog for autofill, most-used first.
export async function listStrains(env, _user) {
  await ensureStrainSchema(env);
  let res;
  try {
    res = await env.DB.prepare(
      "SELECT name, type, flower_weeks, photo FROM strain_catalog ORDER BY uses DESC, name ASC LIMIT 1000"
    ).all();
  } catch {
    return json([]);
  }
  return json((res.results ?? []).map(r => ({
    name: r.name,
    type: r.type ?? "hybrid",
    flowerWeeks: r.flower_weeks ?? 9,
    photo: r.photo !== 0,
  })));
}

// One-time cleanup, run on the owner's next visit rather than as a migration
// file, because deciding which catalog rows are mushrooms needs their surveys.
//
// It is one-time in earnest, and the first version of it was not. That one
// memoized only on success, in a module variable, and sat in front of every
// authenticated request. It deleted from a table that only existed once
// somebody had opened a strain page, so on a database where nobody ever had,
// it threw every time, was swallowed every time, and never recorded itself as
// done: every API call the app made then re-ran a scan of every grow and a
// failing batch before getting to its own work.
//
// So: the marker lives in the database rather than in a module variable, and
// the flag is set whatever happens. The work is attempted once per deploy at
// the very most, and a failure costs one request rather than all of them.
const SWEEP_MARKER = "strain_privacy_sweep_v1";
let _privacySwept = false;

export async function ensureStrainPrivacy(env, userId) {
  if (_privacySwept) return;
  // Set first. Nothing here is worth a second attempt inside one isolate, and
  // a failing attempt least of all.
  _privacySwept = true;
  try {
    await env.DB.prepare(
      "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    ).run();
    const done = await env.DB.prepare(
      "SELECT value FROM settings WHERE key = ?"
    ).bind(SWEEP_MARKER).first();
    if (done) return;

    await purgeNonPublicStrains(env, userId);
    await env.DB.prepare(
      "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
    ).bind(SWEEP_MARKER, new Date().toISOString()).run();
  } catch (err) {
    // A sweep that cannot run leaves a privacy job undone, which is worth
    // knowing about. It is not worth failing the request it rode in on, and
    // not worth retrying in front of every request either.
    logError("strain-privacy-sweep", { message: String(err?.message ?? err) });
  }
}

/**
 * GET /api/strains/page-code?name=... - where this variety's label points.
 *
 * Owner-only, and the only way a code ever leaves the server. A variety with no
 * public page (a mushroom, or a name nobody has grown) answers null, and its
 * label prints without a code rather than with a dead one.
 */
export async function getStrainPageCode(env, user, nameRaw) {
  const key = strainNameKey(nameRaw ?? "");
  if (!key) return json({ code: null });
  await ensureStrainSchema(env);

  const row = await env.DB.prepare(
    "SELECT name_key, crop, page_code FROM strain_catalog WHERE name_key = ?"
  ).bind(key).first();
  if (!row || (row.crop != null && row.crop !== PUBLIC_CROP)) return json({ code: null });
  if (row.page_code) return json({ code: row.page_code });

  // A row from before codes existed gets one the first time its label is drawn.
  const code = newPageCode();
  await env.DB.prepare(
    "UPDATE strain_catalog SET page_code = ? WHERE name_key = ? AND page_code IS NULL"
  ).bind(code, key).run();
  const fresh = await env.DB.prepare(
    "SELECT page_code FROM strain_catalog WHERE name_key = ?"
  ).bind(key).first();
  return json({ code: fresh?.page_code ?? null });
}
