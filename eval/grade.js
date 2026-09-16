// The part rules cannot reach.
//
// Tool choice and forbidden phrases are facts. "Is the answer any good" is
// not, so it is put to a model with the grow's own data in front of it and a
// rubric written for that one case. The grader is itself unverified judgement,
// which is why its verdict is reported beside the hard checks rather than
// folded into them: a case can pass every rule and still read badly, and you
// want to see both numbers.

export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"] },
    reason: { type: "string" },
  },
  required: ["verdict", "reason"],
};

export const GRADER_INSTRUCTION = `You are grading one reply from a grow assistant against one specific question.

You are given the grower's question, the assistant's reply, the facts of the grow, and a rubric. Answer only against the rubric. Do not mark a reply down for style, length or warmth unless the rubric asks about it.

Be strict about invention: a reply that states a fact the grow data does not support is a fail, however well written. A reply that honestly says it cannot tell is not a fail unless the rubric says it should have been able to tell.

Answer with a verdict of "pass" or "fail" and one sentence of reason.`;

/** The text put in front of the grader for one case. */
export function gradePrompt({ ask, reply, rubric, facts }) {
  return [
    `QUESTION THE GROWER ASKED:\n${ask}`,
    `THE ASSISTANT'S REPLY:\n${reply}`,
    `FACTS OF THIS GROW:\n${facts}`,
    `RUBRIC:\n${rubric}`,
  ].join("\n\n");
}

/** The fixed facts a grader needs to catch an invented one. */
export function factsBlock(f) {
  return [
    `Today is ${f.TODAY}. Day 0 of this grow is ${f.FIRST_DATE}, so today is day 106.`,
    `It is a 4x4 indoor tent of cannabis in coco, 12/12, in Athens, OH.`,
    `Two plants: Blue Dream and Gelato, both flowering since 2026-07-25.`,
    `Spider mites were found once, on ${f.MITE_DATE}, treated, and clear by 2026-08-04.`,
    `Watering is logged in LITRES: 5 L per plant on 2026-09-14 and on 2026-09-10.`,
    `Two photographs exist, 2026-08-30 and 2026-09-13, both of Blue Dream.`,
    `On 2026-09-12 a plant entry recorded trichomes mostly cloudy with a few amber.`,
    `There are no planned or predicted dates anywhere in this app.`,
  ].join("\n");
}

/** Turn a grader answer into a verdict, treating anything unparseable as unknown. */
export function readVerdict(out) {
  if (!out || typeof out !== "object") return { verdict: "unknown", reason: "grader returned nothing usable" };
  const v = String(out.verdict ?? "").toLowerCase();
  if (v !== "pass" && v !== "fail") return { verdict: "unknown", reason: String(out.reason ?? "grader gave no verdict") };
  return { verdict: v, reason: String(out.reason ?? "") };
}
