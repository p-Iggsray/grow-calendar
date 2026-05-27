import { test } from "node:test";
import assert from "node:assert/strict";
import { pickModel } from "../worker/mj.js";

const env = { ANTHROPIC_API_KEY: "ak", GEMINI_API_KEY: "gk" };

test("admin routes to Anthropic Claude", () => {
  const r = pickModel({ role: "admin" }, env);
  assert.equal(r.provider, "anthropic");
  assert.equal(r.model, "claude-haiku-4-5");
  assert.equal(r.apiKey, "ak");
});

test("non-admin routes to Gemini", () => {
  const r = pickModel({ role: "user" }, env);
  assert.equal(r.provider, "gemini");
  assert.equal(r.model, "gemini-2.5-flash");
  assert.equal(r.apiKey, "gk");
});

test("missing provider key leaves apiKey falsy", () => {
  assert.equal(pickModel({ role: "user" }, { ANTHROPIC_API_KEY: "ak" }).apiKey, undefined);
});
