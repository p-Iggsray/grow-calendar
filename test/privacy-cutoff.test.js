import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { shareContext, SHAREABLE_CROP } from "../worker/share.js";
import { getShareSpaces, getShareDay, getSharePhoto } from "../worker/shareView.js";
import { recordStrains, purgeNonPublicStrains, newPageCode } from "../worker/strains.js";
import { getStrainPage } from "../worker/strainPage.js";

const TOKEN = "aaaaaaaaaaaaaaaaaaaaaa";

const survey = (crop, names) => ({
  crop, environment: crop === "mushrooms" ? "Monotub" : "Tent",
  strains: names.map((n, i) => ({ id: `p${i}`, name: n, type: "hybrid" })),
});

function db({ grows = [], catalog = [], photos = [] } = {}) {
  const state = { catalog: [...catalog], inserts: [], deletes: [] };
  const env = {
    _state: state,
    DB: {
      batch: async (stmts) => { for (const s of stmts) await s.run(); return []; },
      prepare(sql) {
        return {
          bind(...a) { this.a = a; return this; },
          async first() {
            if (/FROM share_tokens/.test(sql)) return { user_id: 7 };
            if (/FROM strain_catalog WHERE page_code/.test(sql)) {
              return state.catalog.find((r) => r.page_code === this.a[0]) ?? null;
            }
            if (/FROM strain_catalog WHERE name_key/.test(sql)) {
              return state.catalog.find((r) => r.name_key === this.a[0]) ?? null;
            }
            if (/FROM journal_photos WHERE id/.test(sql)) {
              const p = photos.find((r) => r.id === this.a[0] && r.user_id === this.a[1]);
              return p ? { grow_id: p.grow_id, url: p.url } : null;
            }
            if (/FROM strain_profile/.test(sql)) return null;
            return null;
          },
          async all() {
            if (/FROM grows WHERE user_id/.test(sql)) {
              return { results: grows.filter((g) => g.user_id === 7) };
            }
            return { results: [] };
          },
          async run() {
            if (/^\s*INSERT INTO strain_catalog/.test(sql)) state.inserts.push(this.a);
            if (/^\s*DELETE FROM strain_(catalog|profile)/.test(sql)) state.deletes.push(this.a);
            return {};
          },
        };
      },
    },
  };
  return env;
}

const growRow = (id, crop, over = {}) => ({
  user_id: 7, id, display_name: id, status: "active", archived_at: null,
  survey: JSON.stringify(survey(crop, ["Blue Dream"])),
  lifecycle: null, created_at: "2026-01-01T00:00:00.000Z", ...over,
});

// ── A mushroom space is not shareable, at all, ever ──────────────────────────

test("a mushroom space is not on a share link", async () => {
  const ctx = await shareContext(db({
    grows: [growRow("tent", "cannabis"), growRow("tub", "mushrooms")],
  }), TOKEN);
  assert.deepEqual([...ctx.growIds], ["tent"]);
});

test("a link with nothing but mushroom spaces opens nothing", async () => {
  const env = db({ grows: [growRow("tub", "mushrooms"), growRow("tub2", "mushrooms")] });
  assert.equal((await getShareSpaces(env, TOKEN)).status, 404);
});

test("a mushroom space cannot be reached by naming its id", async () => {
  const env = db({ grows: [growRow("tent", "cannabis"), growRow("tub", "mushrooms")] });
  assert.equal((await getShareDay(env, TOKEN, "tub", "2026-06-01")).status, 404);
});

test("a photograph of a mushroom space cannot be fetched through the link", async () => {
  const env = db({
    grows: [growRow("tent", "cannabis"), growRow("tub", "mushrooms")],
    photos: [{ id: "ph_tub", user_id: 7, grow_id: "tub", url: "data:image/jpeg;base64,/9j/" }],
  });
  assert.equal((await getSharePhoto(env, TOKEN, "ph_tub", "thumb")).status, 404);
});

test("no mushroom name appears anywhere in a link's payload", async () => {
  const env = db({
    grows: [
      growRow("tent", "cannabis"),
      { ...growRow("tub", "mushrooms"), survey: JSON.stringify(survey("mushrooms", ["Golden Teacher"])) },
    ],
  });
  const text = JSON.stringify(await (await getShareSpaces(env, TOKEN)).json());
  assert.ok(!/Golden Teacher/i.test(text), "a mushroom variety leaked into the index");
  assert.ok(!/Monotub/i.test(text), "a mushroom environment leaked into the index");
});

test("the shareable crop is an allowlist of one, not a list of exclusions", () => {
  // A crop added to the app later must be private until this constant says so.
  assert.equal(SHAREABLE_CROP, "cannabis");
  const src = readFileSync(new URL("../worker/share.js", import.meta.url).pathname, "utf8");
  assert.match(src, /cropOf\(g\.survey\) === SHAREABLE_CROP/);
  assert.ok(!/!==\s*["']mushrooms["']/.test(src), "crop filtering must not be a denylist");
});

// ── A mushroom variety never reaches the public catalog ──────────────────────

test("a mushroom survey records no strain in the public catalog", async () => {
  const env = db();
  await recordStrains(env, survey("mushrooms", ["Golden Teacher", "B+"]));
  assert.deepEqual(env._state.inserts, []);
});

test("a cannabis survey still records, and with a page code", async () => {
  const env = db();
  await recordStrains(env, survey("cannabis", ["Blue Dream"]));
  assert.equal(env._state.inserts.length, 1);
  const code = env._state.inserts[0].at(-1);
  assert.match(code, /^[A-Za-z0-9_-]{12,32}$/);
});

test("a survey with no crop is treated as cannabis, which is what it was", async () => {
  const env = db();
  await recordStrains(env, { strains: [{ name: "Blue Dream" }] });
  assert.equal(env._state.inserts.length, 1);
});

test("the sweep removes every name a mushroom grow ever contributed", async () => {
  const env = db({
    grows: [
      { ...growRow("tub", "mushrooms"), survey: JSON.stringify(survey("mushrooms", ["Golden Teacher", "B+"])) },
      growRow("tent", "cannabis"),
    ],
  });
  await purgeNonPublicStrains(env, 7);
  // The catalog row and the written profile cached against it, both.
  assert.equal(env._state.deletes.length, 2);
  for (const bound of env._state.deletes) {
    assert.deepEqual([...bound].sort(), ["b+", "golden teacher"]);
  }
});

// ── The public page is reachable by code and by nothing else ─────────────────

test("a page code is random, not derived from the name", () => {
  const a = newPageCode();
  const b = newPageCode();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{12,32}$/);
});

test("a strain name is no longer an address", async () => {
  const env = db({ catalog: [{ name_key: "blue dream", name: "Blue Dream", crop: "cannabis", page_code: "aaaaaaaaaaaaaaaa" }] });
  // The old URL shape. Guessing the word must get nothing back.
  assert.equal((await getStrainPage(env, "blue dream")).status, 404);
  assert.equal((await getStrainPage(env, "blue%20dream")).status, 404);
  assert.equal((await getStrainPage(env, "aaaaaaaaaaaaaaaa")).status, 200);
});

test("a mushroom row is refused by the page even if one reaches the catalog", async () => {
  // The catalog gate is upstream; this is the second lock on the same door.
  const env = db({ catalog: [{ name_key: "golden teacher", name: "Golden Teacher", crop: "mushrooms", page_code: "bbbbbbbbbbbbbbbb" }] });
  const res = await getStrainPage(env, "bbbbbbbbbbbbbbbb");
  assert.equal(res.status, 404);
  assert.ok(!(await res.text()).includes("Golden Teacher"));
});

test("a row from before the crop column still serves, because it was cannabis", async () => {
  const env = db({ catalog: [{ name_key: "blue dream", name: "Blue Dream", crop: null, page_code: "cccccccccccccccc" }] });
  assert.equal((await getStrainPage(env, "cccccccccccccccc")).status, 200);
});

test("a malformed code never reaches the database", async () => {
  let asked = false;
  const env = { DB: { prepare() { asked = true; return { bind: () => ({ first: async () => null }) }; } } };
  for (const bad of ["", "short", "../../etc/passwd", "a".repeat(64)]) {
    assert.equal((await getStrainPage(env, bad)).status, 404);
  }
  assert.equal(asked, false);
});
