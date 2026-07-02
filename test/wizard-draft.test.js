import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeWizardDraft,
  loadWizardDraft,
  saveWizardDraft,
  clearWizardDraft,
} from "../src/lib/wizardDraft.js";

const STEP_COUNT = 7;

// Minimal localStorage stand-in so the load/save/clear round-trip is testable
// in node. The module only touches getItem/setItem/removeItem.
function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
    _map: map,
  };
}

beforeEach(() => {
  globalThis.localStorage = fakeStorage();
});

// ── sanitize (pure) ──────────────────────────────────────────────────────────
test("sanitize: a valid draft passes through with step intact", () => {
  const out = sanitizeWizardDraft(
    { survey: { growName: "Summer" }, step: 5, wantTasks: true },
    STEP_COUNT
  );
  assert.deepEqual(out, { survey: { growName: "Summer" }, step: 5, wantTasks: true });
});

test("sanitize: step is clamped into [0, stepCount-1]", () => {
  assert.equal(sanitizeWizardDraft({ survey: {}, step: 99 }, STEP_COUNT).step, STEP_COUNT - 1);
  assert.equal(sanitizeWizardDraft({ survey: {}, step: -3 }, STEP_COUNT).step, 0);
  assert.equal(sanitizeWizardDraft({ survey: {}, step: "junk" }, STEP_COUNT).step, 0);
});

test("sanitize: wantTasks only survives as a real boolean", () => {
  assert.equal(sanitizeWizardDraft({ survey: {}, wantTasks: false }, STEP_COUNT).wantTasks, false);
  assert.equal(sanitizeWizardDraft({ survey: {}, wantTasks: "yes" }, STEP_COUNT).wantTasks, null);
  assert.equal(sanitizeWizardDraft({ survey: {} }, STEP_COUNT).wantTasks, null);
});

test("sanitize: garbage shapes return null instead of crashing the wizard", () => {
  assert.equal(sanitizeWizardDraft(null, STEP_COUNT), null);
  assert.equal(sanitizeWizardDraft("string", STEP_COUNT), null);
  assert.equal(sanitizeWizardDraft([1, 2], STEP_COUNT), null);
  assert.equal(sanitizeWizardDraft({ step: 3 }, STEP_COUNT), null);          // no survey
  assert.equal(sanitizeWizardDraft({ survey: [1] }, STEP_COUNT), null);      // survey not an object
});

// ── storage round-trip ───────────────────────────────────────────────────────
test("save then load restores the draft for the same grow id", () => {
  const draft = { survey: { environment: "indoor", vegWeeks: 4 }, step: 6, wantTasks: false };
  saveWizardDraft("g1", draft);
  assert.deepEqual(loadWizardDraft("g1", STEP_COUNT), draft);
  // A different grow id has no draft.
  assert.equal(loadWizardDraft("g2", STEP_COUNT), null);
});

test("clear removes the draft, and load of corrupted JSON returns null", () => {
  saveWizardDraft("g1", { survey: {}, step: 2, wantTasks: true });
  clearWizardDraft("g1");
  assert.equal(loadWizardDraft("g1", STEP_COUNT), null);

  globalThis.localStorage.setItem("wizardDraft:g1", "{not json");
  assert.equal(loadWizardDraft("g1", STEP_COUNT), null);
});

test("drafts are keyed per grow id and a missing id falls back to a shared key", () => {
  saveWizardDraft(null, { survey: { growName: "keyless" }, step: 1, wantTasks: null });
  assert.ok(globalThis.localStorage._map.has("wizardDraft:new"));
  assert.equal(loadWizardDraft(null, STEP_COUNT).survey.growName, "keyless");
});

test("storage failures are swallowed (private mode / quota)", () => {
  globalThis.localStorage = {
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  };
  assert.doesNotThrow(() => saveWizardDraft("g1", { survey: {}, step: 0 }));
  assert.doesNotThrow(() => clearWizardDraft("g1"));
  assert.equal(loadWizardDraft("g1", STEP_COUNT), null);
});
