// @ts-check
// Daily usage counters (per-user and per-model) + the GET /mj/usage handler.
import { json } from "../util.js";
import {
  GEMINI_DAILY_LIMIT, GEMINI_PRO_DAILY_LIMIT,
  PER_USER_DAILY_REQUESTS, ADMIN_DAILY_REQUESTS,
} from "../limits.js";
import { GEMINI_MODEL, GEMINI_PRO_MODEL } from "./constants.js";

export function todayInET() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
}

/**
 * Move this user's daily REQUEST count and return the new value.
 *
 * Counted in requests to Google rather than chat messages, because that is the
 * unit the quota is spent in: one message can be six requests.
 *
 * `delta` may be negative, which is how a turn reconciles itself. A slot is
 * reserved before the model is called so concurrent requests cannot all slip
 * past the cap at once; afterwards the reservation is corrected to whatever the
 * turn actually cost, including back down to nothing when it cost nothing.
 */
export async function bumpUserUsage(env, userId, today, delta = 1) {
  const n = Math.round(Number(delta) || 0);
  if (n === 0) return readMjUsageForUser(env, userId, today);
  const row = await env.DB.prepare(
    "INSERT INTO mj_usage (user_id, date, count) VALUES (?, ?, ?) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = MAX(0, count + ?) RETURNING count",
  ).bind(userId, today, Math.max(0, n), n).first();
  return Number(row?.count ?? 0);
}

/** A grower's daily request budget. The owner gets more, not everything. */
export function dailyRequestBudget(user) {
  return user?.role === "admin" ? ADMIN_DAILY_REQUESTS : PER_USER_DAILY_REQUESTS;
}

/**
 * Increment the global per-model counter by the number of API REQUESTS made.
 *
 * Not by one. The limit this defends is Google's requests-per-day, and one
 * chat message is a tool loop that can make eight of them. Counting messages
 * undercounted the real figure by up to eightfold, which meant the ceiling
 * meant to keep us inside the free tier could be passed without ever showing
 * as passed.
 */
export async function bumpModelUsage(env, model, today, requests = 1) {
  const n = Math.max(0, Math.round(Number(requests) || 0));
  if (n === 0) return;
  await env.DB.prepare(
    "INSERT INTO mj_model_usage (model, date, count) VALUES (?, ?, ?) " +
    "ON CONFLICT(model, date) DO UPDATE SET count = count + ?",
  ).bind(model, today, n, n).run();
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
  // Every count here is REQUESTS to Google, not messages sent.
  return json({
    date: today, unit: "requests",
    proCount, proLimit: GEMINI_PRO_DAILY_LIMIT,
    flashCount, flashLimit: GEMINI_DAILY_LIMIT,
    userCount, userLimit: dailyRequestBudget(user),
  });
}
