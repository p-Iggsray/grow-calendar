import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEnvCsv } from "../src/lib/envCsv.js";

const HEADER = "Timestamp(1 min),Built-in Temperature(℉),Built-in Humidity(%),Built-in VPD(kPa),Probe Temperature(℉),Probe Humidity(%),Probe VPD(kPa)";

test("parses the controller export and normalizes timestamps", () => {
  const csv = [
    HEADER,
    "2026/06/28 09:38:00,74.1,61,1.13,-,-,-",
    "2026/06/28 09:39:00,74.0,61,1.12,-,-,-",
  ].join("\n");
  const { readings, skipped } = parseEnvCsv(csv);
  assert.equal(readings.length, 2);
  assert.equal(skipped, 0);
  assert.deepEqual(readings[0], { ts: "2026-06-28T09:38", tempF: 74.1, humidity: 61, vpd: 1.13 });
});

test("falls back to probe columns when built-in is blank", () => {
  const csv = [HEADER, "2026/06/28 10:00:00,-,-,-,70.2,55,0.9"].join("\n");
  const { readings } = parseEnvCsv(csv);
  assert.equal(readings.length, 1);
  assert.deepEqual(readings[0], { ts: "2026-06-28T10:00", tempF: 70.2, humidity: 55, vpd: 0.9 });
});

test("skips rows with no usable values or bad timestamps", () => {
  const csv = [
    HEADER,
    "2026/06/28 10:01:00,-,-,-,-,-,-",   // all blank -> skipped
    "garbage,74,60,1.0,-,-,-",            // bad ts -> skipped
    "2026/06/28 10:02:00,74,60,1.0,-,-,-",
  ].join("\n");
  const { readings, skipped } = parseEnvCsv(csv);
  assert.equal(readings.length, 1);
  assert.equal(skipped, 2);
});

test("tolerates CRLF and an empty trailing line", () => {
  const csv = HEADER + "\r\n2026/06/28 10:03:00,73,62,1.05,-,-,-\r\n";
  const { readings } = parseEnvCsv(csv);
  assert.equal(readings.length, 1);
  assert.equal(readings[0].humidity, 62);
});

test("empty / header-only input yields no readings", () => {
  assert.deepEqual(parseEnvCsv("").readings, []);
  assert.deepEqual(parseEnvCsv(HEADER).readings, []);
});
