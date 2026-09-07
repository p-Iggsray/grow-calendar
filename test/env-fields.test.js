import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeEnvFields } from "../worker/grows.js";

test("only supplied keys come back", () => {
  assert.deepEqual(sanitizeEnvFields({}), {});
  assert.deepEqual(sanitizeEnvFields({ envSize: "4x4 tent" }), { envSize: "4x4 tent" });
});

test("kind of space is restricted to the three known values", () => {
  assert.equal(sanitizeEnvFields({ environment: "indoor" }).environment, "indoor");
  assert.equal(sanitizeEnvFields({ environment: "greenhouse" }).environment, "greenhouse");
  assert.equal(sanitizeEnvFields({ environment: "spaceship" }).environment, undefined);
  assert.equal(sanitizeEnvFields({ environment: 7 }).environment, undefined);
});

test("text fields are trimmed and length-capped", () => {
  assert.equal(sanitizeEnvFields({ lightSchedule: "  18/6  " }).lightSchedule, "18/6");
  assert.equal(sanitizeEnvFields({ envSize: "x".repeat(120) }).envSize.length, 40);
  assert.equal(sanitizeEnvFields({ lightType: 42 }).lightType, undefined);
});

test("numbers are clamped to sane ranges; null clears them", () => {
  assert.equal(sanitizeEnvFields({ envCapacity: 12 }).envCapacity, 12);
  assert.equal(sanitizeEnvFields({ envCapacity: 9999 }).envCapacity, 500);
  assert.equal(sanitizeEnvFields({ envCapacity: -5 }).envCapacity, 0);
  assert.equal(sanitizeEnvFields({ lightWatts: "240" }).lightWatts, 240);
  assert.equal(sanitizeEnvFields({ lightWatts: null }).lightWatts, null);
  assert.equal(sanitizeEnvFields({ containerGallons: "" }).containerGallons, null);
  assert.equal(sanitizeEnvFields({ lightWatts: "junk" }).lightWatts, undefined);
});

test("unknown keys are dropped and garbage input is safe", () => {
  assert.deepEqual(sanitizeEnvFields({ hackerField: "x", strains: [] }), {});
  assert.deepEqual(sanitizeEnvFields(null), {});
  assert.deepEqual(sanitizeEnvFields("nope"), {});
});

// ── What the space grows ─────────────────────────────────────────────────────
test("the crop is an environment field, and only a real crop", () => {
  assert.deepEqual(sanitizeEnvFields({ crop: "mushrooms" }), { crop: "mushrooms" });
  assert.deepEqual(sanitizeEnvFields({ crop: "cannabis" }), { crop: "cannabis" });
  // Junk is dropped rather than written into the survey, same as every other
  // field here. Whether a change is ALLOWED is the caller's question: a space
  // that already holds plants keeps the crop it has.
  assert.deepEqual(sanitizeEnvFields({ crop: "tomatoes" }), {});
  assert.deepEqual(sanitizeEnvFields({ crop: 7 }), {});
});

test("a monotub's substrate and container survive the whitelist", () => {
  assert.deepEqual(
    sanitizeEnvFields({ crop: "mushrooms", medium: "cvg", containerType: "monotub", wateringMethod: "mist", containerGallons: 6 }),
    { crop: "mushrooms", medium: "cvg", containerType: "monotub", wateringMethod: "mist", containerGallons: 6 },
  );
});
