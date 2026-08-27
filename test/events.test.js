import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEventInput } from "../worker/events.js";

// ── create (full) validation ─────────────────────────────────────────────────
test("create: date + title required, time and notes optional", () => {
  const v = validateEventInput({ date: "2026-07-04", title: "Feed day" });
  assert.equal(v.ok, true);
  assert.deepEqual(v.fields, { date: "2026-07-04", title: "Feed day" });
});

test("create: title is trimmed and length-capped", () => {
  assert.equal(validateEventInput({ date: "2026-07-04", title: "   " }).ok, false);
  assert.equal(validateEventInput({ date: "2026-07-04", title: "x".repeat(81) }).ok, false);
  const v = validateEventInput({ date: "2026-07-04", title: "  Flip to 12/12  " });
  assert.equal(v.fields.title, "Flip to 12/12");
});

test("create: bad dates and times are rejected", () => {
  assert.equal(validateEventInput({ date: "07/04/2026", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-02-31", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-13-01", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-07-04", title: "x", time: "25:00" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-07-04", title: "x", time: "9:00" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-07-04", title: "x", time: "09:00" }).fields.time, "09:00");
  assert.equal(validateEventInput({ date: "2026-07-04", title: "x", time: "23:59" }).fields.time, "23:59");
});

test("create: empty time and notes normalize to null", () => {
  const v = validateEventInput({ date: "2026-07-04", title: "x", time: "", notes: "   " });
  assert.equal(v.fields.time, null);
  assert.equal(v.fields.notes, null);
});

test("create: notes are trimmed and capped at 300", () => {
  const v = validateEventInput({ date: "2026-07-04", title: "x", notes: " n ".padEnd(400, "y") });
  assert.ok(v.fields.notes.length <= 300);
});

// ── patch (partial) validation ───────────────────────────────────────────────
test("patch: partial updates touch only supplied fields", () => {
  const v = validateEventInput({ title: "Renamed" }, { partial: true });
  assert.equal(v.ok, true);
  assert.deepEqual(v.fields, { title: "Renamed" });
});

test("patch: explicit null clears time and notes", () => {
  const v = validateEventInput({ time: null, notes: null }, { partial: true });
  assert.deepEqual(v.fields, { time: null, notes: null });
});

test("patch: supplied-but-invalid fields still reject", () => {
  assert.equal(validateEventInput({ date: "junk" }, { partial: true }).ok, false);
  assert.equal(validateEventInput({ title: "" }, { partial: true }).ok, false);
});

test("garbage bodies reject instead of crashing", () => {
  assert.equal(validateEventInput(null).ok, false);
  assert.equal(validateEventInput("x").ok, false);
});
