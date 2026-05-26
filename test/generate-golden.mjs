// One-shot: captures the CURRENT generator output as the golden fixture.
// Run once before refactoring growData.js. Not rerun afterward (the generator
// signature changes); kept for provenance.
import { writeFileSync } from "node:fs";
import { D, getPhase, getDetail } from "../src/lib/growData.js";

function ymd(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const out = [];
const cur = new Date(D.start);
while (cur <= D.hazeHarvest) {
  out.push({ date: ymd(cur), phase: getPhase(cur), detail: getDetail(cur) });
  cur.setDate(cur.getDate() + 1);
}

writeFileSync(
  new URL("./golden-plan.json", import.meta.url),
  JSON.stringify(out, null, 2) + "\n",
);
console.log(`wrote ${out.length} days to test/golden-plan.json`);
