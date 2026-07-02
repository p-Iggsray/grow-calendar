// @ts-check
// A global strain catalog shared across all users. Every strain a grower enters
// at setup is recorded here so anyone can autofill it when naming a plant. Names
// only - no user association - so it's a simple shared dictionary.
import { json } from "./util.js";

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
  _strainSchemaReady = true;
}

// Upsert each named strain from a grow's survey into the catalog. Best-effort:
// a failure here must never block grow setup.
export async function recordStrains(env, strains) {
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
        INSERT INTO strain_catalog (name_key, name, type, flower_weeks, photo, uses, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(name_key) DO UPDATE SET
          uses = uses + 1,
          name = excluded.name,
          type = COALESCE(excluded.type, strain_catalog.type),
          flower_weeks = COALESCE(excluded.flower_weeks, strain_catalog.flower_weeks),
          photo = excluded.photo,
          updated_at = excluded.updated_at
      `).bind(key, name, type, fw, photo, now).run();
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
