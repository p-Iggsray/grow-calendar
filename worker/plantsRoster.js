// @ts-check
// Pure helpers for the per-plant roster (stored in a grow's survey.strains[])
// and for validating log-entry input. No DB access, so these are unit-testable
// in isolation with node --test.

export const PLANT_TYPES = new Set(["indica", "sativa", "hybrid"]);
export const PLANT_STATUSES = new Set(["growing", "harvested", "dead"]);
export const HEALTH_VALUES = new Set(["thriving", "healthy", "stressed", "sick"]);
export const HEIGHT_UNITS = new Set(["in", "cm"]);
// Ordered per-plant lifecycle stages (manual; the grower advances them).
export const PLANT_STAGES = [
  "seedling", "vegetative", "flowering", "flushing",
  "harvest", "drying", "curing", "done",
];
export const STAGE_SET = new Set(PLANT_STAGES);
export const DEFAULT_STAGE = "seedling";

const NAME_MAX = 60;

export function newPlantId() {
  return "p_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// Assigns a stable id + default status to any strain entry missing them.
// Returns { survey, changed }. Never mutates the input.
export function ensurePlantIds(survey) {
  if (!survey || !Array.isArray(survey.strains)) return { survey, changed: false };
  let changed = false;
  const strains = survey.strains.map((s) => {
    const next = { ...s };
    if (!next.id) { next.id = newPlantId(); changed = true; }
    if (!PLANT_STATUSES.has(next.status)) { next.status = "growing"; changed = true; }
    if (!STAGE_SET.has(next.stage)) { next.stage = DEFAULT_STAGE; changed = true; }
    return next;
  });
  return changed ? { survey: { ...survey, strains }, changed: true } : { survey, changed: false };
}

// Validates + normalizes plant roster fields. partial=true allows a subset (PATCH).
export function validatePlantFields(fields, partial = false) {
  const out = {};
  const has = (k) => fields[k] !== undefined;

  if (has("name") || !partial) {
    const name = String(fields.name ?? "").trim();
    if (!name) return { ok: false, error: "name required" };
    out.name = name.slice(0, NAME_MAX);
  }
  if (has("type") || !partial) {
    const type = String(fields.type ?? "hybrid");
    if (!PLANT_TYPES.has(type)) return { ok: false, error: "invalid type" };
    out.type = type;
  }
  if (has("photo") || !partial) {
    out.photo = Boolean(fields.photo ?? true);
  }
  if (has("flowerWeeks") || !partial) {
    const fw = Number(fields.flowerWeeks ?? 9);
    if (!Number.isFinite(fw) || fw < 4 || fw > 20) return { ok: false, error: "flowerWeeks out of range" };
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
    const stage = String(fields.stage ?? DEFAULT_STAGE);
    if (!STAGE_SET.has(stage)) return { ok: false, error: "invalid stage" };
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

  const planStrains = Array.isArray(generatedPlan?.strains) ? generatedPlan.strains : [];
  const strains = planStrains
    .filter((s) => s && String(s.name ?? "").trim())
    .map((s) => {
      const fw = Number(s.flowerWeeks);
      return {
        id: idGen(),
        name: String(s.name).trim().slice(0, NAME_MAX),
        type: PLANT_TYPES.has(s.type) ? s.type : "hybrid",
        photo: s.photo !== undefined ? Boolean(s.photo) : true,
        flowerWeeks: Number.isFinite(fw) ? Math.min(20, Math.max(4, Math.round(fw))) : 9,
        status: "growing",
      };
    });
  if (strains.length === 0) return { survey, changed: false };

  const base = survey && typeof survey === "object" ? survey : {};
  return { survey: { ...base, strains }, changed: true };
}

export function addPlantToSurvey(survey, fields, idGen = newPlantId) {
  const base = survey && typeof survey === "object" ? survey : {};
  const strains = Array.isArray(base.strains) ? base.strains.slice() : [];
  const plant = { ...fields, id: idGen(), status: "growing" };
  strains.push(plant);
  return { survey: { ...base, strains }, plant };
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

// Per-plant history entry categories. "stage" is produced by the stage control.
export const LOG_KINDS = new Set([
  "note", "measurement", "watering", "nutrients",
  "training", "trim", "environment", "health", "stage",
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
