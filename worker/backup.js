// Everything you have written down, in one file you can keep.
//
// The app's record lives in one D1 database. Cloudflare's own point-in-time
// restore covers a fat-fingered delete for a while, but it does not cover
// losing the account, and it does not help with a loss you notice a year from
// now. This endpoint is the copy that is yours: it leaves Cloudflare entirely
// and lands on your phone.
//
// It is deliberately the RECORD and not the pictures. Photo rows come out with
// their dates and captions but without their bytes, because the bytes are
// hundreds of megabytes of base64 and they are already in the camera roll. What
// you get instead is a list of what existed, so a restored journal still knows
// there were four photos on the 8th.

import { error } from "./util.js";

/**
 * What goes in the file.
 *
 * `scope: "user"` filters by user_id. `omit` drops columns from the output.
 * Anything not named here is left out on purpose, and the reasons matter:
 *
 *   sessions, password_reset_tokens  live credentials, useless in a backup and
 *                                    dangerous in a file you email yourself
 *   login_attempts, client_errors    logs, not record
 *   weather_cache, strain_profile    caches that rebuild themselves
 *   mj_model_usage, plan_gen_usage,
 *   mj_usage                         rate-limit counters, meaningless restored
 *   push_subscriptions               device tokens, dead the moment they move
 *   users                            it is in the file, but as `account` and
 *                                    not as a table. Its password columns are
 *                                    NOT NULL and are deliberately not backed
 *                                    up, so an INSERT of it can only fail, and
 *                                    a failed statement aborts the whole
 *                                    restore. It is there to say whose record
 *                                    this is, not to be put back.
 *   share_tokens                     unlike sessions and reset tokens, a share
 *                                    token is stored in the clear, and it is a
 *                                    standing read credential for the whole
 *                                    grow. A backup sits in a downloads folder
 *                                    and gets mailed around; that is no place
 *                                    for one. Restoring is a tap on Share.
 */
export const BACKUP_TABLES = [
  { table: "grows", scope: "user" },
  { table: "grow_events", scope: "user" },
  { table: "plant_log", scope: "user" },
  { table: "env_readings", scope: "user" },

  // The writing and the log: the part that cannot be reconstructed from
  // anything else.
  { table: "day_notes", scope: "user" },
  { table: "grow_log", scope: "user" },
  { table: "task_checkoffs", scope: "user" },
  { table: "task_notes", scope: "user" },

  { table: "plan_config", scope: "user" },
  { table: "plan_day_overrides", scope: "user" },

  { table: "strain_library", scope: "user" },
  { table: "strain_catalog", scope: "global" },

  { table: "mj_conversations", scope: "user" },
  { table: "media", scope: "user" },
  { table: "settings", scope: "global" },

  // Dates and captions, never the base64. See the note at the top.
  { table: "journal_photos", scope: "user", omit: ["data", "thumb"] },
];

const PAGE = 400;

function scopeClause(scope) {
  if (scope === "user") return { where: " WHERE user_id = ?", bind: true };
  if (scope === "self") return { where: " WHERE id = ?", bind: true };
  return { where: "", bind: false };
}

/**
 * Read one table out in pages.
 *
 * D1 hands back a whole result set at once, so a single unbounded SELECT on a
 * table that has grown for years is the one thing here that could run the
 * Worker out of memory. Paging keeps the ceiling flat no matter how long the
 * record gets.
 */
async function* readTable(env, userId, { table, scope, omit }) {
  const { where, bind } = scopeClause(scope);
  const drop = new Set(omit ?? []);
  for (let offset = 0; ; offset += PAGE) {
    const stmt = env.DB.prepare(
      `SELECT * FROM ${table}${where} ORDER BY rowid LIMIT ${PAGE} OFFSET ${offset}`,
    );
    let rows;
    try {
      const res = await (bind ? stmt.bind(userId) : stmt).all();
      rows = res.results ?? [];
    } catch {
      // A table this database has never created yet is not a failed backup.
      return;
    }
    for (const row of rows) {
      if (drop.size) for (const k of drop) delete row[k];
      yield row;
    }
    if (rows.length < PAGE) return;
  }
}

/**
 * GET /api/backup.json
 *
 * Streamed rather than assembled, so the response starts before the whole
 * record has been read and nothing has to be held at once. Row counts land at
 * the end of the object, once they are known.
 */
export async function getBackup(env, user) {
  if (!user?.id) return error(401, "not signed in");

  const stamp = new Date().toISOString();
  const enc = new TextEncoder();
  const counts = {};

  // Whose record this is. Deliberately outside `tables`: everything in there
  // can be replayed straight into a database, and this cannot.
  let account = null;
  try {
    account = await env.DB.prepare(
      "SELECT id, username, first_name, last_name, created_at FROM users WHERE id = ?",
    ).bind(user.id).first();
  } catch { /* older schema */ }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (s) => controller.enqueue(enc.encode(s));
      try {
        send(`{\n"format": "black-cat-botanicals-backup",\n"version": 1,\n`);
        send(`"exported_at": ${JSON.stringify(stamp)},\n`);
        send(`"photos": "metadata only, the images themselves are in your camera roll",\n`);
        send(`"account": ${JSON.stringify(account)},\n`);
        send(`"restore": "every array under tables replays with INSERT OR REPLACE; see scripts/restore.mjs",\n`);
        send(`"tables": {\n`);

        let firstTable = true;
        for (const spec of BACKUP_TABLES) {
          if (!firstTable) send(",\n");
          firstTable = false;
          send(`${JSON.stringify(spec.table)}: [`);
          let n = 0;
          for await (const row of readTable(env, user.id, spec)) {
            send((n++ ? "," : "") + "\n" + JSON.stringify(row));
          }
          send(n ? "\n]" : "]");
          counts[spec.table] = n;
        }

        send(`\n},\n"counts": ${JSON.stringify(counts, null, 0)}\n}\n`);
        controller.close();
      } catch (err) {
        // The stream has already started, so there is no status code left to
        // change. Close the JSON with the failure inside it: a file that says
        // it is incomplete beats a file that silently is.
        send(`\n], "incomplete": ${JSON.stringify(String(err?.message ?? err))}}\n`);
        controller.close();
      }
    },
  });

  const day = stamp.slice(0, 10);
  return new Response(stream, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="black-cat-backup-${day}.json"`,
      "cache-control": "no-store",
    },
  });
}
