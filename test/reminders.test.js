import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEventInput } from "../worker/events.js";

// The reminder label lives in a .jsx component, so its logic is duplicated
// here only if it moves; for now the worker-side validation is what protects
// the data, and that is what these cover.

test("a reminder needs a real date and a title", () => {
  const ok = validateEventInput({ date: "2026-09-10", title: "Feed day" });
  assert.equal(ok.ok, true);
  assert.equal(ok.fields.date, "2026-09-10");
  assert.equal(ok.fields.title, "Feed day");

  assert.equal(validateEventInput({ date: "2026-09-10" }).ok, false);          // no title
  assert.equal(validateEventInput({ title: "Feed day" }).ok, false);           // no date
  assert.equal(validateEventInput({ date: "nope", title: "x" }).ok, false);
  assert.equal(validateEventInput(null).ok, false);
});

test("a date that does not exist is refused, not rolled over", () => {
  // 2026 is not a leap year, and September has 30 days.
  assert.equal(validateEventInput({ date: "2026-02-29", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-09-31", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-13-01", title: "x" }).ok, false);
  assert.equal(validateEventInput({ date: "2028-02-29", title: "x" }).ok, true); // real leap day
});

test("time is optional but must be a real 24-hour clock time", () => {
  assert.equal(validateEventInput({ date: "2026-09-10", title: "x", time: "07:30" }).ok, true);
  assert.equal(validateEventInput({ date: "2026-09-10", title: "x", time: "23:59" }).ok, true);
  assert.equal(validateEventInput({ date: "2026-09-10", title: "x", time: "24:00" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-09-10", title: "x", time: "7:30" }).ok, false);
  assert.equal(validateEventInput({ date: "2026-09-10", title: "x", time: "noon" }).ok, false);
});

test("a patch may change one field without resupplying the rest", () => {
  const v = validateEventInput({ title: "Flip to 12/12" }, { partial: true });
  assert.equal(v.ok, true);
  assert.equal(v.fields.title, "Flip to 12/12");
  assert.equal(v.fields.date, undefined);
});
