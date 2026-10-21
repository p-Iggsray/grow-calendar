import { test } from "node:test";
import assert from "node:assert/strict";
import { videoFailureReason, whyVideoFailed } from "../src/lib/videoProbe.js";

test("a clip the server hands over fine is a format the browser cannot play", () => {
  assert.equal(videoFailureReason(206), "format");
  assert.equal(videoFailureReason(200), "format");
});

test("anything else is not the format's fault", () => {
  assert.equal(videoFailureReason(401), "signed-out");
  assert.equal(videoFailureReason(404), "missing");
  assert.equal(videoFailureReason(503), "offline");
  assert.equal(videoFailureReason(500), "offline");
});

test("the element's own error code decides when it can", async () => {
  // A probe would find the file fine after a blip; the code says it was the network.
  assert.equal(await whyVideoFailed("/never-fetched", 2), "offline");
  assert.equal(await whyVideoFailed("/never-fetched", 1), "offline");
  assert.equal(await whyVideoFailed("/never-fetched", 3), "format");
});
