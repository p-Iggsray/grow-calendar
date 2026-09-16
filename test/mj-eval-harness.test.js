import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, scorecard } from "../eval/judge.js";
import { CASES, estimateRequests } from "../eval/cases.js";
import { readVerdict, gradePrompt, factsBlock } from "../eval/grade.js";
import { evalDb, SURVEY, MITE_DATE } from "../eval/fixture.js";
import { executeTool } from "../worker/mj/tools.js";
import * as F from "../eval/fixture.js";

// The harness has to be trustworthy before its verdicts mean anything. A suite
// that reports green because its own checker is broken is worse than none, so
// the checker is tested here, for free, with no API key and no requests spent.

const attempt = (over = {}) => ({ reply: "fine", called: [], requests: 1, crashed: null, ...over });

test("a case that asked for a tool fails when it was not called", () => {
  const c = { expectTools: ["search_journal"] };
  assert.deepEqual(judge(c, attempt()), ["never called search_journal (called: nothing)"]);
  assert.deepEqual(judge(c, attempt({ called: ["search_journal"] })), []);
});

test("expectAny passes on any one of the listed tools", () => {
  const c = { expectTools: ["get_day", "get_grow_log"], expectAny: true };
  assert.deepEqual(judge(c, attempt({ called: ["get_grow_log"] })), []);
  assert.equal(judge(c, attempt({ called: ["get_week"] })).length, 1);
});

test("a forbidden tool is caught even when everything else passed", () => {
  const c = { expectTools: ["get_grow_info"], forbidTools: ["update_grow_info"] };
  const f = judge(c, attempt({ called: ["get_grow_info", "update_grow_info"] }));
  assert.deepEqual(f, ["called update_grow_info, which it must not"]);
});

test("text rules cut both ways", () => {
  assert.equal(judge({ mustMatch: [/2026-08-02/] }, attempt({ reply: "on 2026-08-02" })).length, 0);
  assert.equal(judge({ mustMatch: [/2026-08-02/] }, attempt({ reply: "some time in August" })).length, 1);
  assert.equal(judge({ mustNotMatch: [/—/] }, attempt({ reply: "clean text" })).length, 0);
  assert.equal(judge({ mustNotMatch: [/—/] }, attempt({ reply: "an em — dash" })).length, 1);
});

test("a long answer to a short question fails on length", () => {
  assert.equal(judge({ maxLength: 20 }, attempt({ reply: "x".repeat(21) })).length, 1);
  assert.equal(judge({ maxLength: 20 }, attempt({ reply: "short" })).length, 0);
});

test("going over the request budget is a failure, not a footnote", () => {
  // The whole point of recording this: an edit that makes her call two more
  // tools per answer should show up as a number.
  assert.deepEqual(judge({ maxRequests: 3 }, attempt({ requests: 5 })),
    ["took 5 requests, over its budget of 3"]);
  assert.deepEqual(judge({ maxRequests: 3 }, attempt({ requests: 3 })), []);
});

test("a crashed call fails loudly rather than passing quietly", () => {
  const f = judge({ mustNotMatch: [/never/] }, attempt({ reply: "", crashed: "429 quota" }));
  assert.equal(f.length, 1);
  assert.match(f[0], /the call failed: 429 quota/);
});

test("one attempt can fail for several reasons at once", () => {
  const f = judge(
    { expectTools: ["get_photos"], forbidTools: ["get_week"], mustMatch: [/trichome/], maxRequests: 2 },
    attempt({ called: ["get_week"], reply: "no", requests: 9 }),
  );
  assert.equal(f.length, 4);
});

test("the scorecard counts rules and quality separately", () => {
  const card = scorecard([
    { failures: [], requests: 2, grade: { verdict: "pass" } },
    { failures: ["nope"], requests: 3, grade: { verdict: "fail" } },
    { failures: [], requests: 1, grade: { verdict: "unknown" } },
  ]);
  assert.equal(card.total, 3);
  assert.equal(card.rulesPassed, 2);
  assert.equal(card.graded, 3);
  assert.equal(card.gradePassed, 1);
  assert.equal(card.requests, 6 + 3);
  assert.equal(card.ok, false);
});

test("a clean sweep reports ok", () => {
  assert.equal(scorecard([{ failures: [], requests: 1 }, { failures: [], requests: 1 }]).ok, true);
});

test("an unparseable grader answer is unknown, never a silent pass", () => {
  assert.equal(readVerdict(null).verdict, "unknown");
  assert.equal(readVerdict({}).verdict, "unknown");
  assert.equal(readVerdict({ verdict: "maybe" }).verdict, "unknown");
  assert.equal(readVerdict({ verdict: "PASS", reason: "good" }).verdict, "pass");
  assert.equal(readVerdict({ verdict: "fail", reason: "made it up" }).reason, "made it up");
});

test("the grader is given the facts needed to catch an invented one", () => {
  const facts = factsBlock(F);
  assert.match(facts, new RegExp(MITE_DATE));
  assert.match(facts, /LITRES/);
  assert.match(facts, /no planned or predicted dates/);
  const p = gradePrompt({ ask: "when?", reply: "August", rubric: "names the date?", facts });
  assert.match(p, /QUESTION THE GROWER ASKED/);
  assert.match(p, /RUBRIC/);
});

test("every case is well formed and affordable", () => {
  const ids = CASES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate case ids");
  for (const c of CASES) {
    assert.ok(c.ask && c.ask.length > 5, `${c.id} has no question`);
    assert.ok(c.maxRequests >= 1, `${c.id} has no request budget`);
    assert.ok(
      (c.expectTools?.length || c.forbidTools?.length || c.mustMatch?.length || c.mustNotMatch?.length || c.maxLength),
      `${c.id} asserts nothing except through the grader`,
    );
  }
  // A suite you cannot afford to run is not a suite.
  assert.ok(estimateRequests(CASES, { grade: true }).total < 80,
    "a full graded run should stay well under a third of the daily allowance");
});

test("the fixture answers the queries the read tools actually make", async () => {
  const env = evalDb();
  const out = await executeTool("search_journal", { query: "mites" }, env, 1, F.TIMELINE, [], F.GROW_ID, F.RAW_GROW, []);
  assert.ok(out.days_found >= 1, "the fixture must contain the mite day the case looks for");
  assert.ok(out.days.some((d) => d.date === MITE_DATE));

  const photos = await executeTool("get_photos", {}, env, 1, F.TIMELINE, [], F.GROW_ID, F.RAW_GROW, []);
  assert.equal(photos.total, 2);
  assert.equal(photos.photos[0].date, "2026-08-30", "oldest first");

  const info = await executeTool("get_grow_info", {}, env, 1, F.TIMELINE, [], F.GROW_ID, F.RAW_GROW, []);
  assert.equal(info.crop, "cannabis");
  assert.deepEqual(info.strains, ["Blue Dream", "Gelato"]);
  assert.equal(SURVEY.environment, "indoor");
});

test("a case expecting no write can actually observe one", async () => {
  // The confirm-before-writing cases are only meaningful if a write would be
  // visible. Prove the fixture records them.
  const env = evalDb();
  await executeTool("update_grow_info", { display_name: "Back Tent" }, env, 1, F.TIMELINE, [], F.GROW_ID, F.RAW_GROW, []);
  assert.ok(env.writes.some((w) => /UPDATE grows/i.test(w.sql)), "the fixture must record writes");
});
