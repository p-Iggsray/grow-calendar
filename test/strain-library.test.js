import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildStrainLibrary, cleanStrainName, filterStrains, normalizeFlowerWeeks,
  normalizeRating, sortStrains, strainNameKey, strainSummary,
} from "../src/lib/strainLibrary.js";
import { entryWritePlan, validateStrainEntry } from "../worker/strainLibrary.js";

// A grow as listGrows returns it.
const grow = (id, displayName, firstDate, strains) => ({
  id, displayName, firstDate, createdAt: `${firstDate}T00:00:00.000Z`, survey: { strains },
});
const plant = (name, extra = {}) => ({ id: `p_${name}${extra.tag ?? ""}`, name, status: "growing", ...extra });

// ── strainNameKey: what makes two strains the same strain ────────────────────
test("case and stray whitespace do not make a second strain", () => {
  assert.equal(strainNameKey("Blue Dream"), "blue dream");
  assert.equal(strainNameKey("  blue   DREAM "), "blue dream");
  assert.equal(strainNameKey("Blue Dream"), strainNameKey("blue dream"));
});

test("an empty name has no key, so it can never claim a row", () => {
  for (const bad of ["", "   ", null, undefined]) assert.equal(strainNameKey(bad), "");
});

test("names are bounded, and the display name keeps its casing", () => {
  assert.equal(cleanStrainName("  Wedding   Cake "), "Wedding Cake");
  assert.equal(strainNameKey("x".repeat(200)).length, 60);
  assert.equal(cleanStrainName("x".repeat(200)).length, 60);
});

// ── ratings and flower weeks ─────────────────────────────────────────────────
test("a rating is whole stars between none and five", () => {
  assert.equal(normalizeRating(3), 3);
  assert.equal(normalizeRating(4.4), 4);
  assert.equal(normalizeRating(99), 5);
  assert.equal(normalizeRating(-2), 0);
  assert.equal(normalizeRating("nonsense"), 0);
  assert.equal(normalizeRating(null), 0);
});

test("flower weeks stay in the range a packet could plausibly claim", () => {
  assert.equal(normalizeFlowerWeeks(9), 9);
  assert.equal(normalizeFlowerWeeks("11"), 11);
  assert.equal(normalizeFlowerWeeks(1), 4);
  assert.equal(normalizeFlowerWeeks(60), 20);
  // Blank means the packet did not say, which is not the same as zero.
  assert.equal(normalizeFlowerWeeks(""), null);
  assert.equal(normalizeFlowerWeeks(null), null);
  assert.equal(normalizeFlowerWeeks("soon"), null);
});

// ── buildStrainLibrary: the list nobody stores ───────────────────────────────
test("every strain in every space turns up, deduped by name", () => {
  const list = buildStrainLibrary([
    grow("g1", "Back Tent", "2026-01-05", [plant("Blue Dream"), plant("Gelato", { tag: 2 })]),
    grow("g2", "Veg Tent", "2026-06-01", [plant("blue dream", { tag: 3 })]),
  ], []);
  assert.deepEqual(list.map((s) => s.key).sort(), ["blue dream", "gelato"]);
  const bd = list.find((s) => s.key === "blue dream");
  assert.equal(bd.growCount, 2, "two spaces, so grown twice");
  assert.equal(bd.plantCount, 2);
});

test("several plants of one strain in one space is still one grow of it", () => {
  const list = buildStrainLibrary([
    grow("g1", "Back Tent", "2026-01-05", [plant("Gelato", { tag: 1 }), plant("Gelato", { tag: 2 }), plant("Gelato", { tag: 3 })]),
  ], []);
  assert.equal(list[0].growCount, 1);
  assert.equal(list[0].plantCount, 3);
  assert.equal(list[0].grows[0].plants, 3);
});

test("a strain is growing now only while a plant of it is still alive", () => {
  const [s] = buildStrainLibrary([
    grow("g1", "Back Tent", "2026-01-05", [
      plant("Gelato", { tag: 1, status: "harvested" }),
      plant("Gelato", { tag: 2, status: "dead" }),
    ]),
  ], []);
  assert.equal(s.growingNow, false);
  const [live] = buildStrainLibrary([
    grow("g1", "Back Tent", "2026-01-05", [
      plant("Gelato", { tag: 1, status: "harvested" }),
      plant("Gelato", { tag: 2 }),
    ]),
  ], []);
  assert.equal(live.growingNow, true);
});

test("an opinion outlives the grow that earned it", () => {
  // The space is gone; only the saved row remains.
  const list = buildStrainLibrary([], [{ name: "Northern Lights", rating: 5, note: "the good one", favorite: true }]);
  assert.equal(list.length, 1);
  assert.equal(list[0].rating, 5);
  assert.equal(list[0].note, "the good one");
  assert.equal(list[0].favorite, true);
  assert.equal(list[0].growCount, 0);
  assert.equal(list[0].neverGrown, true);
});

test("a strain you are growing with nothing written about it is still listed", () => {
  const [s] = buildStrainLibrary([grow("g1", "Back Tent", "2026-01-05", [plant("Zkittlez")])], []);
  assert.equal(s.rating, 0);
  assert.equal(s.note, "");
  assert.equal(s.favorite, false);
  assert.equal(s.neverGrown, false);
});

test("the saved row and the grows join on the name, whatever the casing", () => {
  const [s] = buildStrainLibrary(
    [grow("g1", "Back Tent", "2026-01-05", [plant("Blue Dream")])],
    [{ name: "  BLUE   dream ", rating: 4, favorite: true }],
  );
  assert.equal(s.rating, 4);
  assert.equal(s.favorite, true);
  assert.equal(s.growCount, 1, "the row must not split the strain in two");
});

test("what you wrote down beats what a plant happens to say", () => {
  const [s] = buildStrainLibrary(
    [grow("g1", "Back Tent", "2026-01-05", [plant("Gelato", { type: "sativa", flowerWeeks: 8, photo: true })])],
    [{ name: "Gelato", type: "indica", flowerWeeks: 10, photo: false }],
  );
  assert.equal(s.type, "indica");
  assert.equal(s.flowerWeeks, 10);
  assert.equal(s.photo, false);
});

test("a blank in the saved row falls back to what the plants recorded", () => {
  const [s] = buildStrainLibrary(
    [grow("g1", "Back Tent", "2026-01-05", [
      plant("Gelato", { tag: 1, type: "indica", flowerWeeks: 9 }),
      plant("Gelato", { tag: 2, type: "indica", flowerWeeks: 9 }),
      plant("Gelato", { tag: 3, type: "sativa", flowerWeeks: 12 }),
    ])],
    [{ name: "Gelato", rating: 3 }],
  );
  assert.equal(s.type, "indica", "the commonest answer wins");
  assert.equal(s.flowerWeeks, 9);
  assert.equal(s.rating, 3);
});

test("a strain with nothing recorded anywhere still gets a sane type", () => {
  const [s] = buildStrainLibrary([grow("g1", "T", "2026-01-05", [plant("Mystery")])], []);
  assert.equal(s.type, "hybrid");
  assert.equal(s.flowerWeeks, null);
  assert.equal(s.photo, null);
});

test("unnamed plants are skipped rather than becoming a blank strain", () => {
  const list = buildStrainLibrary([
    grow("g1", "T", "2026-01-05", [plant(""), plant("   ", { tag: 2 }), plant("Real", { tag: 3 })]),
  ], []);
  assert.deepEqual(list.map((s) => s.name), ["Real"]);
});

test("a plant with no date of its own is dated by its space", () => {
  const [s] = buildStrainLibrary([grow("g1", "T", "2026-03-09", [plant("Gelato")])], []);
  assert.equal(s.firstGrown, "2026-03-09");
  assert.equal(s.grows[0].date, "2026-03-09");
  const [dated] = buildStrainLibrary(
    [grow("g1", "T", "2026-03-09", [plant("Gelato", { createdAt: "2026-05-20" })])], [],
  );
  assert.equal(dated.firstGrown, "2026-05-20");
});

test("missing and malformed input produces an empty library, not a crash", () => {
  assert.deepEqual(buildStrainLibrary(null, null), []);
  assert.deepEqual(buildStrainLibrary([], []), []);
  assert.deepEqual(buildStrainLibrary([{ id: "g1" }], []), []);           // no survey
  assert.deepEqual(buildStrainLibrary([{ id: "g1", survey: {} }], []), []); // no strains
  assert.deepEqual(buildStrainLibrary([], [{ rating: 3 }]), []);           // a row with no name
});

// ── sorting and filtering ────────────────────────────────────────────────────
test("what is in the ground right now sorts to the top", () => {
  const list = sortStrains([
    { name: "Apple", growingNow: false }, { name: "Zkittlez", growingNow: true },
    { name: "Banana", growingNow: false },
  ]);
  assert.deepEqual(list.map((s) => s.name), ["Zkittlez", "Apple", "Banana"]);
});

test("sorting never mutates the list it was handed", () => {
  const input = [{ name: "B", growingNow: false }, { name: "A", growingNow: false }];
  sortStrains(input);
  assert.deepEqual(input.map((s) => s.name), ["B", "A"]);
});

const SAMPLE = [
  { name: "Blue Dream", note: "made me sleepy", rating: 4, favorite: true, growingNow: false },
  { name: "Gelato", note: "", rating: 0, favorite: false, growingNow: true },
  { name: "Zkittlez", note: "sweet", rating: 2, favorite: false, growingNow: false },
];

test("each filter keeps exactly what it says on the chip", () => {
  assert.equal(filterStrains(SAMPLE, { filter: "all" }).length, 3);
  assert.deepEqual(filterStrains(SAMPLE, { filter: "growing" }).map((s) => s.name), ["Gelato"]);
  assert.deepEqual(filterStrains(SAMPLE, { filter: "favorites" }).map((s) => s.name), ["Blue Dream"]);
  assert.deepEqual(filterStrains(SAMPLE, { filter: "rated" }).map((s) => s.name), ["Blue Dream", "Zkittlez"]);
});

test("search reaches into notes, so you can find one by what it did to you", () => {
  assert.deepEqual(filterStrains(SAMPLE, { query: "sleepy" }).map((s) => s.name), ["Blue Dream"]);
  assert.deepEqual(filterStrains(SAMPLE, { query: "zkit" }).map((s) => s.name), ["Zkittlez"]);
  assert.deepEqual(filterStrains(SAMPLE, { query: "  BLUE " }).map((s) => s.name), ["Blue Dream"]);
  assert.equal(filterStrains(SAMPLE, { query: "nothing at all" }).length, 0);
});

test("a filter and a search apply together", () => {
  assert.equal(filterStrains(SAMPLE, { query: "sweet", filter: "favorites" }).length, 0);
  assert.equal(filterStrains(SAMPLE, { query: "sweet", filter: "rated" }).length, 1);
});

test("filtering copes with no arguments and no list", () => {
  assert.deepEqual(filterStrains(null), []);
  assert.equal(filterStrains(SAMPLE).length, 3);
});

// ── the one line under the name ──────────────────────────────────────────────
test("the summary states what is known and stays quiet about the rest", () => {
  assert.equal(
    strainSummary({ type: "indica", photo: false, flowerWeeks: 9, growCount: 2 }),
    "Indica · Auto · 9wk flower · grown 2 times",
  );
  assert.equal(strainSummary({ type: "hybrid", photo: true, flowerWeeks: null, growCount: 1 }), "Hybrid · grown once");
  assert.equal(strainSummary({ type: null, photo: null, growCount: 0, neverGrown: true }), "not grown yet");
});

// ── the worker's validator ───────────────────────────────────────────────────
test("a save needs a real name and nothing else", () => {
  assert.equal(validateStrainEntry({ name: "Gelato" }).ok, true);
  assert.equal(validateStrainEntry({ name: "   " }).ok, false);
  assert.equal(validateStrainEntry({}).ok, false);
  assert.equal(validateStrainEntry(null).ok, false);
  assert.equal(validateStrainEntry("Gelato").ok, false);
});

test("the validator normalizes rather than trusting what it is sent", () => {
  const v = validateStrainEntry({ name: "  Blue  Dream ", rating: 9.7, flowerWeeks: "70" });
  assert.equal(v.ok, true);
  assert.equal(v.value.name, "Blue Dream");
  assert.equal(v.value.nameKey, "blue dream");
  assert.equal(v.value.rating, 5);
  assert.equal(v.value.flowerWeeks, 20);
});

test("junk in a field is refused instead of being silently coerced", () => {
  assert.equal(validateStrainEntry({ name: "G", favorite: "yes" }).ok, false);
  assert.equal(validateStrainEntry({ name: "G", type: "ruderalis" }).ok, false);
  assert.equal(validateStrainEntry({ name: "G", photo: 1 }).ok, false);
  assert.equal(validateStrainEntry({ name: "G", note: 42 }).ok, false);
  assert.equal(validateStrainEntry({ name: "G", flowerWeeks: "ten" }).ok, false);
  assert.equal(validateStrainEntry({ name: "G", rating: "lots" }).ok, false);
});

test("an emptied field is allowed, because a packet can go quiet", () => {
  const v = validateStrainEntry({ name: "G", type: null, photo: null, flowerWeeks: "", note: null });
  assert.equal(v.ok, true);
  assert.equal(v.value.type, null);
  assert.equal(v.value.photo, null);
  assert.equal(v.value.flowerWeeks, null);
  assert.equal(v.value.note, "");
});

test("a long note is trimmed to fit rather than rejected", () => {
  const v = validateStrainEntry({ name: "G", note: "x".repeat(99_999) });
  assert.equal(v.ok, true);
  assert.equal(v.value.note.length, 4000);
});

// ── the write plan: a one-tap favourite must never cost you a note ───────────
// The row is merged inside the SQL statement, so what this function decides is
// which columns the statement is allowed to touch. A column nobody mentioned
// keeps its own value, which is what stops a star and a note saved a moment
// apart from erasing one another.

test("a save only claims the columns it actually mentions", () => {
  const { provided } = entryWritePlan({ name: "Gelato", favorite: true });
  assert.deepEqual(provided, {
    note: false, rating: false, favorite: true, type: false, photo: false, flowerWeeks: false,
  });
});

test("clearing a field counts as mentioning it, so a clear really clears", () => {
  const { provided, values } = entryWritePlan({
    name: "Gelato", rating: 0, note: "", type: null, photo: null, flowerWeeks: null,
  });
  assert.deepEqual(provided, {
    note: true, rating: true, favorite: false, type: true, photo: true, flowerWeeks: true,
  });
  assert.equal(values.rating, 0);
  assert.equal(values.note, "");
  assert.equal(values.type, null);
  assert.equal(values.photo, null);
  assert.equal(values.flowerWeeks, null);
});

test("a brand new strain gets storable defaults, never a null in a NOT NULL column", () => {
  const { values } = entryWritePlan({ name: "Runtz" });
  assert.equal(values.note, "");
  assert.equal(values.rating, 0);
  assert.equal(values.favorite, 0);
  assert.equal(values.type, null);
  assert.equal(values.photo, null);
  assert.equal(values.flowerWeeks, null);
});

test("booleans reach the database as the integers the column expects", () => {
  assert.equal(entryWritePlan({ name: "R", favorite: false }).values.favorite, 0);
  assert.equal(entryWritePlan({ name: "R", favorite: true }).values.favorite, 1);
  assert.equal(entryWritePlan({ name: "R", photo: false }).values.photo, 0);
  assert.equal(entryWritePlan({ name: "R", photo: true }).values.photo, 1);
});

test("a validated save flows into a write plan that claims exactly those fields", () => {
  const v = validateStrainEntry({ name: "Gelato", rating: 5 });
  const { provided, values } = entryWritePlan(v.value);
  assert.equal(provided.rating, true);
  assert.equal(provided.note, false, "a rating tap must not claim the note column");
  assert.equal(values.rating, 5);
});
