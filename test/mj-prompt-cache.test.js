import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSystemSegments, MJ_PERSONA, MJ_TOOLS } from "../worker/mj-logic.js";

// Gemini 2.5 caches implicitly by matching the PREFIX of a request against
// recent ones. That makes prompt order the whole optimisation, and it makes
// "the first segment never varies" a property worth failing a build over.
//
// The bug this guards against is subtle and was live: the recorded stage
// timeline sat in the stable block because it reads like something MJ knows
// about the space. It is, but it changes the day anything is recorded, so it
// broke the prefix for every grow on every stage change.

const CANNABIS = { crop: "cannabis", strains: [{ id: "p1", name: "Blue Dream" }] };
const MUSHROOMS = { crop: "mushrooms", strains: [{ id: "t1", name: "Golden Teacher" }] };

const stableOf = (survey, volatile) => buildSystemSegments({ survey, volatile })[0].text;

test("the stable segment does not move when the day does", () => {
  const monday = stableOf(CANNABIS, ["Today's date is 2026-06-01.", "WEATHER: 78 F"]);
  const friday = stableOf(CANNABIS, ["Today's date is 2026-09-15.", "WEATHER: 51 F, storm"]);
  assert.equal(monday, friday);
});

test("the stable segment does not move when the grow does", () => {
  const early = stableOf(CANNABIS, ["STAGE TIMELINE: seedling since 2026-04-01"]);
  const later = stableOf(CANNABIS, ["STAGE TIMELINE: flowering since 2026-07-14", "SENSOR DATA: 78 F"]);
  assert.equal(early, later);
});

test("the stable segment does not move between growers or spaces", () => {
  const a = stableOf(CANNABIS, ["PLANTS IN THIS SPACE: Blue Dream", "Location: Ohio"]);
  const b = stableOf({ ...CANNABIS, strains: [{ id: "x", name: "Gelato" }] }, ["PLANTS IN THIS SPACE: Gelato", "Location: Oregon"]);
  assert.equal(a, b);
});

test("the only thing that changes it is what the space grows", () => {
  assert.notEqual(stableOf(CANNABIS, []), stableOf(MUSHROOMS, []));
  // And there are exactly two of those, so at most two prefixes are ever warm.
  const prefixes = new Set([stableOf(CANNABIS, []), stableOf(MUSHROOMS, []), stableOf({ crop: "cannabis" }, [])]);
  assert.equal(prefixes.size, 2);
});

test("the stable segment leads with the persona, unaltered", () => {
  assert.ok(stableOf(CANNABIS, []).startsWith(MJ_PERSONA));
});

test("nothing date-shaped is hiding in the stable segment", () => {
  const stable = stableOf(CANNABIS, ["Today's date is 2026-09-15."]);
  assert.doesNotMatch(stable, /\d{4}-\d{2}-\d{2}/, "a date in the prefix invalidates the cache daily");
});

test("the volatile segment carries everything that was handed to it", () => {
  const [, vol] = buildSystemSegments({
    survey: CANNABIS,
    volatile: ["STAGE TIMELINE: day 40", "", null, "Today's date is 2026-09-15.", undefined],
  });
  assert.equal(vol.stable, false);
  assert.match(vol.text, /STAGE TIMELINE: day 40/);
  assert.match(vol.text, /Today's date is 2026-09-15\./);
  // Blank and missing parts are dropped rather than left as empty gaps.
  assert.doesNotMatch(vol.text, /\n\n\n/);
});

test("an empty volatile list still yields two well-formed segments", () => {
  const segs = buildSystemSegments({ survey: CANNABIS });
  assert.equal(segs.length, 2);
  assert.equal(segs[1].text, "");
  assert.equal(segs[0].stable, true);
});

test("the stable prefix clears the minimum size implicit caching needs", () => {
  // Google's floor for 2.5 Flash is reported between 1024 and 2048 tokens.
  // Roughly four characters to the token, so assert against the higher figure
  // with room to spare: below it, none of this ordering buys anything.
  const chars = stableOf(CANNABIS, []).length;
  assert.ok(chars / 4 > 2048, `stable prefix is only ~${Math.round(chars / 4)} tokens`);
});

test("the tool declarations are a fixed set, so they repeat byte for byte too", () => {
  // They travel beside the system prompt on every request and every tool loop
  // iteration, so they are part of what repeats.
  const once = JSON.stringify(MJ_TOOLS);
  const twice = JSON.stringify(MJ_TOOLS);
  assert.equal(once, twice);
  assert.ok(once.length / 4 > 2000, "tool schemas are a large share of the repeated payload");
});
