import { test } from "node:test";
import assert from "node:assert/strict";
import { isApproved, isAdmin, requireApproved, requireAdmin } from "../worker/guard.js";

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

test("requireApproved returns null when approved, Response otherwise", () => {
  assert.equal(requireApproved({ status: "approved" }), null);
  assert.ok(requireApproved({ status: "pending" }) instanceof Response);
  assert.ok(requireApproved(null) instanceof Response);
});

test("requireAdmin returns null when admin, Response otherwise", () => {
  assert.equal(requireAdmin({ role: "admin" }), null);
  assert.ok(requireAdmin({ role: "user" }) instanceof Response);
  assert.ok(requireAdmin(null) instanceof Response);
});
