// Move every photo already in D1 across to R2.
//
//   node scripts/backfill-photos.mjs https://grow-calendar.example.workers.dev
//
// It asks for the username and password of the account whose photos are being
// moved, signs in, and then calls POST /api/photos/backfill until nothing is
// left. The moving happens inside the worker, where both the database and the
// bucket are already bound; this script only drives the loop and shows how far
// it has got. Nothing is pulled down here.
//
// Safe to stop and safe to re-run. A row that has been moved carries its object
// keys and is never selected again, so a second run resumes rather than
// repeating, and an interrupted run leaves no half-written photo: the bytes go
// to the bucket first and the row is only rewritten once both sizes are there.
//
// Nothing is deleted. The blob columns are blanked in place, which is what
// frees the space; the rows, their dates, their captions and their plant links
// are all untouched.

import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";

const base = (process.argv[2] || "").replace(/\/+$/, "");
if (!base) {
  console.error("usage: node scripts/backfill-photos.mjs <base-url>");
  console.error("   eg: node scripts/backfill-photos.mjs http://127.0.0.1:8788");
  process.exit(1);
}

const rl = createInterface({ input: stdin, output: stdout });
const username = process.env.BCB_USER || await rl.question("username: ");
const password = process.env.BCB_PASS || await rl.question("password: ");
rl.close();

const res = await fetch(`${base}/api/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ username, password }),
});
if (!res.ok) {
  console.error(`sign in failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}

// The session cookie, kept by hand because fetch does not carry a jar.
const cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie")])
  .filter(Boolean)
  .map((c) => c.split(";")[0])
  .join("; ");
if (!cookie) {
  console.error("signed in but no session cookie came back");
  process.exit(1);
}

let moved = 0;
let failed = 0;
// A run that stops making progress must end rather than spin. The worker says
// so itself via `stuck`; this is the belt to that braces.
let idleRounds = 0;

for (;;) {
  const r = await fetch(`${base}/api/photos/backfill`, {
    method: "POST",
    // The worker rejects a POST that is not declared JSON, body or no body.
    headers: { cookie, "content-type": "application/json" },
    body: "{}",
  });
  if (!r.ok) {
    console.error(`\nbackfill failed: ${r.status} ${await r.text()}`);
    process.exit(1);
  }
  const batch = await r.json();
  moved += batch.moved ?? 0;
  failed += batch.failed ?? 0;

  stdout.write(`\rmoved ${moved}, ${batch.remaining} to go${failed ? `, ${failed} could not be read` : ""}   `);

  if (batch.done) break;
  if (batch.stuck || (batch.moved === 0 && ++idleRounds > 2)) {
    console.error(`\nstopping: ${batch.remaining} photos could not be moved. See the worker log for photo-backfill-failed.`);
    process.exit(1);
  }
  if (batch.moved) idleRounds = 0;
}

console.log(`\ndone. ${moved} photo${moved === 1 ? "" : "s"} now live in the bucket.`);
if (failed) console.log(`${failed} could not be decoded and were left in the database.`);
