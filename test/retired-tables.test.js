import { test } from "node:test";
import assert from "node:assert/strict";
import { ensureRetiredTablesDropped, retiredTableStatements } from "../worker/retiredTables.js";

function db({ done = false, failOn = null } = {}) {
  const ran = [];
  return {
    ran,
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() { return /FROM settings/.test(sql) && done ? { value: "x" } : null; },
          async run() {
            ran.push(sql);
            if (failOn && failOn.test(sql)) throw new Error("no such column");
            return {};
          },
        };
      },
    },
  };
}

test("every retired table and column has a statement", () => {
  const sql = retiredTableStatements();
  assert.ok(sql.includes("DROP TABLE IF EXISTS mj_conversations"));
  assert.ok(sql.includes("DROP TABLE IF EXISTS strain_profile"));
  assert.ok(sql.includes("ALTER TABLE grow_log DROP COLUMN read_from"));
});

test("a failing statement does not stop the rest, and the marker is still set", async () => {
  const env = db({ failOn: /DROP COLUMN/ });
  await ensureRetiredTablesDropped(env);
  for (const s of retiredTableStatements()) assert.ok(env.ran.includes(s), s);
  assert.ok(env.ran.some((s) => /INSERT OR REPLACE INTO settings/.test(s)));
});
