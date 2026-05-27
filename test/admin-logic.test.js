import { test } from "node:test";
import assert from "node:assert/strict";
import { canDeleteUser } from "../worker/admin.js";

test("cannot delete yourself", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 1, targetRole: "admin", adminCount: 2 });
  assert.equal(r.ok, false);
});

test("cannot delete the last admin", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 2, targetRole: "admin", adminCount: 1 });
  assert.equal(r.ok, false);
});

test("can delete another non-admin user", () => {
  const r = canDeleteUser({ actingId: 1, targetId: 2, targetRole: "user", adminCount: 1 });
  assert.equal(r.ok, true);
});
