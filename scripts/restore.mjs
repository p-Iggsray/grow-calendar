// Turn a backup file back into a database.
//
//   node scripts/restore.mjs black-cat-backup-2026-09-09.json > restore.sql
//   npx wrangler d1 execute grow-calendar-db --local --file=./restore.sql
//
// Drop --local to write the real one, and read the warning below before you do.
//
// A backup nobody has ever restored is not a backup, it is a file. This script
// exists so the restore is a command you have run rather than a plan you have.
//
// What it does NOT do, on purpose:
//
//   * it does not create the account. The users row is in the backup as
//     `account`, for reference, but its password columns are deliberately not
//     backed up and they are NOT NULL, so inserting it could only fail, and one
//     failed statement aborts the whole file. Sign up first, then restore into
//     that account.
//   * it does not delete anything. Every statement is INSERT OR REPLACE, so
//     restoring over a live database fills gaps and overwrites collisions,
//     and never empties a table you still wanted.
//   * it does not bring back photo images. Those were never in the file; they
//     are in the camera roll. The photo ROWS come back, so the journal still
//     knows what was taken and when, with a blank tile where the picture was.

import { readFileSync } from "node:fs";

// A 1x1 transparent PNG.
//
// journal_photos.data and .thumb are NOT NULL, and the backup deliberately does
// not carry the bytes. Without something in those columns every photo row fails
// to insert, and because one failed statement aborts the whole file, that takes
// the journal and the log down with it. A blank tile on the right day is the
// honest result: the record says a photo was taken, and the picture is in the
// camera roll where it always was.
const BLANK_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk" +
  "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

const FILL = {
  journal_photos: { data: BLANK_PNG, thumb: BLANK_PNG },
};

const path = process.argv[2];
if (!path) {
  console.error("usage: node scripts/restore.mjs <backup.json> > restore.sql");
  process.exit(1);
}

const backup = JSON.parse(readFileSync(path, "utf8"));
if (backup.format !== "black-cat-botanicals-backup") {
  console.error(`not a Black Cat backup: ${path}`);
  process.exit(1);
}
if (backup.incomplete) {
  console.error(`refusing: this backup says it is incomplete (${backup.incomplete})`);
  process.exit(1);
}

// SQLite literals. Numbers and nulls go bare; everything else is a quoted
// string with its quotes doubled, which is the whole of SQL escaping here
// because nothing in a backup is an identifier.
function lit(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replaceAll("'", "''")}'`;
}

const lines = [];
let total = 0;
for (const [table, rows] of Object.entries(backup.tables ?? {})) {
  if (!Array.isArray(rows) || rows.length === 0) continue;
  lines.push(`-- ${table}: ${rows.length} rows`);
  for (const row of rows) {
    const full = { ...(FILL[table] ?? {}), ...row };
    const cols = Object.keys(full);
    if (!cols.length) continue;
    lines.push(
      `INSERT OR REPLACE INTO ${table} (${cols.join(", ")}) VALUES (${
        cols.map((c) => lit(full[c])).join(", ")
      });`,
    );
    total++;
  }
}

const who = backup.account?.username ?? "unknown";
console.error(`${total} rows from ${backup.exported_at} (account: ${who})`);
console.log(`-- Black Cat Botanicals restore, from a backup taken ${backup.exported_at}`);
console.log(`-- account: ${who}. Sign that account up first; this file does not create it.`);
console.log(lines.join("\n"));
