import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeSearch, openingMonth, SHARE_TABS, DEFAULT_TAB } from "../src/lib/shareRoute.js";
import { STAGE_GLYPH } from "../src/lib/stageTimeline.js";
import { CROP_STAGES } from "../src/lib/crops.js";

test("a bare share link opens the first space on the calendar", () => {
  assert.deepEqual(parseRoute(""), { spaceId: null, tab: "calendar", date: null });
});

test("a link to one day of one space survives the round trip", () => {
  const route = { spaceId: "g7x", tab: "journal", date: "2026-06-14" };
  assert.deepEqual(parseRoute(routeSearch(route)), route);
});

test("the default tab is left out, so the first link somebody gets is the short one", () => {
  assert.equal(routeSearch({ spaceId: "g7x", tab: DEFAULT_TAB, date: null }), "?g=g7x");
});

test("a hand-edited URL lands somewhere rather than breaking", () => {
  const r = parseRoute("?g=../../secret&t=admin&d=yesterday");
  assert.deepEqual(r, { spaceId: null, tab: DEFAULT_TAB, date: null });
});

test("a half-typed date is ignored rather than opening a broken day", () => {
  assert.equal(parseRoute("?d=2026-6-1").date, null);
  assert.equal(parseRoute("?d=2026-06-01").date, "2026-06-01");
});

test("nothing a route encodes can smuggle characters into the URL", () => {
  const search = routeSearch({ spaceId: "a b&c=d", tab: "photos", date: "2026-06-01" });
  assert.equal(search, "?t=photos&d=2026-06-01");
});

test("every tab the view renders is a tab the URL can name", () => {
  assert.deepEqual(SHARE_TABS, ["calendar", "journal", "photos"]);
  for (const tab of SHARE_TABS) assert.equal(parseRoute(`?t=${tab}`).tab, tab);
});

test("every stage of both crops has a calendar glyph", () => {
  // Colour alone cannot carry the stage (WCAG 1.4.1), so a stage with no
  // glyph is a day nobody colour-blind can read.
  const missing = [...CROP_STAGES.cannabis, ...CROP_STAGES.mushrooms]
    .filter((s) => !STAGE_GLYPH[s]);
  assert.deepEqual(missing, []);
});

test("no two stages of one crop share a glyph", () => {
  for (const [crop, stages] of Object.entries(CROP_STAGES)) {
    const glyphs = stages.map((s) => STAGE_GLYPH[s]);
    assert.equal(new Set(glyphs).size, glyphs.length, `${crop} reuses a glyph: ${glyphs.join("")}`);
  }
});

// The bug the browser found: the calendar opened on today's month, so a link
// to a grow that finished in June showed a September grid with nothing on it
// and no clue which way to walk.
const SEPT = new Date(2026, 8, 17);

test("an open day decides the month, whatever else is true", () => {
  assert.deepEqual(
    openingMonth({ date: "2026-03-04", lastDate: "2026-06-20", today: SEPT }),
    { year: 2026, month: 2 },
  );
});

test("with no day open, the calendar lands where the grow was last written", () => {
  assert.deepEqual(
    openingMonth({ date: null, lastDate: "2026-06-20", today: SEPT }),
    { year: 2026, month: 5 },
  );
});

test("a space still being written in this month opens on this month", () => {
  assert.deepEqual(
    openingMonth({ date: null, lastDate: "2026-09-02", today: SEPT }),
    { year: 2026, month: 8 },
  );
});

test("a space with nothing in it opens on today", () => {
  assert.deepEqual(openingMonth({ date: null, lastDate: null, today: SEPT }), { year: 2026, month: 8 });
});

test("a future-dated entry never opens the calendar ahead of today", () => {
  // A clock skew or a hand-edited date should not scroll a reader into a month
  // that has not happened.
  assert.deepEqual(
    openingMonth({ date: null, lastDate: "2027-01-05", today: SEPT }),
    { year: 2026, month: 8 },
  );
});

test("a grow from a previous year opens on its own month, not this one", () => {
  assert.deepEqual(
    openingMonth({ date: null, lastDate: "2025-11-30", today: SEPT }),
    { year: 2025, month: 10 },
  );
});
