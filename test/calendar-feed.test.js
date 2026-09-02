import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCalendar, buildEvent, foldLine, icsEscape, icsDate, icsStamp } from "../worker/calendarFeed.js";

const NOW = new Date("2026-09-01T12:00:00Z");
const OPTS = { host: "grow.example", now: NOW, growNames: { g1: "Basement Tent" } };

// iCalendar is unforgiving and a broken feed fails silently on a phone, so the
// exact bytes matter more than usual.

test("text fields escape the characters that are structural in the format", () => {
  assert.equal(icsEscape("Feed; then top, gently"), String.raw`Feed\; then top\, gently`);
  assert.equal(icsEscape("line one\nline two"), "line one\\nline two");
  assert.equal(icsEscape("back\\slash"), "back\\\\slash");
  assert.equal(icsEscape(null), "");
});

test("long lines fold to 75 octets with a leading space on continuations", () => {
  const long = "SUMMARY:" + "x".repeat(200);
  const folded = foldLine(long);
  const lines = folded.split("\r\n");
  assert.ok(lines.length > 1);
  assert.ok(Buffer.byteLength(lines[0]) <= 75);
  for (const l of lines.slice(1)) {
    assert.equal(l[0], " ");
    assert.ok(Buffer.byteLength(l) <= 75, `continuation was ${Buffer.byteLength(l)} octets`);
  }
  // Unfolding must give the original back.
  assert.equal(lines.map((l, i) => (i ? l.slice(1) : l)).join(""), long);
});

test("folding counts bytes, not characters, so accents cannot split a line", () => {
  const line = "SUMMARY:" + "é".repeat(60);   // 120 octets
  for (const l of foldLine(line).split("\r\n")) {
    assert.ok(Buffer.byteLength(l) <= 75);
  }
  assert.ok(!foldLine(line).includes("�"));
});

test("dates and stamps use the compact form the spec wants", () => {
  assert.equal(icsDate("2026-09-10"), "20260910");
  assert.equal(icsStamp(new Date("2026-09-10T07:05:09Z")), "20260910T070509Z");
});

// ── Events ───────────────────────────────────────────────────────────────────
const stamp = icsStamp(NOW);

test("a timed reminder is a floating local time, so 7:30 means 7:30 anywhere", () => {
  const out = buildEvent(
    { id: "ev1", grow_id: "g1", date: "2026-09-10", title: "Feed day", time: "07:30", notes: null },
    { host: "grow.example", stamp, growName: "Basement Tent" },
  ).join("\n");
  assert.match(out, /DTSTART:20260910T073000$/m);   // no Z, no TZID
  assert.doesNotMatch(out, /DTSTART[^\n]*Z$/m);
  assert.match(out, /SUMMARY:Feed day/);
  assert.match(out, /UID:ev1@grow\.example/);
  assert.match(out, /TRIGGER:PT0S/);               // alert at the time itself
});

test("an untimed reminder is a real all-day event alarmed in the morning", () => {
  const out = buildEvent(
    { id: "ev2", grow_id: "g1", date: "2026-09-10", title: "Defoliate", time: null, notes: null },
    { host: "grow.example", stamp, growName: "Basement Tent" },
  ).join("\n");
  assert.match(out, /DTSTART;VALUE=DATE:20260910/);
  // All-day events end the NEXT day, or the phone shows them a day short.
  assert.match(out, /DTEND;VALUE=DATE:20260911/);
  assert.match(out, /TRIGGER:PT9H/);               // 9am, not midnight
});

test("an all-day event at a month end rolls the end date over correctly", () => {
  const out = buildEvent(
    { id: "ev3", grow_id: "g1", date: "2026-09-30", title: "Flush", time: null },
    { host: "grow.example", stamp },
  ).join("\n");
  assert.match(out, /DTEND;VALUE=DATE:20261001/);
  const leap = buildEvent(
    { id: "ev4", grow_id: "g1", date: "2028-02-29", title: "Flush", time: null },
    { host: "grow.example", stamp },
  ).join("\n");
  assert.match(leap, /DTEND;VALUE=DATE:20280301/);
});

test("the note and the space it belongs to travel with the reminder", () => {
  const out = buildEvent(
    { id: "ev5", grow_id: "g1", date: "2026-09-10", title: "Feed", time: null, notes: "half dose" },
    { host: "grow.example", stamp, growName: "Basement Tent" },
  ).join("\n");
  assert.match(out, /DESCRIPTION:half dose\\nBasement Tent/);
  assert.match(out, /LOCATION:Basement Tent/);
});

// ── Whole document ───────────────────────────────────────────────────────────
test("the calendar is well formed and uses CRLF throughout", () => {
  const ics = buildCalendar(
    [{ id: "ev1", grow_id: "g1", date: "2026-09-10", title: "Feed day", time: "07:30", notes: "half dose" }],
    OPTS,
  );
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.match(ics, /VERSION:2\.0/);
  assert.match(ics, /PRODID:/);
  assert.match(ics, /X-WR-CALNAME:Grow Reminders/);
  // Every BEGIN is matched by its END.
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, (ics.match(/END:VEVENT/g) || []).length);
  assert.equal((ics.match(/BEGIN:VALARM/g) || []).length, (ics.match(/END:VALARM/g) || []).length);
  // A bare LF would break strict parsers.
  assert.equal(ics.split("\n").every((l, i, a) => i === a.length - 1 || l.endsWith("\r")), true);
});

test("an empty calendar is still a valid calendar", () => {
  const ics = buildCalendar([], OPTS);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics, /BEGIN:VEVENT/);
});

test("a title full of commas and newlines cannot break the document", () => {
  const ics = buildCalendar(
    [{ id: "ev9", grow_id: "g1", date: "2026-09-10", title: "Top, then\nLST; check pH", time: null, notes: "a,b;c" }],
    OPTS,
  );
  // The only unescaped separators left are the ones that end properties.
  const summary = ics.split("\r\n").find((l) => l.startsWith("SUMMARY:"));
  assert.equal(summary, String.raw`SUMMARY:Top\, then\nLST\; check pH`);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
});
