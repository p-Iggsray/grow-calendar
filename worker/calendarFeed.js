// @ts-check
// Your reminders, as a calendar your phone already knows how to notify you
// about.
//
// The app has no way to push a notification - that would need a service worker,
// VAPID keys and a cron, and it would still be at the mercy of how aggressively
// a phone throttles web push. Publishing an iCalendar feed instead hands the
// job to the calendar app you already trust: subscribe once, and iOS raises the
// alerts itself, on every device you are signed into, whether or not this app
// has been opened in a month.
//
// The feed is read by a calendar client that cannot log in, so it is
// authenticated by an unguessable token in the URL, the same way the buddy
// share link works. It is revocable and regenerable from Settings.
import { json, error, nowIso, bytesToBase64Url } from "./util.js";
import { ensureGrowEventsSchema } from "./events.js";

// How far back to include. Past reminders give the calendar some context
// without turning it into an archive.
const PAST_DAYS = 60;
const MAX_EVENTS = 400;
// Hint to the client for how often to re-fetch. Clients treat this as advice.
const REFRESH_MINUTES = 60;

let _schemaReady = false;
async function ensureCalendarTokenSchema(env) {
  if (_schemaReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS calendar_tokens (
      token      TEXT    PRIMARY KEY,
      user_id    INTEGER NOT NULL UNIQUE,
      created_at TEXT    NOT NULL
    )
  `).run();
  _schemaReady = true;
}

function genToken() {
  // 24 bytes -> 32 chars of base64url. Not guessable, and short enough to
  // retype off a screen if it comes to that.
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(24)));
}

/**
 * Pure: escape a value for an iCalendar TEXT field. Backslashes, semicolons
 * and commas are structural in the format, and newlines have to be written as
 * a literal "\n" or the line ends the property.
 */
export function icsEscape(text) {
  return String(text ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/**
 * Pure: fold a content line to 75 octets, as RFC 5545 requires. A continuation
 * starts with a single space. Folding by CHARACTER would break multi-byte text,
 * so this counts the UTF-8 bytes each character costs.
 */
export function foldLine(line) {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const out = [];
  let current = "";
  let bytes = 0;
  for (const ch of String(line)) {
    const size = enc.encode(ch).length;
    // 74 on continuation lines, because the leading space costs one.
    const limit = out.length === 0 ? 75 : 74;
    if (bytes + size > limit) {
      out.push(current);
      current = ch;
      bytes = size;
    } else {
      current += ch;
      bytes += size;
    }
  }
  out.push(current);
  return out.join("\r\n ");
}

const pad = (n) => String(n).padStart(2, "0");

/** Pure: "20260910" from "2026-09-10". */
export function icsDate(dateKey) {
  return String(dateKey ?? "").replaceAll("-", "");
}

/** Pure: a UTC stamp like "20260910T143000Z" from a Date. */
export function icsStamp(d) {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Pure: one VEVENT for a reminder.
 *
 * A timed reminder is a floating local time - no Z, no TZID - so "07:30" means
 * half seven wherever the phone happens to be, which is what a grower means. An
 * untimed one is a real all-day event, alarmed in the morning rather than at
 * midnight, because midnight is not when anybody waters.
 */
export function buildEvent(ev, { host, stamp, growName }) {
  const uid = `${ev.id}@${host}`;
  const lines = ["BEGIN:VEVENT", `UID:${uid}`, `DTSTAMP:${stamp}`];

  if (ev.time) {
    const start = `${icsDate(ev.date)}T${ev.time.replace(":", "")}00`;
    lines.push(`DTSTART:${start}`, `DURATION:PT30M`, "X-APPLE-TRAVEL-ADVISORY-BEHAVIOR:AUTOMATIC");
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, "TRIGGER:PT0S", "END:VALARM");
  } else {
    const [y, m, d] = ev.date.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    lines.push(
      `DTSTART;VALUE=DATE:${icsDate(ev.date)}`,
      `DTEND;VALUE=DATE:${icsDate(next.toISOString().slice(0, 10))}`,
    );
    // Nine in the morning on the day, rather than the stroke of midnight.
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(ev.title)}`, "TRIGGER:PT9H", "END:VALARM");
  }

  lines.push(`SUMMARY:${icsEscape(ev.title)}`);
  const description = [ev.notes, growName].filter(Boolean).join("\n");
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (growName) lines.push(`LOCATION:${icsEscape(growName)}`);
  lines.push("END:VEVENT");
  return lines;
}

/** Pure: the whole calendar document. */
export function buildCalendar(events, { host, now, growNames = {}, calName = "Grow Reminders" }) {
  const stamp = icsStamp(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Grow Calendar//Reminders//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEscape(calName)}`,
    `X-WR-CALDESC:${icsEscape("Reminders from your grow calendar")}`,
    `X-PUBLISHED-TTL:PT${REFRESH_MINUTES}M`,
    `REFRESH-INTERVAL;VALUE=DURATION:PT${REFRESH_MINUTES}M`,
  ];
  for (const ev of events) {
    lines.push(...buildEvent(ev, { host, stamp, growName: growNames[ev.grow_id] }));
  }
  lines.push("END:VCALENDAR");
  // CRLF line endings are required, and every line is folded to 75 octets.
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// ── Routes ───────────────────────────────────────────────────────────────────

// GET /api/calendar - the owner's current feed token (or null).
export async function getCalendarToken(env, user) {
  await ensureCalendarTokenSchema(env);
  const row = await env.DB.prepare(
    "SELECT token, created_at FROM calendar_tokens WHERE user_id = ?"
  ).bind(user.id).first();
  return json({ token: row?.token ?? null, createdAt: row?.created_at ?? null });
}

// POST /api/calendar - create or rotate. Rotating invalidates the old URL, so
// a subscription that has leaked can be cut off.
export async function createCalendarToken(env, user) {
  await ensureCalendarTokenSchema(env);
  const token = genToken();
  const now = nowIso();
  await env.DB.prepare(
    `INSERT INTO calendar_tokens (token, user_id, created_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET token = excluded.token, created_at = excluded.created_at`
  ).bind(token, user.id, now).run();
  return json({ token, createdAt: now });
}

// DELETE /api/calendar - stop publishing entirely.
export async function deleteCalendarToken(env, user) {
  await ensureCalendarTokenSchema(env);
  await env.DB.prepare("DELETE FROM calendar_tokens WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true });
}

// GET /api/calendar/:token.ics - public, because a calendar client cannot log
// in. The token is the credential.
export async function getCalendarFeed(env, token, request) {
  if (!token || token.length > 60) return error(400, "invalid token");
  await ensureCalendarTokenSchema(env);
  const row = await env.DB.prepare(
    "SELECT user_id FROM calendar_tokens WHERE token = ?"
  ).bind(token).first();
  if (!row) return error(404, "calendar not found");

  await ensureGrowEventsSchema(env);
  const now = new Date();
  const from = new Date(now.getTime() - PAST_DAYS * 86400000).toISOString().slice(0, 10);

  // Every space's reminders: this is your calendar, not one grow's.
  const [evRes, growRes] = await Promise.all([
    env.DB.prepare(
      `SELECT id, grow_id, date, title, time, notes FROM grow_events
       WHERE user_id = ? AND date >= ?
       ORDER BY date, time IS NULL, time, created_at
       LIMIT ${MAX_EVENTS}`
    ).bind(row.user_id, from).all(),
    env.DB.prepare("SELECT id, display_name FROM grows WHERE user_id = ?").bind(row.user_id).all(),
  ]);

  const growNames = Object.fromEntries(
    (growRes.results ?? []).map((g) => [g.id, g.display_name || ""]),
  );
  const host = new URL(request.url).host;
  const body = buildCalendar(evRes.results ?? [], { host, now, growNames });

  return new Response(body, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="grow-reminders.ics"',
      // Calendar clients poll; let them, but never let a proxy pin a stale copy.
      "cache-control": "no-cache, must-revalidate",
    },
  });
}
