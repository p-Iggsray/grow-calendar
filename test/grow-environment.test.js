import { test } from "node:test";
import assert from "node:assert/strict";
import {
  climateHint, climateLabel, ENVIRONMENTS, readsOwnClimate, tracksOutdoorWeather,
} from "../src/lib/growEnvironment.js";

// Three screens and one worker route all ask these two questions, so the
// answers had better not drift apart.

test("a tent does not care what the sky is doing", () => {
  assert.equal(tracksOutdoorWeather("indoor"), false);
  assert.equal(readsOwnClimate("indoor"), true);
});

test("a plant in the ground cares about nothing else", () => {
  assert.equal(tracksOutdoorWeather("outdoor"), true);
  assert.equal(readsOwnClimate("outdoor"), false);
});

test("a greenhouse is both: driven by the weather, measured by hand", () => {
  assert.equal(tracksOutdoorWeather("greenhouse"), true);
  assert.equal(readsOwnClimate("greenhouse"), true);
});

test("a space that never said what it is keeps the weather it always had", () => {
  // Silently dropping the weather from an old journal would be the worse
  // surprise, so anything unrecognised behaves exactly as it did before.
  for (const unknown of [undefined, null, "", "tent", "balcony", 42]) {
    assert.equal(tracksOutdoorWeather(unknown), true, `for ${JSON.stringify(unknown)}`);
    assert.equal(readsOwnClimate(unknown), false, `for ${JSON.stringify(unknown)}`);
  }
});

test("every kind the app offers gets at least one source of numbers", () => {
  for (const kind of ENVIRONMENTS) {
    assert.ok(
      tracksOutdoorWeather(kind) || readsOwnClimate(kind),
      `${kind} would have no climate at all`,
    );
  }
});

test("the day's numbers are called what they actually are", () => {
  assert.equal(climateLabel("outdoor"), "Weather");
  assert.equal(climateLabel("indoor"), "Conditions");
  // A greenhouse reads its own instruments, so they are readings, not weather.
  assert.equal(climateLabel("greenhouse"), "Conditions");
});

test("each kind explains where its numbers come from, in its own words", () => {
  const hints = ENVIRONMENTS.map(climateHint);
  assert.equal(new Set(hints).size, ENVIRONMENTS.length, "no two kinds share a hint");
  for (const h of hints) assert.ok(h.length > 0 && !/undefined/.test(h));
  assert.match(climateHint("indoor"), /thermometer/i);
  assert.match(climateHint("outdoor"), /automatically/i);
});
