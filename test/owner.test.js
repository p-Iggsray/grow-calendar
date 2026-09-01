import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwner, requireOwner } from "../worker/owner.js";

// This app is single-user. These tests pin the one rule that decides who gets
// in, because loosening it by accident would silently open the whole app.

test("isOwner is true only for an approved admin", () => {
  assert.equal(isOwner({ role: "admin", status: "approved" }), true);
});

test("isOwner rejects every other combination", () => {
  assert.equal(isOwner({ role: "user",  status: "approved" }), false);
  assert.equal(isOwner({ role: "user",  status: "pending"  }), false);
  assert.equal(isOwner({ role: "admin", status: "pending"  }), false);
  assert.equal(isOwner({ role: "admin" }), false);   // status missing
  assert.equal(isOwner({ status: "approved" }), false); // role missing
  assert.equal(isOwner({}), false);
  assert.equal(isOwner(null), false);
  assert.equal(isOwner(undefined), false);
});

test("isOwner is not fooled by truthy lookalikes", () => {
  assert.equal(isOwner({ role: "Admin", status: "approved" }), false);
  assert.equal(isOwner({ role: "administrator", status: "approved" }), false);
  assert.equal(isOwner({ role: "admin", status: "Approved" }), false);
  assert.equal(isOwner({ role: true, status: true }), false);
});

test("requireOwner lets the owner through and 404s everyone else", () => {
  assert.equal(requireOwner({ role: "admin", status: "approved" }), null);
  for (const stranger of [
    { role: "user", status: "approved" },
    { role: "admin", status: "pending" },
    null,
  ]) {
    const res = requireOwner(stranger);
    assert.ok(res instanceof Response);
    // 404, not 403: a stranger learns nothing about what is here.
    assert.equal(res.status, 404);
  }
});
