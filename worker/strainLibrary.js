// @ts-check
// The stored half of the strain library: one row per strain you have an
// opinion about.
//
// The list of strains you have GROWN is deliberately not stored here. It is
// derived from the plants in your spaces every time the screen opens (see
// src/lib/strainLibrary.js), because that is the only place it can be right.
// This table holds what no grow can tell us: the note, the stars, the
// favourite flag, and the seed packet's own claims about type, photoperiod and
// weeks of flower.
//
// Rows are keyed by the lowercased name rather than by any plant or grow id,
// which is what lets an opinion outlive the grow that earned it. Delete the
// space, and the rating is still waiting for the next time you run that strain.
import { json, error, nowIso, safeJsonBounded } from "./util.js";
import { ensurePlantLogSchema } from "./plants.js";
import { ensureJournalPhotosSchema } from "./photos.js";
import {
  strainNameKey, cleanStrainName, normalizeRating, normalizeFlowerWeeks,
  renameStrainInSurvey, removeStrainFromSurvey, mergeStrainRows,
  NOTE_MAX, STRAIN_TYPES,
} from "../src/lib/strainLibrary.js";

const TYPES = new Set(STRAIN_TYPES);
// Room for a lifetime of growing. Well short of anything D1 would object to.
const MAX_ROWS = 2000;
const BODY_MAX = NOTE_MAX + 4096;

let _schemaReady = false;
export async function ensureStrainLibrarySchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS strain_library (
      user_id      INTEGER NOT NULL,
      name_key     TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      note         TEXT,
      rating       INTEGER NOT NULL DEFAULT 0,
      favorite     INTEGER NOT NULL DEFAULT 0,
      type         TEXT,
      photo        INTEGER,
      flower_weeks INTEGER,
      created_at   TEXT    NOT NULL,
      updated_at   TEXT    NOT NULL,
      PRIMARY KEY (user_id, name_key)
    )
  `).run();
  _schemaReady = true;
}

/**
 * Pure: validate and normalize a save.
 *
 * Every field except the name is optional and independently omittable, so the
 * screen can send just a favourite toggle without having to resend the note it
 * is not touching. Returns { ok:true, value } or { ok:false, message }.
 */
export function validateStrainEntry(body) {
  if (!body || typeof body !== "object") return { ok: false, message: "invalid body" };

  const name = cleanStrainName(body.name);
  const key = strainNameKey(body.name);
  if (!name || !key) return { ok: false, message: "a strain needs a name" };

  const out = { nameKey: key, name };
  const has = (k) => body[k] !== undefined;

  if (has("note")) {
    if (body.note !== null && typeof body.note !== "string") {
      return { ok: false, message: "note must be text" };
    }
    out.note = body.note === null ? "" : body.note.slice(0, NOTE_MAX);
  }
  if (has("rating")) {
    if (body.rating !== null && !Number.isFinite(Number(body.rating))) {
      return { ok: false, message: "rating must be a number of stars" };
    }
    out.rating = normalizeRating(body.rating ?? 0);
  }
  if (has("favorite")) {
    if (typeof body.favorite !== "boolean") return { ok: false, message: "favorite must be true or false" };
    out.favorite = body.favorite;
  }
  if (has("type")) {
    if (body.type !== null && !TYPES.has(body.type)) return { ok: false, message: "invalid type" };
    out.type = body.type ?? null;
  }
  if (has("photo")) {
    if (body.photo !== null && typeof body.photo !== "boolean") {
      return { ok: false, message: "photo must be true or false" };
    }
    out.photo = body.photo ?? null;
  }
  if (has("flowerWeeks")) {
    // An out-of-range number is a typo worth reporting, but an empty box just
    // means the packet did not say.
    if (body.flowerWeeks !== null && body.flowerWeeks !== "") {
      const raw = Number(body.flowerWeeks);
      if (!Number.isFinite(raw)) return { ok: false, message: "flower weeks must be a number" };
    }
    out.flowerWeeks = normalizeFlowerWeeks(body.flowerWeeks);
  }
  return { ok: true, value: out };
}

// Row to the shape the client works in.
function rowToEntry(r) {
  return {
    name: r.name,
    note: r.note ?? "",
    rating: r.rating ?? 0,
    favorite: r.favorite === 1,
    type: r.type ?? null,
    photo: r.photo == null ? null : r.photo === 1,
    flowerWeeks: r.flower_weeks ?? null,
    updatedAt: r.updated_at,
  };
}

// GET /api/strain-library
export async function listStrainEntries(env, user) {
  await ensureStrainLibrarySchema(env);
  const res = await env.DB.prepare(
    `SELECT name, note, rating, favorite, type, photo, flower_weeks, updated_at
     FROM strain_library WHERE user_id = ? ORDER BY name LIMIT ${MAX_ROWS}`
  ).bind(user.id).all();
  return json({ entries: (res.results ?? []).map(rowToEntry) });
}

// PUT /api/strain-library  {name, note?, rating?, favorite?, type?, photo?, flowerWeeks?}
//
// The name travels in the body rather than the path on purpose: strain names
// carry spaces, slashes and apostrophes, and none of that has to be escaped
// twice if it never becomes a URL.
export async function putStrainEntry(request, env, user) {
  const p = await safeJsonBounded(request, BODY_MAX);
  if (!p.ok) return error(p.status, p.error);
  const v = validateStrainEntry(p.data);
  if (!v.ok) return error(400, v.message);
  await ensureStrainLibrarySchema(env);

  const count = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM strain_library WHERE user_id = ?"
  ).bind(user.id).first();
  const full = (count?.n ?? 0) >= MAX_ROWS;

  const { values, provided } = entryWritePlan(v.value);
  const now = nowIso();
  const flag = (on) => (on ? 1 : 0);

  // The merge happens IN the statement, not around it. Reading the row and
  // writing it back would leave a window where a star tapped and a note typed
  // a moment apart both merge onto the same stale row and the loser's field
  // vanishes. Here each column either takes the new value or keeps its own,
  // decided by a flag, so two saves in flight cannot erase each other. The
  // INSERT half always supplies a real value, so no NOT NULL column can ever
  // be handed a null.
  const row = await env.DB.prepare(`
    INSERT INTO strain_library
      (user_id, name_key, name, note, rating, favorite, type, photo, flower_weeks, created_at, updated_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE ? = 0 OR EXISTS (SELECT 1 FROM strain_library WHERE user_id = ? AND name_key = ?)
    ON CONFLICT(user_id, name_key) DO UPDATE SET
      name         = excluded.name,
      note         = CASE WHEN ? = 1 THEN excluded.note         ELSE strain_library.note         END,
      rating       = CASE WHEN ? = 1 THEN excluded.rating       ELSE strain_library.rating       END,
      favorite     = CASE WHEN ? = 1 THEN excluded.favorite     ELSE strain_library.favorite     END,
      type         = CASE WHEN ? = 1 THEN excluded.type         ELSE strain_library.type         END,
      photo        = CASE WHEN ? = 1 THEN excluded.photo        ELSE strain_library.photo        END,
      flower_weeks = CASE WHEN ? = 1 THEN excluded.flower_weeks ELSE strain_library.flower_weeks END,
      updated_at   = excluded.updated_at
    RETURNING name, note, rating, favorite, type, photo, flower_weeks, updated_at
  `).bind(
    user.id, v.value.nameKey, v.value.name,
    values.note, values.rating, values.favorite, values.type, values.photo, values.flowerWeeks,
    now, now,
    // A full library still accepts edits to strains already in it; it only
    // refuses brand new ones.
    flag(full), user.id, v.value.nameKey,
    flag(provided.note), flag(provided.rating), flag(provided.favorite),
    flag(provided.type), flag(provided.photo), flag(provided.flowerWeeks),
  ).first();

  if (!row) return error(400, `the library holds at most ${MAX_ROWS} strains`);
  return json({ entry: rowToEntry(row) });
}

/**
 * Pure: how one save should be written.
 *
 * `values` are what a brand new row gets, already in DB-column form (booleans
 * as 0/1, absent fields as their column default). `provided` says which columns
 * this save actually spoke about, which is what lets an existing row keep
 * everything the save did not mention.
 */
export function entryWritePlan(patch) {
  return {
    values: {
      note: patch.note ?? "",
      rating: patch.rating ?? 0,
      favorite: patch.favorite ? 1 : 0,
      type: patch.type ?? null,
      photo: patch.photo === undefined || patch.photo === null ? null : (patch.photo ? 1 : 0),
      flowerWeeks: patch.flowerWeeks ?? null,
    },
    provided: {
      note: patch.note !== undefined,
      rating: patch.rating !== undefined,
      favorite: patch.favorite !== undefined,
      type: patch.type !== undefined,
      photo: patch.photo !== undefined,
      flowerWeeks: patch.flowerWeeks !== undefined,
    },
  };
}

// DELETE /api/strain-library  {name}
//
// Forgets what you thought about a strain. It does not touch a single plant,
// so a strain you have actually grown simply reappears in the library
// unrated, which is the honest outcome: the growing happened either way.
export async function deleteStrainEntry(request, env, user) {
  const p = await safeJsonBounded(request, 4096);
  if (!p.ok) return error(p.status, p.error);
  const key = strainNameKey(p.data?.name);
  if (!key) return error(400, "a strain needs a name");
  await ensureStrainLibrarySchema(env);
  const { meta } = await env.DB.prepare(
    "DELETE FROM strain_library WHERE user_id = ? AND name_key = ?"
  ).bind(user.id, key).run();
  if (!meta.changes) return error(404, "not in your library");
  return json({ ok: true });
}

// Every space, with its survey parsed. The plant roster only exists in there.
async function loadSurveys(env, userId) {
  const res = await env.DB.prepare(
    "SELECT id, survey FROM grows WHERE user_id = ?"
  ).bind(userId).all();
  return (res.results ?? []).map((g) => {
    let survey = null;
    try { survey = g.survey ? JSON.parse(g.survey) : null; } catch { survey = null; }
    return { id: g.id, survey };
  });
}

async function saveSurvey(env, userId, growId, survey) {
  await env.DB.prepare(
    "UPDATE grows SET survey = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?"
  ).bind(JSON.stringify(survey), growId, userId).run();
}

// POST /api/strain-library/rename  {from, to}
//
// Renaming has to reach the plants, or it lasts exactly until the next render:
// the list is derived from them, so the old name would come straight back out
// of the spaces. Every plant of the strain is renamed, in every space, and the
// saved row moves with it.
export async function renameStrain(request, env, user) {
  const p = await safeJsonBounded(request, 4096);
  if (!p.ok) return error(p.status, p.error);

  const fromKey = strainNameKey(p.data?.from);
  const toName = cleanStrainName(p.data?.to);
  const toKey = strainNameKey(p.data?.to);
  if (!fromKey) return error(400, "which strain?");
  if (!toName || !toKey) return error(400, "a strain needs a name");
  if (fromKey === toKey) {
    // Only the capitalisation changed. Still worth doing, still not a merge.
    if (cleanStrainName(p.data?.from) === toName) return json({ ok: true, renamed: 0, merged: false });
  }

  await ensureStrainLibrarySchema(env);
  const surveys = await loadSurveys(env, user.id);

  let renamed = 0;
  let spaces = 0;
  for (const g of surveys) {
    const out = renameStrainInSurvey(g.survey, fromKey, toName);
    if (!out.count) continue;
    await saveSurvey(env, user.id, g.id, out.survey);
    renamed += out.count;
    spaces += 1;
  }

  // Move what you had written about it. Renaming onto a name already in the
  // library is nearly always fixing a typo, so the two rows merge rather than
  // one of them being refused or quietly lost.
  const [source, target] = await Promise.all([
    env.DB.prepare("SELECT * FROM strain_library WHERE user_id = ? AND name_key = ?").bind(user.id, fromKey).first(),
    fromKey === toKey ? Promise.resolve(null)
      : env.DB.prepare("SELECT * FROM strain_library WHERE user_id = ? AND name_key = ?").bind(user.id, toKey).first(),
  ]);
  const merged = Boolean(source && target);

  if (source || target) {
    const shaped = (r) => (r ? {
      name: r.name, note: r.note ?? "", rating: r.rating ?? 0, favorite: r.favorite === 1,
      type: r.type ?? null, photo: r.photo == null ? null : r.photo === 1, flowerWeeks: r.flower_weeks ?? null,
    } : null);
    const row = mergeStrainRows(shaped(target), shaped(source));
    const now = nowIso();
    await env.DB.prepare("DELETE FROM strain_library WHERE user_id = ? AND name_key IN (?, ?)")
      .bind(user.id, fromKey, toKey).run();
    await env.DB.prepare(`
      INSERT INTO strain_library
        (user_id, name_key, name, note, rating, favorite, type, photo, flower_weeks, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    // The name you typed wins over the merged row's, including its casing:
    // the plants were just renamed to it, so anything else would disagree.
    `).bind(
      user.id, toKey, toName, row.note.slice(0, NOTE_MAX), row.rating,
      row.favorite ? 1 : 0, row.type,
      row.photo === null || row.photo === undefined ? null : (row.photo ? 1 : 0),
      row.flowerWeeks, source?.created_at ?? target?.created_at ?? now, now,
    ).run();
  }

  return json({ ok: true, name: toName, key: toKey, renamed, spaces, merged });
}

// POST /api/strain-library/remove  {name}
//
// The whole strain: every plant of it in every space, their per-plant history,
// and what you had written about it. Photos are kept - they belong to the day
// they were taken as much as to the plant - but they stop being tagged with a
// plant that no longer exists.
export async function removeStrain(request, env, user) {
  const p = await safeJsonBounded(request, 4096);
  if (!p.ok) return error(p.status, p.error);
  const key = strainNameKey(p.data?.name);
  if (!key) return error(400, "a strain needs a name");

  await ensureStrainLibrarySchema(env);
  await ensurePlantLogSchema(env);
  await ensureJournalPhotosSchema(env);

  const surveys = await loadSurveys(env, user.id);
  let plants = 0;
  let spaces = 0;
  let photosUntagged = 0;

  for (const g of surveys) {
    const out = removeStrainFromSurvey(g.survey, key);
    if (!out.removedIds.length) continue;
    await saveSurvey(env, user.id, g.id, out.survey);
    plants += out.removedIds.length;
    spaces += 1;

    const holes = out.removedIds.map(() => "?").join(",");
    await env.DB.prepare(
      `DELETE FROM plant_log WHERE user_id = ? AND grow_id = ? AND plant_id IN (${holes})`
    ).bind(user.id, g.id, ...out.removedIds).run();
    const { meta } = await env.DB.prepare(
      `UPDATE journal_photos SET plant_id = NULL
       WHERE user_id = ? AND grow_id = ? AND plant_id IN (${holes})`
    ).bind(user.id, g.id, ...out.removedIds).run();
    photosUntagged += meta?.changes ?? 0;
  }

  await env.DB.prepare(
    "DELETE FROM strain_library WHERE user_id = ? AND name_key = ?"
  ).bind(user.id, key).run();

  return json({ ok: true, plants, spaces, photosUntagged });
}
