import { test } from "node:test";
import assert from "node:assert/strict";
import { MJ_TOOLS } from "../worker/mj-logic.js";

test("tool registry has no duplicate names", () => {
  const names = MJ_TOOLS.map(t => t.name);
  assert.equal(new Set(names).size, names.length);
});

test("the full power toolset is registered", () => {
  const names = new Set(MJ_TOOLS.map(t => t.name));
  const expected = [
    // read
    "get_grow_info", "get_day", "get_week", "get_grow_log", "get_environment", "get_plant_log",
    // write
    "set_tasks_done", "append_note", "replace_note", "log_grow_data",
    "update_grow_info", "update_grow_dates", "update_phase_tasks", "update_grow_profile",
    "create_event_rule", "delete_event_rule",
    "add_plant", "update_plant", "delete_plant", "add_plant_log_entry",
    "lifecycle_action", "add_task", "remove_task",
  ];
  for (const n of expected) assert.ok(names.has(n), `missing tool: ${n}`);
});

test("new tools declare the right required params", () => {
  const byName = Object.fromEntries(MJ_TOOLS.map(t => [t.name, t]));
  assert.deepEqual(byName.get_environment.parameters.required, []);
  assert.deepEqual(byName.get_plant_log.parameters.required, ["plant_id"]);
  assert.deepEqual(byName.add_plant_log_entry.parameters.required, ["plant_id"]);
  assert.deepEqual(byName.lifecycle_action.parameters.required, ["action"]);
  assert.deepEqual(byName.add_task.parameters.required, ["date", "task"]);
  assert.deepEqual(byName.remove_task.parameters.required, ["date", "task_index"]);
  assert.ok(byName.update_plant.parameters.properties.stage, "update_plant should accept stage");
  assert.ok(byName.update_plant.parameters.properties.pot_size, "update_plant should accept pot_size");
  assert.deepEqual(byName.lifecycle_action.parameters.properties.action.enum,
    ["start_drying", "move_to_curing", "finish_grow", "log_burp", "log_dry_reading"]);
});

// Gemini's function-declaration schema rejects several JSON Schema keywords.
// Guard every tool, recursively, so a new tool can never brick the whole
// toolset with a 400 from the API.
const BANNED_KEYS = ["additionalProperties", "oneOf", "anyOf", "allOf", "$ref", "patternProperties", "const"];
const ALLOWED_TYPES = new Set(["object", "string", "integer", "number", "boolean", "array"]);

function walkSchema(node, path, problems) {
  if (!node || typeof node !== "object") return;
  for (const key of BANNED_KEYS) {
    if (key in node) problems.push(`${path} uses banned key ${key}`);
  }
  if (node.type && !ALLOWED_TYPES.has(node.type)) problems.push(`${path} has invalid type ${node.type}`);
  if (node.properties) {
    for (const [k, v] of Object.entries(node.properties)) walkSchema(v, `${path}.${k}`, problems);
  }
  if (node.items) walkSchema(node.items, `${path}[]`, problems);
}

test("every tool schema is Gemini-safe", () => {
  const problems = [];
  for (const tool of MJ_TOOLS) {
    walkSchema(tool.parameters, tool.name, problems);
  }
  assert.deepEqual(problems, []);
});
