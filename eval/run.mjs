// Run the golden set against the real model and print a scorecard.
//
//   npm run eval                 the hard checks only
//   npm run eval -- --grade      also ask a model whether each answer is good
//   npm run eval -- --case id    one case, by id
//   npm run eval -- --model m    a different model
//
// This spends real requests out of a real daily quota, which is why it is not
// part of `npm test` and why it prints what it will cost before it starts.
//
// What it exercises is the actual thing: the real persona, the real tool
// declarations, the real tool executor. Only the database is a stand-in, and
// deliberately so, because a suite that changed its answers whenever the
// grower logged something would be measuring the wrong thing.

import { readFileSync } from "node:fs";
import { runGemini, askGeminiForJson } from "../worker/providers/gemini.js";
import { MJ_TOOLS, buildSystemSegments } from "../worker/mj-logic.js";
import { executeTool } from "../worker/mj/tools.js";
import { GEMINI_MODEL, MAX_TOOL_ITERATIONS } from "../worker/mj/constants.js";
import { CASES, estimateRequests } from "./cases.js";
import { GRADE_SCHEMA, GRADER_INSTRUCTION, gradePrompt, factsBlock, readVerdict } from "./grade.js";
import { judge, scorecard } from "./judge.js";
import * as F from "./fixture.js";

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const WANT_GRADE = flag("grade");
const MODEL = value("model", GEMINI_MODEL);
const ONLY = value("case", null);

function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  try {
    const m = /^GEMINI_API_KEY\s*=\s*(.+)$/m.exec(readFileSync(".dev.vars", "utf8"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch { /* no .dev.vars, which is normal */ }
  return null;
}

const KEY = apiKey();
if (!KEY) {
  console.error("No GEMINI_API_KEY. Put it in .dev.vars or the environment.");
  console.error("This suite calls the real model: there is nothing to run without one.");
  process.exit(2);
}

const cases = ONLY ? CASES.filter((c) => c.id === ONLY) : CASES;
if (cases.length === 0) {
  console.error(`No case with id "${ONLY}". Known: ${CASES.map((c) => c.id).join(", ")}`);
  process.exit(2);
}

// What MJ is actually given. The volatile half is the fixture's, so every run
// asks about the same grow.
const systemSegments = buildSystemSegments({
  survey: F.SURVEY,
  volatile: [
    `STAGE TIMELINE: seedling ${F.FIRST_DATE}, vegetative 2026-06-20, flowering 2026-07-25.`,
    `Active grow profile - Location: Athens, OH · Plants: Blue Dream, Gelato.`,
    `PLANTS IN THIS SPACE: Blue Dream [flowering], Gelato [flowering].`,
    `Today's date is ${F.TODAY}.`,
  ],
});

/** One case, start to finish. */
async function runCase(c) {
  const env = F.evalDb();
  const called = [];
  const usage = { requests: 0 };
  const shown = [];

  const executeToolUse = (name, input, sink) => {
    called.push(name);
    return executeTool(name, input, env, 1, F.TIMELINE, [], F.GROW_ID, F.RAW_GROW, sink ?? shown);
  };

  let reply = "";
  let crashed = null;
  try {
    ({ reply } = await runGemini({
      apiKey: KEY, model: MODEL, systemSegments, tools: MJ_TOOLS,
      messages: [{ role: "user", content: c.ask }],
      executeToolUse, maxIterations: MAX_TOOL_ITERATIONS, usage,
    }));
  } catch (e) {
    crashed = String(e?.detail || e?.message || e);
  }

  const failures = judge(c, { reply, called, requests: usage.requests, crashed });

  let grade = null;
  if (WANT_GRADE && c.grade && !crashed) {
    const out = await askGeminiForJson({
      apiKey: KEY, model: MODEL, instruction: GRADER_INSTRUCTION,
      text: gradePrompt({ ask: c.ask, reply, rubric: c.grade, facts: factsBlock(F) }),
      schema: GRADE_SCHEMA,
    }).catch((e) => ({ verdict: "unknown", reason: String(e?.message ?? e) }));
    grade = readVerdict(out);
  }

  return { id: c.id, ask: c.ask, reply, called, requests: usage.requests, failures, grade };
}

const ceiling = estimateRequests(cases, { grade: WANT_GRADE });
console.log(`\nMJ eval: ${cases.length} case${cases.length === 1 ? "" : "s"} against ${MODEL}`);
console.log(`Grading: ${WANT_GRADE ? "on" : "off (pass --grade to judge answer quality too)"}`);
console.log(`At most ${ceiling.total} requests, usually far fewer. Your daily allowance is 250.\n`);

const results = [];
for (const c of cases) {
  process.stdout.write(`  ${c.id} ... `);
  const r = await runCase(c);
  results.push(r);
  const hard = r.failures.length === 0;
  const g = r.grade ? ` grade:${r.grade.verdict}` : "";
  console.log(`${hard ? "pass" : "FAIL"}${g}  (${r.requests} req, tools: ${r.called.join(" ") || "none"})`);
  for (const f of r.failures) console.log(`      ${f}`);
  if (r.grade && r.grade.verdict !== "pass") console.log(`      grader: ${r.grade.reason}`);
}

const card = scorecard(results);
console.log(`\n  rules   ${card.rulesPassed}/${card.total}`);
if (card.graded) console.log(`  quality ${card.gradePassed}/${card.graded}`);
console.log(`  spent   ${card.requests} requests\n`);

if (flag("verbose")) {
  for (const r of results) console.log(`\n--- ${r.id}\nQ: ${r.ask}\nA: ${r.reply}\n`);
}

process.exit(card.ok ? 0 : 1);
