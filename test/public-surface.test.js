import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Everything in this app is the owner's and nobody else's. Exactly four things
// answer without a session, and each one is here on purpose:
//
//   /api/health          says the database is up, and nothing else
//   /api/auth/*          the door itself
//   /api/share/:token    the friend link, which the owner hands out and revokes
//   /s/:code             one strain's reference page, addressed by a code that
//                        is only ever printed on that strain's own label
//
// This test is the lock on that list. A route added above the session check in
// worker/index.js fails it, which is the point: opening a fifth public surface
// should take a deliberate edit here, not a patch that happens to land in the
// wrong half of the file.
const ALLOWED_PUBLIC = [
  "/api/health",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/reset-password",
];

const src = readFileSync(new URL("../worker/index.js", import.meta.url).pathname, "utf8");

// Everything before this line runs without a user; everything after has one.
const GATE = "const user = await currentUser(request, env);";

function publicHalf() {
  const i = src.indexOf(GATE);
  assert.ok(i > 0, "the session gate moved or was renamed");
  return src.slice(0, i);
}

test("the session gate refuses every request that gets past it without a user", () => {
  const after = src.slice(src.indexOf(GATE));
  assert.match(after.slice(0, 200), /if \(!user\) return error\(401/);
});

test("no route answers without a session except the five named ones", () => {
  const found = [...publicHalf().matchAll(/path === "(\/api\/[^"]*)"/g)].map((m) => m[1]);
  assert.deepEqual(found.sort(), [...ALLOWED_PUBLIC].sort());
});

test("the only public pattern routes are the share link's", () => {
  // Any regex-matched path in the public half must be a share route.
  const patterns = [...publicHalf().matchAll(/\^\\?\/api\\?\/([a-z-]+)/g)].map((m) => m[1]);
  const offenders = [...new Set(patterns)].filter((p) => p !== "share");
  assert.deepEqual(offenders, [], `public pattern routes outside /api/share: ${offenders.join(", ")}`);
});

test("nothing public writes", () => {
  // Every share route is guarded by a GET check, and the auth routes are the
  // only POSTs. A public handler named create/update/delete/post/put/patch is
  // a mistake by definition.
  const half = publicHalf();
  const calls = [...half.matchAll(/return (\w+)\(/g)].map((m) => m[1]);
  const writers = calls.filter((c) => /^(create|update|delete|put|patch|post|archive|purge|add|set)/i.test(c));
  // postResetPassword and login/logout are the door; they are allowed to write.
  const unexpected = writers.filter((c) => !["postResetPassword"].includes(c));
  assert.deepEqual(unexpected, [], `public write handlers: ${unexpected.join(", ")}`);
});

test("every authenticated route is owner-only", () => {
  // requireOwner is the single definition of "me". It must gate the whole
  // authenticated half, before any handler, not per route.
  const after = src.slice(src.indexOf("async function authenticatedRoute"));
  const gate = after.indexOf("requireOwner(user)");
  const firstRoute = after.indexOf('if (path ===');
  assert.ok(gate > 0, "authenticatedRoute no longer calls requireOwner");
  assert.ok(gate < firstRoute, "requireOwner must run before any route is dispatched");
});

test("the owner gate answers 404, so a stranger learns nothing", () => {
  const owner = readFileSync(new URL("../worker/owner.js", import.meta.url).pathname, "utf8");
  assert.match(owner, /error\(404/);
  assert.ok(!/error\(403/.test(owner), "403 would confirm the route exists");
});

test("nothing is offered to a search engine", () => {
  const headers = readFileSync(new URL("../public/_headers", import.meta.url).pathname, "utf8");
  assert.match(headers, /X-Robots-Tag:\s*noindex/i);
  const html = readFileSync(new URL("../index.html", import.meta.url).pathname, "utf8");
  assert.match(html, /<meta name="robots" content="noindex/);
  const robots = readFileSync(new URL("../public/robots.txt", import.meta.url).pathname, "utf8");
  assert.match(robots, /Disallow:\s*\/\s*$/m);
});

test("the session cookie cannot be read by script or sent cross-site", () => {
  const util = readFileSync(new URL("../worker/util.js", import.meta.url).pathname, "utf8");
  assert.match(util, /session=\$\{token\}; Path=\/; HttpOnly\$\{secureFlag\}; SameSite=Lax/);
});
