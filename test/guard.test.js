import { test } from "node:test";
import assert from "node:assert/strict";
import { isApproved, isAdmin } from "../worker/guard.js";

test("isApproved is true only for approved users", () => {
  assert.equal(isApproved({ status: "approved" }), true);
  assert.equal(isApproved({ status: "pending" }), false);
  assert.equal(isApproved(null), false);
});

test("isAdmin is true only for admin role", () => {
  assert.equal(isAdmin({ role: "admin" }), true);
  assert.equal(isAdmin({ role: "user" }), false);
  assert.equal(isAdmin(null), false);
});
