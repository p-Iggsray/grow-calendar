// The golden set.
//
// Each case is one thing MJ is supposed to do, stated so that a failure is a
// fact rather than a matter of taste. Three kinds of claim:
//
//   tools      which tools she reached for. The most objective signal there
//              is, and the one that catches a persona edit quietly changing
//              how she works.
//   text       a rule the persona states outright, so breaking it is
//              unambiguous.
//   grade      a rubric for the grader, for the part rules cannot reach.
//
// `maxRequests` is the budget claim: an edit that makes her call two more
// tools per answer shows up here as a number rather than as a surprise at the
// end of the month.
//
// Keep this set small enough to afford. A suite you cannot run is not a suite.

import { MITE_DATE } from "./fixture.js";

export const CASES = [
  {
    id: "search-not-walk",
    ask: "When did I last see spider mites?",
    // The whole reason search_journal exists: she used to read days one at a
    // time, and each of those days was a request.
    expectTools: ["search_journal"],
    forbidTools: ["get_week"],
    mustMatch: [new RegExp(MITE_DATE.replace(/-/g, "."))],
    maxRequests: 3,
    grade: "Does the answer name the date the mites were found and say what was done about them?",
  },
  {
    id: "photos-for-change",
    ask: "How has Blue Dream changed over the last few weeks?",
    // A question about change is a photo question, and she has the photos.
    expectTools: ["get_photos"],
    maxRequests: 4,
    grade: "Does the answer compare specific dates rather than speaking in generalities?",
  },
  {
    id: "trichomes-escalate",
    ask: "Are the trichomes ready on Blue Dream? Check the latest photo properly.",
    // A thumbnail cannot answer this and she is told so. She must fetch one at
    // full resolution before committing.
    expectTools: ["get_photo"],
    maxRequests: 5,
    grade: "Does the answer either judge trichomes from the full-resolution photograph, or say plainly that it cannot see them well enough? Hedging without doing either is a fail.",
  },
  {
    id: "no-predicted-date",
    ask: "What day am I going to harvest?",
    // The app predicts nothing. She may estimate from experience, but must
    // never state it as if the calendar knows.
    mustNotMatch: [/your calendar says|the app says .* harvest|scheduled (for|harvest)/i],
    maxRequests: 3,
    grade: "Does the answer make clear that any harvest date is its own estimate from grow knowledge, and not a date the app holds? Saying the app has no planned dates is a pass.",
  },
  {
    id: "day-zero",
    ask: "What day of the grow am I on?",
    expectTools: [],
    // Day 0 is 2026-06-01 and today is 2026-09-15, so day 106.
    mustMatch: [/10[56]/],
    maxRequests: 2,
    grade: "Does it give a grow day number close to 106?",
  },
  {
    id: "water-per-plant",
    ask: "How much did I water yesterday?",
    // Stored in gallons, logged in litres. She is told never to convert the
    // grower's own measure, and to read it back plant by plant.
    expectTools: ["get_day", "get_grow_log"], expectAny: true,
    mustMatch: [/\bL\b|litre|liter/i],
    mustNotMatch: [/\bgal\b/i],
    maxRequests: 3,
    grade: "Does it say what each plant got, in litres, rather than only a combined total in gallons?",
  },
  {
    id: "confirm-before-write",
    ask: "Rename this space to Back Tent.",
    // The confirmation protocol: look first, ask, and do not write until told.
    expectTools: ["get_grow_info"],
    forbidTools: ["update_grow_info"],
    maxRequests: 3,
    grade: "Does it show the current name and the new one and ask for confirmation, rather than reporting the rename as done?",
  },
  {
    id: "confirm-before-lifecycle",
    ask: "Start drying.",
    forbidTools: ["lifecycle_action"],
    maxRequests: 3,
    grade: "Does it explain what starting the dry changes and ask before doing it?",
  },
  {
    id: "no-em-dashes",
    ask: "Give me a full rundown of how this grow is going.",
    // The one formatting rule she is told twice.
    mustNotMatch: [/[–—]/],
    maxRequests: 5,
    grade: "Is this a useful summary grounded in the grow's actual recorded data rather than generic advice?",
  },
  {
    id: "no-markdown-headers",
    ask: "Summarise the last two weeks for me.",
    mustNotMatch: [/^#{1,6}\s/m],
    maxRequests: 5,
    grade: "Is it readable as a chat message rather than as a document?",
  },
  {
    id: "brief-answer-stays-brief",
    ask: "What stage am I in?",
    // Match length to the question. A one-line question gets a one-line answer.
    maxLength: 320,
    maxRequests: 2,
    grade: "Is this a direct short answer rather than an essay?",
  },
  {
    id: "cannabis-vocabulary",
    ask: "What should I be watching for this week?",
    // This space grows cannabis. Monotub words would mean the crop brief is
    // not reaching her.
    mustNotMatch: [/\bmonotub\b|\bfresh air exchange\b|\bcontam\b|\bspawn\b/i],
    maxRequests: 4,
    grade: "Is the advice specific to a flowering cannabis plant in a tent, and does it use the grow's own recorded numbers where relevant?",
  },
];

/** What a full run will spend, before it spends it. */
export function estimateRequests(cases, { grade } = {}) {
  const calls = cases.reduce((n, c) => n + (c.maxRequests ?? 3), 0);
  return { calls, graderCalls: grade ? cases.length : 0, total: calls + (grade ? cases.length : 0) };
}
