// @ts-check
// Which pictures belong to which strain.
//
// Nothing in the database says "this photo is of Blue Dream". A photo is
// tagged with the plant it is of, and a plant carries the strain name it was
// given, so the link exists but only through the survey JSON that holds the
// roster. That join happens here, once, over every space at a time: the client
// is asking about the whole library rather than one grow.
//
// What comes back is ids, not pictures. The actual bytes are fetched per image
// by the browser from /api/photos/:id/thumb, so a library of sixty strains
// costs one small request plus whatever scrolls into view.
import { json } from "./util.js";
import { ensureJournalPhotosSchema } from "./photos.js";
import { ensurePlantLogSchema } from "./plants.js";
import { stageFromRow } from "./stages.js";
import { strainNameKey, plantStrain } from "../src/lib/strainLibrary.js";
import { pickStrainPhotos } from "../src/lib/strainPhotos.js";

// Enough to cover a long history without ever letting one request grow
// unbounded. A grow is capped at 800 photos, so this is several full spaces.
const MAX_PHOTOS = 4000;
const MAX_STAGE_ROWS = 4000;
// Per strain. One per stage is eight, and eight is already a growth sequence.
const PER_STRAIN = 8;

// GET /api/strain-library/photos
export async function getStrainPhotos(env, user) {
  await ensureJournalPhotosSchema(env);
  await ensurePlantLogSchema(env);

  const grows = await env.DB.prepare(
    "SELECT id, survey FROM grows WHERE user_id = ?"
  ).bind(user.id).all();

  // plant id -> the strain it is. The only place this mapping exists.
  const strainOfPlant = new Map();
  for (const g of grows.results ?? []) {
    let survey = null;
    try { survey = g.survey ? JSON.parse(g.survey) : null; } catch { survey = null; }
    for (const plant of Array.isArray(survey?.strains) ? survey.strains : []) {
      const key = strainNameKey(plantStrain(plant));
      if (plant?.id && key) strainOfPlant.set(plant.id, key);
    }
  }
  if (strainOfPlant.size === 0) return json({ photos: {} });

  const [photoRes, stageRes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, grow_id, date, plant_id FROM journal_photos
       WHERE user_id = ? AND plant_id IS NOT NULL
       ORDER BY date ASC, created_at ASC LIMIT ${MAX_PHOTOS}`
    ).bind(user.id).all(),
    env.DB.prepare(
      `SELECT plant_id, date, body, detail FROM plant_log
       WHERE user_id = ? AND kind = 'stage' AND plant_id IS NOT NULL
       ORDER BY date ASC, id ASC LIMIT ${MAX_STAGE_ROWS}`
    ).bind(user.id).all(),
  ]);

  // Each plant's stage history, oldest first, which is what dates a photo.
  const historyByPlant = {};
  for (const r of stageRes.results ?? []) {
    const stage = stageFromRow(r);
    if (!stage) continue;
    (historyByPlant[r.plant_id] ??= []).push({ date: r.date, stage });
  }

  const byStrain = new Map();
  for (const p of photoRes.results ?? []) {
    const key = strainOfPlant.get(p.plant_id);
    if (!key) continue;   // a photo of a plant that has since been removed
    (byStrain.get(key) ?? byStrain.set(key, []).get(key)).push({
      id: p.id, growId: p.grow_id, date: p.date, plantId: p.plant_id,
    });
  }

  const photos = {};
  for (const [key, list] of byStrain) {
    photos[key] = pickStrainPhotos(list, historyByPlant, PER_STRAIN)
      .map(({ id, growId, date, stage }) => ({ id, growId, date, stage }));
  }
  return json({ photos });
}
