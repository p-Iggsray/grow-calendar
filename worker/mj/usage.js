// @ts-check
// Daily usage counters (per-user and per-model) + the GET /mj/usage handler.
import { json } from "../util.js";
import { GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT, PER_USER_DAILY_CAP } from "../limits.js";
import { GEMINI_MODEL, GEMINI_PRO_MODEL } from "./constants.js";

export function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

// Increment the per-user daily counter and return the new value, so a cap can
// be enforced atomically (reserve-before-call) rather than racily.
export async function bumpUserUsage(env, userId, today) {
  const row = await env.DB.prepare(
    "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1 RETURNING count",
  ).bind(userId, today).first();
  return Number(row?.count ?? 1);
}

// Increment the global per-model counter (shared across all users).
export async function bumpModelUsage(env, model, today) {
  await env.DB.prepare(
    "INSERT INTO mj_model_usage (model, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(model, date) DO UPDATE SET count = count + 1",
  ).bind(model, today).run();
}

export async function readMjModelUsage(env, today, model) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM mj_model_usage WHERE model = ? AND date = ?",
  ).bind(model, today).first();
  return Number(row?.count ?? 0);
}

export async function readMjUsageForUser(env, userId, today) {
  const row = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM mj_usage WHERE user_id = ? AND date = ?",
  ).bind(userId, today).first();
  return Number(row?.count ?? 0);
}

export async function getMjUsage(env, user) {
  const today = todayInET();
  const [proCount, flashCount, userCount] = await Promise.all([
    readMjModelUsage(env, today, GEMINI_PRO_MODEL),
    readMjModelUsage(env, today, GEMINI_MODEL),
    readMjUsageForUser(env, user.id, today),
  ]);
  const userLimit = user.role === "admin" ? null : PER_USER_DAILY_CAP;
  return json({ date: today, proCount, proLimit: GEMINI_PRO_DAILY_LIMIT, flashCount, flashLimit: GEMINI_DAILY_LIMIT, userCount, userLimit });
}
