import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getLifecyclePhase, normalizeLifecycle, phaseMeta,
  dryProgress, dryReadiness, cureProgress, cureReadiness, burpCadence,
  DRY_MIN, DRY_MAX, CURE_MIN, CURE_GOOD,
} from "../src/lib/lifecycle.js";
import { validateLifecycle } from "../worker/grows.js";

const today = new Date(2026, 9, 30); // Oct 30 2026, local

test("getLifecyclePhase defaults to growing and validates the enum", () => {
  assert.equal(getLifecyclePhase(null), "growing");
  assert.equal(getLifecyclePhase({ phase: "bogus" }), "growing");
  assert.equal(getLifecyclePhase({ phase: "curing" }), "curing");
});

test("normalizeLifecycle fills defaults and coerces bad shapes", () => {
  const lc = normalizeLifecycle({ phase: "drying", dryLogs: "nope", dryChecklist: 5 });
  assert.equal(lc.phase, "drying");
  assert.deepEqual(lc.dryLogs, []);
  assert.deepEqual(lc.dryChecklist, {});
  assert.equal(lc.cureLogs.length, 0);
});

test("phaseMeta gives the right tab label per phase", () => {
  assert.equal(phaseMeta("growing").tabLabel, "CALENDAR");
  assert.equal(phaseMeta("drying").tabLabel, "DRYING");
  assert.equal(phaseMeta("curing").tabLabel, "CURING");
  assert.equal(phaseMeta("done").tabLabel, "DONE");
});

test("dryProgress: the start day is Day 1", () => {
  const lc = { dryStartedAt: "2026-10-30" };
  assert.equal(dryProgress(lc, today).dayNum, 1);
  const lc8 = { dryStartedAt: "2026-10-22" };
  assert.equal(dryProgress(lc8, today).dayNum, 9); // 8 days elapsed + 1
});

test("dryReadiness moves early -> window -> ready", () => {
  const start = (d) => ({ dryStartedAt: d, dryChecklist: {} });
  assert.equal(dryReadiness(start("2026-10-28"), today).status, "early");   // 2 days
  assert.equal(dryReadiness(start("2026-10-21"), today).status, "window");  // 9 days, no stem snap
  const withSnap = { dryStartedAt: "2026-10-21", dryChecklist: { stemSnap: true } };
  assert.equal(dryReadiness(withSnap, today).status, "ready");              // snap + past min
});

test("dryReadiness flips ready once past the max window even without checklist", () => {
  const past = { dryStartedAt: "2026-10-10", dryChecklist: {} }; // 20 days
  const r = dryReadiness(past, today);
  assert.equal(r.status, "ready");
  assert.match(r.reason, /jars/i);
});

test("cureReadiness thresholds and burp cadence", () => {
  assert.equal(cureReadiness({ cureStartedAt: "2026-10-28" }, today).status, "early");  // 2 days
  assert.equal(cureReadiness({ cureStartedAt: "2026-10-10" }, today).status, "window"); // 20 days
  assert.equal(cureReadiness({ cureStartedAt: "2026-09-20" }, today).status, "ready");  // 40 days
  assert.match(burpCadence(2), /daily/i);
  assert.match(burpCadence(20), /2.3 days/i);
  assert.match(burpCadence(40), /week/i);
});

test("cureProgress day math + sane constants", () => {
  assert.equal(cureProgress({ cureStartedAt: "2026-10-30" }, today).dayNum, 1);
  assert.ok(DRY_MIN < DRY_MAX);
  assert.ok(CURE_MIN < CURE_GOOD);
});

// ── worker validator ─────────────────────────────────────────────────────────
test("validateLifecycle rejects a missing/invalid phase", () => {
  assert.equal(validateLifecycle(null).ok, false);
  assert.equal(validateLifecycle({ phase: "nope" }).ok, false);
});

test("validateLifecycle clamps logs, dates, and numbers", () => {
  const res = validateLifecycle({
    phase: "drying",
    dryStartedAt: "2026-10-30",
    cureStartedAt: "not-a-date",
    dryLogs: [
      { date: "2026-10-30", tempF: 999, rh: -5, note: "x".repeat(9999) },
      { date: "bad", tempF: 60, rh: 60 },               // dropped (no valid date)
    ],
    dryChecklist: { stemSnap: "yes", junk: true },
    finalWeightG: -10,
  });
  assert.ok(res.ok);
  assert.equal(res.value.cureStartedAt, null);
  assert.equal(res.value.dryLogs.length, 1);
  assert.equal(res.value.dryLogs[0].tempF, 200);  // clamped to max
  assert.equal(res.value.dryLogs[0].rh, 0);        // clamped to min
  assert.ok(res.value.dryLogs[0].note.length <= 500);
  assert.equal(res.value.dryChecklist.stemSnap, false); // "yes" is not strict true
  assert.equal(res.value.finalWeightG, 0);
});

test("validateLifecycle only treats strict true as a checked box", () => {
  const res = validateLifecycle({ phase: "drying", dryChecklist: { a: "yes", b: true, c: 1 } });
  assert.equal(res.value.dryChecklist.a, false);
  assert.equal(res.value.dryChecklist.b, true);
  assert.equal(res.value.dryChecklist.c, false);
});
