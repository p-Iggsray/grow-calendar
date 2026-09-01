import { test } from "node:test";
import assert from "node:assert/strict";
import { isApproved, requireApproved } from "../worker/guard.js";

test("isApproved is true only for approved users", () => {
  assert.equal(isApproved({ status: "approved" }), true);
  assert.equal(isApproved({ status: "pending" }), false);
  assert.equal(isApproved(null), false);
});


test("requireApproved returns null when approved, Response otherwise", () => {
  assert.equal(requireApproved({ status: "approved" }), null);
  assert.ok(requireApproved({ status: "pending" }) instanceof Response);
  assert.ok(requireApproved(null) instanceof Response);
});

