import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_TABLES } from "../worker/backup.js";
import { backupAge } from "../src/lib/backup.js";
import { readFileSync } from "node:fs";

const byName = Object.fromEntries(BACKUP_TABLES.map((t) => [t.table, t]));

// A backup that quietly misses a table is worse than no backup, because you
// only find out on the day you need it. These are the tables that cannot be
// reconstructed from anything else.
test("the irreplaceable tables are all in the manifest", () => {
  for (const t of [
    "grows", "day_notes", "grow_log", "plant_log", "env_readings",
    "task_checkoffs", "task_notes", "plan_config", "plan_day_overrides",
    "strain_library", "grow_events", "mj_conversations", "journal_photos",
  ]) {
    assert.ok(byName[t], `${t} is not in the backup`);
  }
});

test("nothing that could sign somebody in is ever written to the file", () => {
  // A backup gets emailed to yourself and sat in a downloads folder. Live
  // credentials have no business in it.
  // share_tokens belongs on this list even though it is the user's own: unlike
  // sessions and reset tokens it is stored unhashed, so backing it up would put
  // a standing read link to the whole grow in a file that travels.
  for (const t of ["sessions", "password_reset_tokens", "push_subscriptions", "share_tokens"]) {
    assert.equal(byName[t], undefined, `${t} must not be backed up`);
  }
  // The account is not a table in the backup at all. It rides at the top level
  // as `account`, selected by an explicit column list that names no secret, and
  // the restore never inserts it.
  assert.equal(byName.users, undefined, "users must not be a restorable table");
});

test("no table is read with an unfiltered SELECT of a credential column", () => {
  const src = readFileSync(new URL("../worker/backup.js", import.meta.url), "utf8");
  assert.ok(!/password_hash|password_salt/.test(src.split("BACKUP_TABLES")[1] ?? ""),
    "no password column may appear below the manifest");
  // The account query is spelled out column by column rather than SELECT *, so
  // a column added to users later cannot leak into the file by default.
  assert.match(src, /SELECT id, username, first_name, last_name, created_at FROM users/);
});

test("photo rows come without their bytes", () => {
  // The images are hundreds of megabytes of base64 and are already in the
  // camera roll. What the record needs is that they existed.
  assert.deepEqual(byName.journal_photos.omit, ["data", "thumb"]);
});

test("every table declares a scope, and user data is filtered by user", () => {
  for (const spec of BACKUP_TABLES) {
    assert.ok(["user", "self", "global"].includes(spec.scope), `${spec.table} has no valid scope`);
  }
  // Anything holding a user_id must be filtered by it, or a backup would hand
  // you rows that are not yours.
  for (const t of ["grows", "day_notes", "grow_log", "journal_photos"]) {
    assert.equal(byName[t].scope, "user");
  }
});

test("the age line says how long it has been, and nags once it is stale", () => {
  const now = new Date("2026-09-09T12:00:00Z");
  const at = (d) => new Date(now - d * 86400000).toISOString();

  assert.equal(backupAge(null, now).text, "Never backed up on this device");
  assert.equal(backupAge(null, now).stale, true, "never backed up is the case worth nagging about");
  assert.equal(backupAge(at(0), now).text, "Backed up today");
  assert.equal(backupAge(at(1), now).text, "Backed up yesterday");
  assert.equal(backupAge(at(9), now).text, "Backed up 9 days ago");
  assert.equal(backupAge(at(40), now).text, "Backed up over a month ago");
  assert.match(backupAge(at(200), now).text, /over 6 months ago/);

  assert.equal(backupAge(at(29), now).stale, false);
  assert.equal(backupAge(at(30), now).stale, true);
  assert.equal(backupAge("not a date", now).stale, true);
});

// ── The restore ────────────────────────────────────────────────────────────
// A backup nobody has restored is a file, not a backup. These pin the two
// things that made the first restore attempt fail silently: one bad statement
// aborts wrangler's whole file, so anything that cannot insert takes the
// journal down with it.

import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function restoreSql(backup) {
  const dir = mkdtempSync(join(tmpdir(), "bcb-"));
  const file = join(dir, "b.json");
  writeFileSync(file, JSON.stringify(backup));
  return execFileSync("node", ["scripts/restore.mjs", file], { encoding: "utf8" });
}

const FIXTURE = {
  format: "black-cat-botanicals-backup",
  version: 1,
  exported_at: "2026-09-09T00:00:00.000Z",
  account: { id: 1, username: "test" },
  tables: {
    day_notes: [{ user_id: 1, grow_id: "g1", date: "2026-09-06", body: "it's <b>fine</b>" }],
    journal_photos: [{ id: "ph1", user_id: 1, grow_id: "g1", date: "2026-09-06" }],
  },
};

test("photo rows restore with a placeholder, because data is NOT NULL", () => {
  // Without this the photo INSERT fails, and one failed statement aborts the
  // whole restore, taking the journal with it.
  const sql = restoreSql(FIXTURE);
  const photo = sql.split("\n").find((l) => l.includes("INTO journal_photos"));
  assert.ok(photo.includes("data"), "data column must be supplied");
  assert.ok(photo.includes("thumb"), "thumb column must be supplied");
  assert.match(photo, /data:image\/png;base64,/);
});

test("the account is never inserted, since its password columns are NOT NULL", () => {
  const sql = restoreSql({ ...FIXTURE, tables: { ...FIXTURE.tables } });
  assert.ok(!/INSERT[^\n]*INTO users/.test(sql), "restoring the users row can only fail");
});

test("quotes in the writing survive the trip", () => {
  const sql = restoreSql(FIXTURE);
  assert.match(sql, /'it''s <b>fine<\/b>'/);
});

test("a restore never deletes, so running it over a live database is safe", () => {
  const sql = restoreSql(FIXTURE);
  assert.ok(!/\bDELETE\b|\bDROP\b|\bTRUNCATE\b/i.test(sql));
  for (const line of sql.split("\n").filter((l) => l.startsWith("INSERT"))) {
    assert.match(line, /^INSERT OR REPLACE INTO/);
  }
});

test("a backup that admits it is incomplete is refused", () => {
  assert.throws(() => restoreSql({ ...FIXTURE, incomplete: "ran out of memory" }));
  assert.throws(() => restoreSql({ format: "something else" }));
});
