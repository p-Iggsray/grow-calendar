// @ts-check
// Reading a day's writing into that day's log.
//
// You write about the day in your own words and the record fills itself in.
// The model's job is narrow on purpose: pull out only what the sentence
// actually says, and say nothing about the rest. Everything it hands back goes
// through readingToLogPatch, which is where the deciding happens - what is
// believable, what matches a real plant, what a number has to be inside to be
// worth recording.
//
// Two things keep this honest enough to do without asking first. Every field it
// writes is remembered in read_from, so the page can show which numbers came
// out of prose. And a value you typed yourself is never overwritten: only a
// field that is empty, or that an earlier reading filled, is open to it.

import { json, error } from "./util.js";
import { htmlToPlainText } from "../src/lib/richText.js";
import { readingToLogPatch, mergeReading } from "../src/lib/entryReading.js";
import { cropOf } from "../src/lib/crops.js";
import { ownedGrowRow, parseSurvey } from "./plants.js";
import { readNote } from "./notes.js";
import { ensureGrowLogSchema, rowToEntry } from "./growLog.js";
import { askGeminiForJson } from "./providers/gemini.js";
import { ProviderError } from "./providers/errors.js";
import { GEMINI_MODEL } from "./mj/constants.js";
import { bumpModelUsage, readMjModelUsage, todayInET } from "./mj/usage.js";
import { GEMINI_DAILY_LIMIT, READ_ENTRY_DAILY_CAP } from "./limits.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Long enough for a real day's writing, short enough that one entry can never
// become an expensive request.
const MAX_READ_CHARS = 6000;

// The shape the model must answer in. Every field is optional; an entry that
// mentions nothing measurable correctly comes back as {}.
const SCHEMA = {
  type: "object",
  properties: {
    water: {
      type: "object",
      properties: {
        amount: { type: "number" },
        unit: { type: "string", enum: ["gal", "l", "ml"] },
        per_plant: { type: "boolean" },
        plants: { type: "array", items: { type: "string" } },
      },
    },
    feed: { type: "string" },
    temp_high: { type: "number" },
    temp_low: { type: "number" },
    humidity: { type: "number" },
    training: {
      type: "array",
      items: {
        type: "object",
        properties: { plant: { type: "string" }, action: { type: "string" } },
      },
    },
    health: {
      type: "array",
      items: {
        type: "object",
        properties: {
          plant: { type: "string" },
          color: { type: "string" },
          trichomes: { type: "string" },
          notes: { type: "string" },
        },
      },
    },
  },
};

/**
 * Pure: the instruction the model reads the entry under.
 *
 * It names the space's real plants so "the big one" and "Blue Dream" can both
 * be resolved, and it says in as many ways as it takes that silence is a valid
 * answer. A model that guesses is worse than useless here: a wrong number
 * lands in a permanent record.
 */
export function readingInstruction({ plantNames = [], crop, units = "plants" } = {}) {
  const roster = plantNames.length
    ? `The ${units} in this space are: ${plantNames.join(", ")}. Use these exact names when the writing refers to one of them.`
    : `This space has no named ${units} yet, so do not attribute anything to one.`;
  return [
    `You extract facts from a ${crop === "mushrooms" ? "mushroom" : "cannabis"} grower's journal entry.`,
    roster,
    "Report ONLY what the text states or plainly implies. This fills in a permanent record, so:",
    "- Omit any field the text does not mention. Never guess, never estimate, never carry a value over from a typical day.",
    "- An entry that mentions nothing measurable must return an empty object.",
    "- For water, give the number and unit the writer used. Set per_plant true only when the text says each one got that amount ('they all got 3 L', 'a litre each'). Set plants only when specific ones are named.",
    "- Temperatures are Fahrenheit unless the text says otherwise; convert Celsius before reporting.",
    "- feed is a short description of what was fed, in the writer's own words.",
    "- health covers leaf colour, trichome stage and anything observed about condition. training covers what was physically done to a plant.",
    "- Do not treat a plan or a question as a fact. 'I should water tomorrow' and 'might feed later' are not loggable.",
  ].join("\n");
}

/** POST /api/grows/:id/journal/:date/read - fill the day's log from its entry. */
export async function readEntryIntoLog(env, user, growId, date) {
  if (!DATE_RE.test(date)) return error(400, "invalid date format, expected YYYY-MM-DD");

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) return error(503, "reading entries is not configured yet");

  const row = await ownedGrowRow(env, user.id, growId);
  if (!row) return error(404, "grow not found");
  const survey = parseSurvey(row.survey);
  const crop = cropOf(survey);

  const note = await readNote(env, user.id, growId, date);
  const written = htmlToPlainText(note).trim().slice(0, MAX_READ_CHARS);
  // Nothing written is not a failure and must not cost a model call.
  if (written.length < 12) return json({ read: {}, found: false, reason: "nothing written" });

  const today = todayInET();
  const [flashCount, mine] = await Promise.all([
    readMjModelUsage(env, today, GEMINI_MODEL),
    readReadingUsage(env, user.id, today),
  ]);
  if (flashCount >= GEMINI_DAILY_LIMIT) return json({ read: {}, found: false, reason: "busy" });
  if (user.role !== "admin" && mine >= READ_ENTRY_DAILY_CAP) {
    return json({ read: {}, found: false, reason: "daily limit" });
  }

  const plants = Array.isArray(survey?.strains) ? survey.strains : [];
  const wordsUnits = crop === "mushrooms" ? "tubs" : "plants";

  let reading;
  try {
    // Reserve before calling, so a burst of saves cannot slip past the cap.
    await bumpReadingUsage(env, user.id, today);
    await bumpModelUsage(env, GEMINI_MODEL, today);
    reading = await askGeminiForJson({
      apiKey,
      model: GEMINI_MODEL,
      instruction: readingInstruction({
        plantNames: plants.filter((p) => (p?.status ?? "growing") === "growing").map((p) => p?.name).filter(Boolean),
        crop,
        units: wordsUnits,
      }),
      text: written,
      schema: SCHEMA,
      gatewayBase: env.CF_AI_GATEWAY_URL ?? null,
      userId: user.id,
    });
  } catch (e) {
    // A reading that could not happen leaves the day exactly as it was. This is
    // a convenience on top of a log that still works by hand, so it fails quiet.
    const reason = e instanceof ProviderError && e.code === "rate_limited" ? "busy" : "unavailable";
    return json({ read: {}, found: false, reason });
  }

  const { patch, read, found } = readingToLogPatch(reading, { plants, crop });
  if (!found) return json({ read: {}, found: false, reason: "nothing to log" });

  await ensureGrowLogSchema(env);
  const existingRow = await env.DB.prepare(
    "SELECT * FROM grow_log WHERE user_id = ? AND grow_id = ? AND date = ?",
  ).bind(user.id, growId, date).first();
  const existing = existingRow ? rowToEntry(existingRow) : {};
  const previouslyRead = existing.read_from ?? {};

  const merged = mergeReading(existing, patch, previouslyRead);
  // Only the fields this reading actually landed stay marked as read. A field
  // it proposed but was refused (because you had typed one) belongs to you.
  const nowRead = { ...previouslyRead };
  for (const key of Object.keys(read)) {
    const cols = key === "water" ? ["water_gal", "water_plants"] : [key];
    if (cols.some((c) => merged[c] === patch[c])) nowRead[key] = true;
  }

  await env.DB.prepare(`
    INSERT INTO grow_log (user_id, grow_id, date, water_gal, feed, temp_high, temp_low, humidity, water_plants, training, plant_health, read_from, auto_weather, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    ON CONFLICT(user_id, grow_id, date) DO UPDATE SET
      water_gal    = excluded.water_gal,
      feed         = excluded.feed,
      temp_high    = excluded.temp_high,
      temp_low     = excluded.temp_low,
      humidity     = excluded.humidity,
      water_plants = excluded.water_plants,
      training     = excluded.training,
      plant_health = excluded.plant_health,
      read_from    = excluded.read_from,
      auto_weather = 0,
      updated_at   = excluded.updated_at
  `).bind(
    user.id, growId, date,
    merged.water_gal ?? null, merged.feed ?? null,
    merged.temp_high ?? null, merged.temp_low ?? null, merged.humidity ?? null,
    merged.water_plants?.length ? JSON.stringify(merged.water_plants) : null,
    merged.training?.length ? JSON.stringify(merged.training) : null,
    merged.plant_health?.length ? JSON.stringify(merged.plant_health) : null,
    Object.keys(nowRead).length ? JSON.stringify(nowRead) : null,
  ).run();

  return json({ read: nowRead, found: true, entry: { ...merged, read_from: nowRead } });
}

// Readings get their own daily counter rather than eating the MJ chat
// allowance: writing a long journal entry should never be the reason there is
// no MJ left to ask a question with.
async function bumpReadingUsage(env, userId, today) {
  await env.DB.prepare(
    "INSERT INTO read_usage (user_id, date, count) VALUES (?, ?, 1) " +
    "ON CONFLICT(user_id, date) DO UPDATE SET count = count + 1",
  ).bind(userId, today).run();
}

async function readReadingUsage(env, userId, today) {
  await ensureReadUsageSchema(env);
  const row = await env.DB.prepare(
    "SELECT COALESCE(count, 0) AS count FROM read_usage WHERE user_id = ? AND date = ?",
  ).bind(userId, today).first();
  return Number(row?.count ?? 0);
}

let _readUsageReady = false;
async function ensureReadUsageSchema(env) {
  if (_readUsageReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS read_usage (
      user_id INTEGER NOT NULL,
      date    TEXT NOT NULL,
      count   INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, date)
    )
  `).run();
  _readUsageReady = true;
}
