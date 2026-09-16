import { test } from "node:test";
import assert from "node:assert/strict";
import { MJ_PERSONA, MJ_TOOLS, MJ_WRITE_TOOLS, cropBrief } from "../worker/mj-logic.js";
import { CROPS } from "../src/lib/crops.js";

// Free checks on the thing MJ is made of. They cost nothing and catch the
// class of mistake that is invisible until she is live: a tool renamed in one
// place and not the other, a tool she was never told she has, a schema the API
// will reject, a dash in the text of an assistant forbidden from using them.

const names = MJ_TOOLS.map((t) => t.name);

test("every tool has a name, a description worth reading, and a schema", () => {
  for (const t of MJ_TOOLS) {
    assert.match(t.name, /^[a-z][a-z0-9_]*$/, `bad tool name: ${t.name}`);
    assert.ok(typeof t.description === "string" && t.description.length > 40,
      `${t.name} needs a description the model can act on`);
    assert.equal(t.parameters?.type, "object", `${t.name} parameters must be an object schema`);
    assert.ok(t.parameters.properties && typeof t.parameters.properties === "object",
      `${t.name} needs a properties object, even an empty one`);
  }
});

test("no tool name is declared twice", () => {
  assert.equal(new Set(names).size, names.length, `duplicate tool names in ${names.join(", ")}`);
});

test("every required parameter is a parameter that exists", () => {
  for (const t of MJ_TOOLS) {
    for (const req of t.parameters.required ?? []) {
      assert.ok(req in t.parameters.properties,
        `${t.name} requires "${req}", which is not in its properties`);
    }
  }
});

test("every parameter is described, so the model knows what to put in it", () => {
  for (const t of MJ_TOOLS) {
    for (const [key, spec] of Object.entries(t.parameters.properties)) {
      assert.ok(spec?.type, `${t.name}.${key} has no type`);
      assert.ok(typeof spec.description === "string" && spec.description.length > 5,
        `${t.name}.${key} has no usable description`);
    }
  }
});

test("MJ is told about every tool she has", () => {
  // A tool she is never told about in the persona is one she will rarely reach
  // for, however good its description.
  for (const name of names) {
    assert.ok(MJ_PERSONA.includes(name), `the persona never mentions ${name}`);
  }
});

test("the persona never names a tool that does not exist", () => {
  // Catches a rename that updated MJ_TOOLS and left the prose behind, which
  // would have her promise the grower something she cannot do.
  const mentioned = [...MJ_PERSONA.matchAll(/\*\*([a-z][a-z0-9_]*)\*\*/g)].map((m) => m[1]);
  const toolish = mentioned.filter((w) => /_/.test(w));
  for (const w of toolish) {
    assert.ok(names.includes(w), `the persona promises a tool called ${w}, which does not exist`);
  }
});

test("the persona and every tool description are free of em and en dashes", () => {
  // MJ is told never to use them. Text that contains them teaches the opposite.
  assert.doesNotMatch(MJ_PERSONA, /[–—]/, "em or en dash in the persona");
  for (const t of MJ_TOOLS) {
    assert.doesNotMatch(t.description, /[–—]/, `em or en dash in ${t.name}`);
    for (const [key, spec] of Object.entries(t.parameters.properties)) {
      assert.doesNotMatch(String(spec.description ?? ""), /[–—]/, `em or en dash in ${t.name}.${key}`);
    }
  }
});

test("the persona still states the rules the eval suite checks her against", () => {
  // If one of these is edited away, the live eval asserting it becomes a test
  // of nothing. Keeping them here means the ruler and the rule move together.
  assert.match(MJ_PERSONA, /no planned or estimated dates/i);
  assert.match(MJ_PERSONA, /day \*\*0\*\*|day 0/i);
  assert.match(MJ_PERSONA, /never use em dashes/i);
  assert.match(MJ_PERSONA, /confirm/i);
});

test("every crop has a brief, and they do not share vocabulary they should not", () => {
  for (const crop of CROPS) {
    const brief = cropBrief({ crop });
    assert.ok(typeof brief === "string" && brief.length > 200, `${crop} has no usable crop brief`);
  }
  const cannabis = cropBrief({ crop: "cannabis" });
  const mushrooms = cropBrief({ crop: "mushrooms" });

  // Each brief has to carry its own subject.
  assert.match(cannabis, /trichome/i);
  assert.match(mushrooms, /contamination|contam/i);
  assert.match(mushrooms, /flush/i);

  // The monotub brief may only mention the tent's words in order to forbid
  // them. It says so in one sentence; anywhere else would be teaching MJ to
  // use them. (An earlier version of this test just banned the word, which
  // failed on the very sentence doing the forbidding.)
  const trichomeLines = mushrooms.split("\n").filter((l) => /trichome/i.test(l));
  for (const line of trichomeLines) {
    assert.match(line, /never say/i,
      `the monotub brief mentions trichomes outside a prohibition: ${line.trim()}`);
  }
});

test("the write list covers every tool whose name announces a change", () => {
  for (const n of names.filter((x) => /^(add|update|delete|log|append|replace|lifecycle)/.test(x))) {
    assert.ok(MJ_WRITE_TOOLS.has(n), `${n} looks like a write and is not declared one`);
  }
});
