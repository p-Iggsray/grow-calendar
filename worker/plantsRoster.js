// @ts-check
// Pure helpers for the per-plant roster (stored in a grow's survey.strains[])
// and for validating log-entry input. No DB access, so these are unit-testable
// in isolation with node --test.
import {
  cropOf, defaultStage, defaultVarietyType, isVarietyType, stagesFor, words,
} from "../src/lib/crops.js";

// A roster entry is a cannabis plant or a mushroom tub, and which one decides
// its stages and its type. The crop travels on the survey, so every function
// here that judges a stage or a type takes the survey (or a crop) with it.
export const PLANT_STATUSES = new Set(["growing", "harvested", "dead"]);
export const HEALTH_VALUES = new Set(["thriving", "healthy", "stressed", "sick"]);
export const HEIGHT_UNITS = new Set(["in", "cm"]);
/** The stages a roster of this crop may use. */
export function stageSet(crop) {
  return new Set(stagesFor(crop));
}

const NAME_MAX = 60;

export function newPlantId() {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Assigns a stable id + default status to any strain entry missing them.
// Returns { survey, changed }. Never mutates the input.
export function ensurePlantIds(survey) {
  if (!survey || !Array.isArray(survey.strains)) return { survey, changed: false };
  const crop = cropOf(survey);
  const allowed = stageSet(crop);
  const fallback = defaultStage(crop);
  let changed = false;
  const strains = survey.strains.map((s) => {
    const next = { ...s };
    if (!next.id) { next.id = newPlantId(); changed = true; }
    if (!PLANT_STATUSES.has(next.status)) { next.status = "growing"; changed = true; }
    // A stage from the other crop can only mean the space was switched over,
    // so the entry starts again at the beginning of the ladder it is on now.
    if (!allowed.has(next.stage)) { next.stage = fallback; changed = true; }
    return next;
  });
  return changed ? { survey: { ...survey, strains }, changed: true } : { survey, changed: false };
}

// Validates + normalizes plant roster fields. partial=true allows a subset
// (PATCH). `crop` decides which stages and which variety types are legal, so a
// monotub cannot be told one of its tubs is flowering.
export function validatePlantFields(fields, partial = false, crop = undefined) {
  const kind = cropOf(crop);
  const out = {};
  const has = (k) => fields[k] !== undefined;

  if (has("name") || !partial) {
    const name = String(fields.name ?? "").trim();
    if (!name) return { ok: false, error: "name required" };
    out.name = name.slice(0, NAME_MAX);
  }
  // The strain this plant grew from, when it differs from what you call the
  // plant. Three states, and they are genuinely different things:
  //
  //   absent  the plant's own name is its strain (the usual case)
  //   "Blue Dream"  an explicit strain, because the plant is called something else
  //   ""      this plant claims NO strain, which is what removing a strain from
  //           the library leaves behind on plants that were named after it
  //
  // null asks for the first: undefined here means JSON.stringify drops the key
  // when the survey is saved, so the override really is removed rather than
  // being stored as an empty string that would mean the opposite.
  if (has("strain")) {
    if (fields.strain === null) out.strain = undefined;
    else if (typeof fields.strain !== "string") return { ok: false, error: "invalid strain" };
    else out.strain = fields.strain.trim().slice(0, NAME_MAX);
  }
  if (has("type") || !partial) {
    const type = String(fields.type ?? defaultVarietyType(kind));
    if (!isVarietyType(kind, type)) return { ok: false, error: "invalid type" };
    out.type = type;
  }
  if (has("photo") || !partial) {
    out.photo = Boolean(fields.photo ?? true);
  }
  if (has("flowerWeeks") || !partial) {
    const w = words(kind);
    const fw = Number(fields.flowerWeeks ?? w.lengthDefault);
    if (!Number.isFinite(fw) || fw < 1 || fw > 20) return { ok: false, error: "flowerWeeks out of range" };
    out.flowerWeeks = Math.round(fw);
  }
  if (has("potSize")) {
    if (fields.potSize === null || fields.potSize === "") {
      out.potSize = null;
    } else {
      const ps = Number(fields.potSize);
      if (!Number.isFinite(ps) || ps < 0 || ps > 400) return { ok: false, error: "potSize out of range" };
      out.potSize = ps;
    }
  }
  if (has("stage") || !partial) {
    const stage = String(fields.stage ?? defaultStage(kind));
    if (!stageSet(kind).has(stage)) return { ok: false, error: "invalid stage" };
    out.stage = stage;
  }
  if (has("status")) {
    if (!PLANT_STATUSES.has(fields.status)) return { ok: false, error: "invalid status" };
    out.status = fields.status;
  }
  return { ok: true, value: out };
}

// Seed a per-plant roster from an AI-generated plan's strain slots when the grow
// has none yet. This keeps the Plants section (which reads survey.strains) from
// ever lagging behind the calendar/garden (which fall back to the plan's strains
// when the survey is empty). Only fires when survey.strains is empty AND the plan
// has named strains; otherwise it is a no-op. Never mutates the input.
// Returns { survey, changed }.
export function backfillStrainsFromPlan(survey, generatedPlan, idGen = newPlantId) {
  const existing = survey && Array.isArray(survey.strains) ? survey.strains : [];
  if (existing.length > 0) return { survey, changed: false };

  const crop = cropOf(survey);
  const w = words(crop);
  const planStrains = Array.isArray(generatedPlan?.strains) ? generatedPlan.strains : [];
  const strains = planStrains
    .filter((s) => s && String(s.name ?? "").trim())
    .map((s) => {
      const fw = Number(s.flowerWeeks);
      return {
        id: idGen(),
        name: String(s.name).trim().slice(0, NAME_MAX),
        type: isVarietyType(crop, s.type) ? s.type : defaultVarietyType(crop),
        photo: s.photo !== undefined ? Boolean(s.photo) : true,
        flowerWeeks: Number.isFinite(fw) ? Math.min(20, Math.max(4, Math.round(fw))) : w.lengthDefault,
        status: "growing",
      };
    });
  if (strains.length === 0) return { survey, changed: false };

  const base = survey && typeof survey === "object" ? survey : {};
  return { survey: { ...base, strains }, changed: true };
}

// `createdAt` is the day the plant was added to the app, and it is the only
// anchor for its day counter: a plant added at week 6 of flower is still day 0
// today, because the app has no idea what happened before it was told.
export function addPlantToSurvey(survey, fields, idGen = newPlantId, todayIso = todayKey()) {
  const base = survey && typeof survey === "object" ? survey : {};
  const strains = Array.isArray(base.strains) ? base.strains.slice() : [];
  const plant = { ...fields, id: idGen(), status: "growing", createdAt: todayIso };
  strains.push(plant);
  return { survey: { ...base, strains }, plant };
}

// Today as YYYY-MM-DD, in UTC (the Worker's clock).
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function updatePlantInSurvey(survey, plantId, patch) {
  if (!survey || !Array.isArray(survey.strains)) return null;
  let plant = null;
  const strains = survey.strains.map((s) => {
    if (s.id !== plantId) return s;
    plant = { ...s, ...patch };
    return plant;
  });
  if (!plant) return null;
  return { survey: { ...survey, strains }, plant };
}

export function removePlantFromSurvey(survey, plantId) {
  if (!survey || !Array.isArray(survey.strains)) return null;
  const strains = survey.strains.filter((s) => s.id !== plantId);
  if (strains.length === survey.strains.length) return null;
  return { survey: { ...survey, strains } };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const BODY_MAX = 2000;
const DETAIL_MAX = 2000;

// Per-entry history categories, across both crops. "stage" is produced by the
// stage control; "flush" is a mushroom harvest, which a tub has many of.
// Which of these a given space actually offers is a UI question (see
// logKinds in src/components/PlantsTab/constants.js); this is just what the
// column is allowed to hold.
export const LOG_KINDS = new Set([
  "note", "measurement", "watering", "nutrients",
  "training", "trim", "environment", "health", "stage", "flush",
]);

// Validates + normalizes a log entry. partial=true for PATCH. Returns DB-column
// shaped value: { date, kind, detail, body, height, height_unit, health }.
export function normalizeLogEntry(input, partial = false, todayIso) {
  const out = {};
  const has = (k) => input[k] !== undefined;

  if (has("date") || !partial) {
    const date = String(input.date ?? todayIso ?? "");
    if (!DATE_RE.test(date)) return { ok: false, error: "date must be YYYY-MM-DD" };
    out.date = date;
  }
  if (has("kind") || !partial) {
    const kind = String(input.kind ?? "note");
    if (!LOG_KINDS.has(kind)) return { ok: false, error: "invalid kind" };
    out.kind = kind;
  }
  if (has("detail")) {
    if (input.detail == null || input.detail === "") {
      out.detail = null;
    } else if (typeof input.detail !== "object" || Array.isArray(input.detail)) {
      return { ok: false, error: "detail must be an object" };
    } else {
      const s = JSON.stringify(input.detail);
      if (s.length > DETAIL_MAX) return { ok: false, error: "detail too large" };
      out.detail = s;
    }
  }
  if (has("body") || !partial) {
    out.body = String(input.body ?? "").slice(0, BODY_MAX);
  }
  if (has("height")) {
    if (input.height === null || input.height === "") {
      out.height = null;
    } else {
      const h = Number(input.height);
      if (!Number.isFinite(h) || h < 0 || h > 2000) return { ok: false, error: "height out of range" };
      out.height = h;
    }
  }
  if (has("heightUnit")) {
    if (input.heightUnit == null || input.heightUnit === "") out.height_unit = null;
    else if (!HEIGHT_UNITS.has(input.heightUnit)) return { ok: false, error: "invalid heightUnit" };
    else out.height_unit = input.heightUnit;
  }
  if (has("health")) {
    if (input.health == null || input.health === "") out.health = null;
    else if (!HEALTH_VALUES.has(input.health)) return { ok: false, error: "invalid health" };
    else out.health = input.health;
  }
  return { ok: true, value: out };
}
