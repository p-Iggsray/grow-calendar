import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ensurePlantIds, validatePlantFields, addPlantToSurvey,
  updatePlantInSurvey, removePlantFromSurvey, backfillStrainsFromPlan,
} from "../worker/plantsRoster.js";

let _seq = 0;
const fakeId = () => `p_fake_${_seq++}`;

test("backfillStrainsFromPlan seeds roster from plan strains when survey empty", () => {
  _seq = 0;
  const plan = { strains: [
    { name: "Grandaddy Purp", type: "indica", photo: true },
    { name: "Strawberry Haze", type: "sativa", flowerWeeks: 11 },
  ] };
  const { survey, changed } = backfillStrainsFromPlan(null, plan, fakeId);
  assert.equal(changed, true);
  assert.equal(survey.strains.length, 2);
  assert.deepEqual(survey.strains[0], { id: "p_fake_0", name: "Grandaddy Purp", type: "indica", photo: true, flowerWeeks: 9, status: "growing" });
  assert.equal(survey.strains[1].type, "sativa");
  assert.equal(survey.strains[1].flowerWeeks, 11);
});

test("backfillStrainsFromPlan is a no-op when survey already has strains", () => {
  const survey = { strains: [{ name: "Existing", id: "p_1" }] };
  const { survey: out, changed } = backfillStrainsFromPlan(survey, { strains: [{ name: "Plan" }] }, fakeId);
  assert.equal(changed, false);
  assert.equal(out, survey);
});

test("backfillStrainsFromPlan is a no-op when plan has no usable strains", () => {
  assert.equal(backfillStrainsFromPlan(null, null, fakeId).changed, false);
  assert.equal(backfillStrainsFromPlan(null, { strains: [] }, fakeId).changed, false);
  assert.equal(backfillStrainsFromPlan(null, { strains: [{ name: "  " }] }, fakeId).changed, false);
});

test("backfillStrainsFromPlan preserves other survey keys and clamps flowerWeeks", () => {
  _seq = 0;
  const { survey } = backfillStrainsFromPlan({ location: "Ohio" }, { strains: [{ name: "X", flowerWeeks: 99 }] }, fakeId);
  assert.equal(survey.location, "Ohio");
  assert.equal(survey.strains[0].flowerWeeks, 20);
  assert.equal(survey.strains[0].type, "hybrid");
});

test("ensurePlantIds assigns ids and default status, preserves existing ids", () => {
  const survey = { strains: [{ name: "A", id: "p_keep" }, { name: "B" }] };
  const { survey: out, changed } = ensurePlantIds(survey);
  assert.equal(changed, true);
  assert.equal(out.strains[0].id, "p_keep");
  assert.ok(out.strains[1].id);
  assert.equal(out.strains[0].status, "growing");
  assert.equal(out.strains[1].status, "growing");
  // input not mutated
  assert.equal(survey.strains[1].id, undefined);
});

test("ensurePlantIds is a no-op when everything is present", () => {
  const survey = { strains: [{ name: "A", id: "p_1", status: "harvested", stage: "curing" }] };
  const { changed } = ensurePlantIds(survey);
  assert.equal(changed, false);
});

test("ensurePlantIds backfills a default stage when missing", () => {
  const survey = { strains: [{ name: "A", id: "p_1", status: "growing" }] };
  const { survey: out, changed } = ensurePlantIds(survey);
  assert.equal(changed, true);
  assert.equal(out.strains[0].stage, "seedling");
});

test("validatePlantFields rejects bad input and normalizes good input", () => {
  assert.equal(validatePlantFields({ name: "" }).ok, false);
  assert.equal(validatePlantFields({ name: "X", type: "bogus" }).ok, false);
  assert.equal(validatePlantFields({ name: "X", flowerWeeks: 99 }).ok, false);
  const ok = validatePlantFields({ name: "  Blue Dream  ", type: "sativa", photo: false, flowerWeeks: 10 });
  assert.deepEqual(ok.value, { name: "Blue Dream", type: "sativa", photo: false, flowerWeeks: 10, stage: "seedling" });
  // potSize + stage validate and normalize too
  assert.equal(validatePlantFields({ name: "X", potSize: 999 }).ok, false);
  assert.equal(validatePlantFields({ stage: "bogus" }, true).ok, false);
  assert.deepEqual(validatePlantFields({ potSize: 7, stage: "flowering" }, true).value, { potSize: 7, stage: "flowering" });
});

test("validatePlantFields partial allows a subset including status", () => {
  const r = validatePlantFields({ status: "dead" }, true);
  assert.deepEqual(r.value, { status: "dead" });
  assert.equal(validatePlantFields({ status: "nope" }, true).ok, false);
});

test("addPlantToSurvey appends with id and status, deterministic via idGen", () => {
  const { survey, plant } = addPlantToSurvey({ strains: [] }, { name: "A", type: "hybrid", photo: true, flowerWeeks: 9 }, () => "p_test");
  assert.equal(plant.id, "p_test");
  assert.equal(plant.status, "growing");
  assert.equal(survey.strains.length, 1);
});

test("addPlantToSurvey handles a missing strains array", () => {
  const { survey } = addPlantToSurvey({}, { name: "A" }, () => "p_x");
  assert.equal(survey.strains.length, 1);
});

test("updatePlantInSurvey patches the matching plant or returns null", () => {
  const base = { strains: [{ id: "p_1", name: "A", status: "growing" }] };
  const res = updatePlantInSurvey(base, "p_1", { status: "harvested" });
  assert.equal(res.plant.status, "harvested");
  assert.equal(updatePlantInSurvey(base, "p_missing", { status: "dead" }), null);
});

test("removePlantFromSurvey drops the plant or returns null", () => {
  const base = { strains: [{ id: "p_1" }, { id: "p_2" }] };
  const res = removePlantFromSurvey(base, "p_1");
  assert.equal(res.survey.strains.length, 1);
  assert.equal(removePlantFromSurvey(base, "p_missing"), null);
});

import { normalizeLogEntry } from "../worker/plantsRoster.js";

test("normalizeLogEntry requires a valid date when not partial", () => {
  assert.equal(normalizeLogEntry({ body: "x", date: "nope" }).ok, false);
  const ok = normalizeLogEntry({ body: "fed", date: "2026-06-17" });
  assert.equal(ok.value.date, "2026-06-17");
  assert.equal(ok.value.body, "fed");
});

test("normalizeLogEntry defaults date to todayIso", () => {
  const ok = normalizeLogEntry({ body: "x" }, false, "2026-06-17");
  assert.equal(ok.value.date, "2026-06-17");
});

test("normalizeLogEntry validates height and health, allows clearing", () => {
  assert.equal(normalizeLogEntry({ body: "x", date: "2026-06-17", height: -1 }).ok, false);
  assert.equal(normalizeLogEntry({ body: "x", date: "2026-06-17", health: "bogus" }).ok, false);
  const ok = normalizeLogEntry({ body: "x", date: "2026-06-17", height: 24, heightUnit: "in", health: "healthy" });
  assert.deepEqual(ok.value, { date: "2026-06-17", kind: "note", body: "x", height: 24, height_unit: "in", health: "healthy" });
  const cleared = normalizeLogEntry({ height: "", health: "" }, true);
  assert.deepEqual(cleared.value, { height: null, health: null });
});

test("normalizeLogEntry handles kind + detail", () => {
  assert.equal(normalizeLogEntry({ kind: "bogus" }, false, "2026-06-17").ok, false);
  const ok = normalizeLogEntry({ kind: "watering", detail: { gal: 2 }, date: "2026-06-17" });
  assert.equal(ok.value.kind, "watering");
  assert.equal(ok.value.detail, JSON.stringify({ gal: 2 }));
  // detail must be an object, and defaults to kind "note" when omitted
  assert.equal(normalizeLogEntry({ detail: "nope", date: "2026-06-17" }).ok, false);
  assert.equal(normalizeLogEntry({ date: "2026-06-17" }).value.kind, "note");
});

test("normalizeLogEntry partial rejects an empty object only when not partial", () => {
  assert.equal(normalizeLogEntry({}, true).ok, true);
  assert.equal(normalizeLogEntry({ date: "2026-06-17" }, false).value.body, "");
});

test("addPlantToSurvey forces status growing even if fields supply one", () => {
  const { plant } = addPlantToSurvey({ strains: [] }, { name: "A", status: "dead" }, () => "p_z");
  assert.equal(plant.status, "growing");
});
