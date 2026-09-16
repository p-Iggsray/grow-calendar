import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../worker/mj/tools.js";

// The point of this tool is that MJ stops reading days one at a time to answer
// "when did I last see X". Each of those was a whole request against a budget
// of 250 a day.

const SURVEY = { crop: "cannabis", strains: [{ id: "p1", name: "Blue Dream" }] };
const TIMELINE = { events: [], firstDate: "2026-06-01" };

function searchDb({ notes = [], entries = [], feeds = [], grow = true }) {
  return {
    DB: {
      prepare(sql) {
        return {
          bind() { return this; },
          async first() {
            return /FROM grows/.test(sql) ? (grow ? { id: "g1", survey: JSON.stringify(SURVEY) } : null) : null;
          },
          async all() {
            if (/FROM day_notes/.test(sql)) return { results: notes };
            if (/FROM plant_log/.test(sql)) return { results: entries };
            if (/FROM grow_log/.test(sql)) return { results: feeds };
            return { results: [] };
          },
          async run() { return {}; },
        };
      },
    },
  };
}

const search = (input, env) =>
  executeTool("search_journal", input, env, 1, TIMELINE, [], "g1", { survey: SURVEY }, []);

test("it finds the days and points at get_day for the rest", async () => {
  const out = await search({ query: "mites" }, searchDb({
    notes: [{ date: "2026-08-02", body: "Found spider mites under the fan leaves." }],
    entries: [{ date: "2026-07-20", plant_id: "p1", kind: "health", body: "Possible mites, watching it." }],
  }));
  assert.equal(out.query, "mites");
  assert.equal(out.days_found, 2);
  assert.deepEqual(out.days.map((d) => d.date), ["2026-08-02", "2026-07-20"]);
  assert.match(out.note, /get_day/);
});

test("matches across notes, plant entries and feed alike", async () => {
  const out = await search({ query: "calmag" }, searchDb({
    notes: [{ date: "2026-08-02", body: "Added CalMag." }],
    feeds: [{ date: "2026-08-03", feed: "CalMag + base" }],
  }));
  assert.deepEqual(out.days.map((d) => d.date), ["2026-08-03", "2026-08-02"]);
  const sources = out.days.flatMap((d) => d.snippets.map((s) => s.source));
  assert.ok(sources.includes("note") && sources.includes("feed"));
});

test("a plant entry says which plant it was about", async () => {
  const out = await search({ query: "topped" }, searchDb({
    entries: [{ date: "2026-07-01", plant_id: "p1", kind: "training", body: "Topped her today." }],
  }));
  assert.equal(out.days[0].snippets[0].plant, "Blue Dream");
});

test("finding nothing says so plainly", async () => {
  const out = await search({ query: "zzzz" }, searchDb({}));
  assert.equal(out.days_found, 0);
  assert.match(out.note, /Nothing in this grow/);
});

test("a one-character query is refused with a reason", async () => {
  const out = await search({ query: "a" }, searchDb({}));
  assert.match(out.error, /at least 2 characters/);
});

test("a missing query is refused rather than searching for nothing", async () => {
  const out = await search({}, searchDb({}));
  assert.ok(out.error);
});

test("the limit is honoured and clamped", async () => {
  const many = Array.from({ length: 30 }, (_, i) => ({
    date: `2026-08-${String(i + 1).padStart(2, "0")}`, body: "mites again",
  }));
  const three = await search({ query: "mites", limit: 3 }, searchDb({ notes: many }));
  assert.equal(three.days_found, 3);
  // Newest first, so a capped search returns the most recent occurrences.
  assert.equal(three.days[0].date, "2026-08-30");
  const silly = await search({ query: "mites", limit: 9999 }, searchDb({ notes: many }));
  assert.ok(silly.days_found <= 40);
});

test("it refuses when there is no active grow", async () => {
  const out = await executeTool("search_journal", { query: "mites" }, searchDb({}), 1, TIMELINE, [], null, null, []);
  assert.match(out.error, /No active grow/);
});
