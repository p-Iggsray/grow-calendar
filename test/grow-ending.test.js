import { test } from "node:test";
import assert from "node:assert/strict";
import {
  END_OUTCOMES, PLANT_FATES, endReasons, isEndReason, reasonLabel,
  defaultFate, endingList, latestEnding, isRunEnded, fateCounts, endingHeadline,
} from "../src/lib/growEnding.js";
import { validateEnding } from "../worker/growEnding.js";

const ROSTER = new Set(["p1", "p2", "p3"]);

test("the two outcomes are the plan working and the plan being taken away", () => {
  assert.deepEqual(END_OUTCOMES.map((o) => o.value), ["finished", "lost"]);
  assert.deepEqual(PLANT_FATES.map((f) => f.value), ["harvested", "dead"]);
});

test("each crop is offered its own failure, and neither is offered the other's", () => {
  const cannabis = endReasons("cannabis").map((r) => r.value);
  const mushrooms = endReasons("mushrooms").map((r) => r.value);

  assert.ok(cannabis.includes("hermie"));
  assert.ok(!cannabis.includes("contamination"));
  assert.ok(mushrooms.includes("contamination"));
  assert.ok(!mushrooms.includes("hermie"));

  // Theft is not a crop-specific problem.
  for (const list of [cannabis, mushrooms]) {
    assert.ok(list.includes("theft"));
    assert.ok(list.includes("other"));
  }
  assert.equal(reasonLabel("theft", "cannabis"), "Stolen");
  assert.equal(isEndReason("contamination", "cannabis"), false);
});

test("fates start from the outcome", () => {
  assert.equal(defaultFate("finished"), "harvested");
  assert.equal(defaultFate("lost"), "dead");
});

// ── When a space reads as ended ─────────────────────────────────────────────

test("an ending plus nothing growing is an ended run", () => {
  const endings = [{ endedOn: "2026-09-10", outcome: "lost" }];
  assert.equal(isRunEnded(endings, [{ status: "dead" }, { status: "dead" }]), true);
});

test("a space that was replanted is running again, and keeps its history", () => {
  const endings = [{ endedOn: "2026-09-10", outcome: "lost" }];
  // The old ending is still there. It is just no longer the current state.
  assert.equal(isRunEnded(endings, [{ status: "dead" }, { status: "growing" }]), false);
  assert.equal(latestEnding(endings).endedOn, "2026-09-10");
});

test("a space that was never planted is empty, not ended", () => {
  assert.equal(isRunEnded(null, []), false);
  assert.equal(isRunEnded([], [{ status: "growing" }]), false);
});

test("a garbled endings column does not take the screen down with it", () => {
  assert.deepEqual(endingList(null), []);
  assert.deepEqual(endingList("not an array"), []);
  assert.deepEqual(endingList([null, 3, { outcome: "lost" }]), [{ outcome: "lost" }]);
  assert.equal(latestEnding("nonsense"), null);
});

test("the headline says what became of the roster", () => {
  const allLost = { plants: [{ status: "dead" }, { status: "dead" }, { status: "dead" }] };
  assert.equal(endingHeadline(allLost, "cannabis"), "3 plants lost");
  assert.equal(endingHeadline(allLost, "mushrooms"), "3 tubs lost");

  const mixed = { plants: [{ status: "harvested" }, { status: "harvested" }, { status: "dead" }] };
  assert.equal(endingHeadline(mixed, "cannabis"), "2 of 3 plants harvested, 1 lost");

  const one = { plants: [{ status: "dead" }] };
  assert.equal(endingHeadline(one, "cannabis"), "1 plant lost");

  assert.deepEqual(fateCounts(mixed), { harvested: 2, dead: 1 });
  assert.equal(endingHeadline(null, "cannabis"), "");
});

// ── Validation ──────────────────────────────────────────────────────────────

test("a real ending validates and keeps what each plant was before", () => {
  const v = validateEnding({
    endedOn: "2026-09-10",
    outcome: "lost",
    reason: "theft",
    note: "Gate was open when I got home. All three gone, pots tipped.",
    plants: [
      { id: "p1", name: "Blue Dream", status: "dead", wasStatus: "growing" },
      { id: "p2", name: "OG Kush", status: "dead", wasStatus: "growing" },
    ],
  }, "cannabis", ROSTER);

  assert.equal(v.ok, true);
  assert.equal(v.value.reason, "theft");
  assert.equal(v.value.plants.length, 2);
  // Without this the undo has nothing to put back.
  assert.equal(v.value.plants[0].wasStatus, "growing");
  assert.ok(v.value.recordedAt);
});

test("a run that ended short has to say what ended it", () => {
  const v = validateEnding(
    { endedOn: "2026-09-10", outcome: "lost", plants: [] }, "cannabis", ROSTER);
  assert.equal(v.ok, false);
  assert.match(v.error, /reason/);
});

// "Finished, reason: pests" is a contradiction somebody would later have to
// interpret, so it is refused rather than silently kept.
test("a finished run is not allowed to carry a reason", () => {
  const v = validateEnding(
    { endedOn: "2026-09-10", outcome: "finished", reason: "pests", plants: [] }, "cannabis", ROSTER);
  assert.equal(v.ok, false);
});

test("a reason from the other crop is refused", () => {
  const v = validateEnding(
    { endedOn: "2026-09-10", outcome: "lost", reason: "contamination", plants: [] },
    "cannabis", ROSTER);
  assert.equal(v.ok, false);
});

test("bad dates and outcomes are refused", () => {
  const bad = [
    { endedOn: "10-09-2026", outcome: "finished" },
    { endedOn: "2026-09-10", outcome: "vanished" },
    { endedOn: "2026-09-10" },
    null,
  ];
  for (const input of bad) {
    assert.equal(validateEnding(input, "cannabis", ROSTER).ok, false);
  }
});

// A fate for a plant this space does not have is a stale screen or a bad
// client, and applying it would write a roster entry out of nothing.
test("fates for plants that are not in this space are dropped", () => {
  const v = validateEnding({
    endedOn: "2026-09-10", outcome: "lost", reason: "pests",
    plants: [
      { id: "p1", status: "dead", wasStatus: "growing" },
      { id: "ghost", status: "dead", wasStatus: "growing" },
      { id: "p1", status: "harvested", wasStatus: "growing" },
    ],
  }, "cannabis", ROSTER);

  assert.equal(v.ok, true);
  assert.deepEqual(v.value.plants.map((p) => p.id), ["p1"]);
  assert.equal(v.value.plants[0].status, "dead", "the first fate for a plant wins");
});

test("an invalid fate is an error rather than a silent skip", () => {
  const v = validateEnding({
    endedOn: "2026-09-10", outcome: "lost", reason: "pests",
    plants: [{ id: "p1", status: "composted" }],
  }, "cannabis", ROSTER);
  assert.equal(v.ok, false);
});

test("a long note is cut rather than refused", () => {
  const v = validateEnding({
    endedOn: "2026-09-10", outcome: "lost", reason: "theft",
    note: "x".repeat(5000), plants: [],
  }, "cannabis", ROSTER);
  assert.equal(v.ok, true);
  assert.equal(v.value.note.length, 2000);
});
