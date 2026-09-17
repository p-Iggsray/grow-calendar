import { test } from "node:test";
import assert from "node:assert/strict";
import { shareContext, shareSurvey, shareLifecycle, SHARE_TOKEN_RE } from "../worker/share.js";
import { getShareDay, getSharePhoto, getShareSpaces } from "../worker/shareView.js";

// A link resolves to a grower and to a set of spaces. Everything below is
// about which spaces that is, and what never travels with them.

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaa";

const survey = (extra = {}) => ({
  crop: "cannabis",
  environment: "Tent",
  location: "1 Rosemary Lane, Portland",
  lat: 45.52,
  lon: -122.68,
  coords: { lat: 45.52, lon: -122.68 },
  strains: [{ id: "p1", name: "Blue Dream", type: "hybrid" }],
  ...extra,
});

// A fake D1 that answers only the queries these routes actually make.
function db({ tokens = { [TOKEN]: 7 }, grows = [], photos = [], plantLog = [] } = {}) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind(...a) { this.a = a; return this; },
          async first() {
            if (/FROM share_tokens WHERE token/.test(sql)) {
              const uid = tokens[this.a[0]];
              return uid == null ? null : { user_id: uid };
            }
            if (/FROM journal_photos WHERE id = \?/.test(sql)) {
              const p = photos.find((r) => r.id === this.a[0] && r.user_id === this.a[1]);
              return p ? { grow_id: p.grow_id, url: p.url } : null;
            }
            return null;
          },
          async all() {
            if (/FROM grows WHERE user_id/.test(sql)) {
              return { results: grows.filter((g) => g.user_id === this.a[0]) };
            }
            if (/FROM plant_log/.test(sql)) return { results: plantLog };
            return { results: [] };
          },
          async run() { return {}; },
        };
      },
    },
  };
}

const growRow = (id, over = {}) => ({
  user_id: 7, id,
  display_name: id,
  status: "active",
  archived_at: null,
  survey: JSON.stringify(survey()),
  lifecycle: null,
  created_at: "2026-01-01T00:00:00.000Z",
  ...over,
});

test("a token that does not exist resolves to nothing", async () => {
  assert.equal(await shareContext(db(), "bbbbbbbbbbbbbbbbbbbbbb"), null);
});

test("a malformed token is rejected before it reaches the database", async () => {
  let asked = false;
  const env = { DB: { prepare() { asked = true; return { bind: () => ({ first: async () => null }) }; } } };
  assert.equal(await shareContext(env, "short"), null);
  assert.equal(await shareContext(env, "../../etc/passwd"), null);
  assert.equal(asked, false);
});

test("an archived space is not on the link", async () => {
  const ctx = await shareContext(db({
    grows: [growRow("live"), growRow("put_away", { archived_at: "2026-05-01T00:00:00.000Z" })],
  }), TOKEN);
  assert.deepEqual([...ctx.growIds], ["live"]);
});

test("a space that never finished setup is not on the link", async () => {
  const ctx = await shareContext(db({
    grows: [growRow("ready"), growRow("half_made", { survey: null })],
  }), TOKEN);
  assert.deepEqual([...ctx.growIds], ["ready"]);
});

test("reading a day of an archived space answers 404, not its contents", async () => {
  const env = db({ grows: [growRow("live"), growRow("gone", { archived_at: "2026-05-01T00:00:00.000Z" })] });
  const res = await getShareDay(env, TOKEN, "gone", "2026-06-01");
  assert.equal(res.status, 404);
});

test("a space id that is not on the link answers 404 rather than 403", async () => {
  // 403 would confirm the id exists. A link holder learns nothing either way.
  const env = db({ grows: [growRow("live")] });
  assert.equal((await getShareDay(env, TOKEN, "somebodyelse", "2026-06-01")).status, 404);
});

test("a photograph in an archived space cannot be fetched through the link", async () => {
  const env = db({
    grows: [growRow("live"), growRow("gone", { archived_at: "2026-05-01T00:00:00.000Z" })],
    photos: [
      { id: "ph_live", user_id: 7, grow_id: "live", url: "data:image/jpeg;base64,/9j/" },
      { id: "ph_gone", user_id: 7, grow_id: "gone", url: "data:image/jpeg;base64,/9j/" },
    ],
  });
  assert.equal((await getSharePhoto(env, TOKEN, "ph_live", "thumb")).status, 200);
  assert.equal((await getSharePhoto(env, TOKEN, "ph_gone", "thumb")).status, 404);
});

test("a photograph belonging to another grower cannot be fetched through the link", async () => {
  const env = db({
    grows: [growRow("live")],
    photos: [{ id: "ph_theirs", user_id: 99, grow_id: "live", url: "data:image/jpeg;base64,/9j/" }],
  });
  assert.equal((await getSharePhoto(env, TOKEN, "ph_theirs", "thumb")).status, 404);
});

test("where the grow is never leaves the server", () => {
  const out = shareSurvey(survey());
  assert.equal(out.location, undefined);
  assert.equal(out.lat, undefined);
  assert.equal(out.lon, undefined);
  assert.equal(out.coords, undefined);
  assert.deepEqual(Object.keys(out).sort(), ["crop", "environment", "strains"]);
  // What is kept is what makes the journal readable.
  assert.equal(out.environment, "Tent");
  assert.deepEqual(out.strains, [{ id: "p1", name: "Blue Dream", type: "hybrid" }]);
});

test("no location survives the spaces index either", async () => {
  const env = db({ grows: [growRow("live")] });
  const body = await (await getShareSpaces(env, TOKEN)).json();
  const text = JSON.stringify(body);
  for (const secret of ["Rosemary", "45.52", "-122.68"]) {
    assert.ok(!text.includes(secret), `the index leaked ${secret}`);
  }
});

test("the grower's closing notes stay with the grower", () => {
  const out = shareLifecycle({
    phase: "curing",
    dryStartedAt: "2026-08-01",
    cureStartedAt: "2026-08-08",
    finishedAt: null,
    finalNotes: "smelled like cat piss, never again",
    dryLog: [{ notes: "private" }],
  });
  assert.deepEqual(Object.keys(out).sort(), ["cureStartedAt", "dryStartedAt", "finishedAt", "phase"]);
});

test("a shared day carries no reminders", async () => {
  const env = db({ grows: [growRow("live")] });
  const body = await (await getShareDay(env, TOKEN, "live", "2026-06-01")).json();
  // grow_events is the reminders table. The day payload has no door to it.
  assert.equal("events" in body, false);
  assert.deepEqual(Object.keys(body).sort(), ["date", "log", "note", "photos", "plantEntries"]);
});

test("the token pattern accepts what createShareToken mints and little else", () => {
  assert.ok(SHARE_TOKEN_RE.test("abcDEF012_-abcDEF012_-abcDEF012_"));
  assert.ok(!SHARE_TOKEN_RE.test("tooshort"));
  assert.ok(!SHARE_TOKEN_RE.test("has spaces in it and is long"));
  assert.ok(!SHARE_TOKEN_RE.test("../../../../../../etc/passwd"));
});
