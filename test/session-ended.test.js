import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

// api.js reaches for fetch at import time in no way, but the module is written
// for a browser, so give it the two globals it touches and load it fresh.
globalThis.fetch ??= async () => { throw new Error("no fetch in this test"); };

const { api, onSessionEnded, clearSessionEnded } = await import("../src/lib/api.js");

/** Stand in for the network, answering every call with one status. */
function respondWith(status, body = "{}") {
  globalThis.fetch = async () => new Response(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => { clearSessionEnded(); });

test("a 401 on an app route announces that the session ended", async () => {
  let fired = 0;
  const off = onSessionEnded(() => { fired++; });
  respondWith(401, JSON.stringify({ error: "not authenticated" }));
  await assert.rejects(() => api.getStats());
  off();
  assert.equal(fired, 1);
});

test("it announces once, however many requests were in flight", async () => {
  // Opening a screen fires eight and they all come back 401 together. The
  // grower should be moved to the login screen once, not eight times.
  let fired = 0;
  const off = onSessionEnded(() => { fired++; });
  respondWith(401);
  await Promise.allSettled([api.getStats(), api.getStats(), api.getStats()]);
  off();
  assert.equal(fired, 1);
});

test("a wrong password does NOT end the session", async () => {
  // /api/auth/login answers 401 for bad credentials. Treating that as an
  // expiry would sign you out of the sign-in screen, which is a loop.
  let fired = 0;
  const off = onSessionEnded(() => { fired++; });
  respondWith(401, JSON.stringify({ error: "invalid credentials" }));
  await assert.rejects(() => api.login("test", "wrong"));
  off();
  assert.equal(fired, 0);
});

test("a cold start with nobody signed in does NOT end the session", async () => {
  // /api/auth/me answers 401 whenever there is no session, which is the
  // ordinary first visit. AuthProvider already reads that as "show the login".
  let fired = 0;
  const off = onSessionEnded(() => { fired++; });
  respondWith(401);
  await assert.rejects(() => api.me());
  off();
  assert.equal(fired, 0);
});

test("other failures are left alone", async () => {
  // A 500 or a 429 is not a session ending, and signing the grower out over a
  // rate limit would be its own bug.
  for (const status of [400, 403, 429, 500, 503]) {
    clearSessionEnded();
    let fired = 0;
    const off = onSessionEnded(() => { fired++; });
    respondWith(status);
    await assert.rejects(() => api.getStats());
    off();
    assert.equal(fired, 0, `status ${status} ended the session`);
  }
});

test("a 401 still throws, so callers are not silently fed nothing", async () => {
  respondWith(401, JSON.stringify({ error: "not authenticated" }));
  await assert.rejects(() => api.getStats(), (err) => err.status === 401);
});

test("a listener that throws does not break the fetch", async () => {
  const off = onSessionEnded(() => { throw new Error("listener blew up"); });
  respondWith(401, JSON.stringify({ error: "not authenticated" }));
  // The caller should see the 401, not the listener's error.
  await assert.rejects(() => api.getStats(), (err) => err.status === 401);
  off();
});

test("signing in lets the next expiry speak again", async () => {
  let fired = 0;
  const off = onSessionEnded(() => { fired++; });
  respondWith(401);
  await assert.rejects(() => api.getStats());
  assert.equal(fired, 1);
  clearSessionEnded();
  await assert.rejects(() => api.getStats());
  off();
  assert.equal(fired, 2);
});

test("every network call in the client reports its status", () => {
  // A 401 anywhere is the same dead session, so every path that touches the
  // network has to report back. Most go through send(), but four do not: the
  // MJ stream and the three that want a blob or raw text.
  //
  // The count: each fetch() site except the one inside send() itself, plus
  // each send() call site, plus each XHR (the video upload, which needs upload
  // progress fetch cannot give), plus the one noteStatus definition. send()'s
  // own fetch is excluded because its two callers are what report for it.
  const src = read("../src/lib/api.js");
  const fetches = (src.match(/\bfetch\(/g) || []).length;
  const sendCalls = (src.match(/=\s*await send\(/g) || []).length;
  const xhrSends = (src.match(/\bxhr\.send\(/g) || []).length;
  const notes = (src.match(/\bnoteStatus\(/g) || []).length;

  const callSites = (fetches - 1) + sendCalls + xhrSends;
  assert.equal(notes, callSites + 1,
    `${callSites} network call sites but ${notes - 1} report their status`);
});

test("the provider turns the signal into a signed-out app", () => {
  const auth = read("../src/lib/auth.jsx");
  assert.match(auth, /onSessionEnded\(\(\) => \{\s*setUser\(null\);/);
  // Signing in and signing out both have to reset it, or the login screen
  // keeps explaining an expiry that already happened.
  assert.equal((auth.match(/clearSessionEnded\(\)/g) || []).length, 3);
  assert.ok(auth.includes("sessionExpired, login, logout"));
});

test("the login screen says why it is there", () => {
  const gate = read("../src/components/LoginGate.jsx");
  assert.ok(gate.includes("sessionExpired"));
  assert.match(gate, /Your session ended/);
  // Never on top of a real error or a password-reset confirmation.
  assert.ok(gate.includes("sessionExpired && !successMsg && !error"));
});
