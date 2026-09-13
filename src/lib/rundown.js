// Saving a grow space's rundown to the phone or the disk.
//
// The rundown is the whole of a space in one printable file: what it is, what
// lived in it, every stage it went through, every day that was logged, the
// sensor readings, the photographs, the drying and curing log. It is what makes
// deleting a space something other than losing it, so this is the only path to
// a delete: the token that comes back with the file is what the server checks.
//
// The fetch-then-save dance rather than a plain link is deliberate. This is an
// installed PWA scoped to "/", so a same-origin navigation is captured by the
// app window and replaces the running app, which looks like a hard refresh.

import { api } from "./api.js";
import { loadWaterUnit } from "./waterUnits.js";
import { cropOf } from "./crops.js";

/** A filename that says which space and which day, and sorts by date. */
export function rundownFilename(name, date = new Date()) {
  const slug = String(name ?? "").trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "environment";
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
  return `${slug}-rundown-${day}.html`;
}

/**
 * Build the space's rundown and hand it to the browser to save.
 *
 * Resolves with the `rundownAt` token, which a delete has to present. Throws if
 * the file could not be built, in which case nothing is armed and nothing can
 * be deleted, which is the right way for this to fail.
 */
export async function downloadRundown(growId, { name, survey } = {}) {
  const { html, rundownAt } = await api.getGrowReport(growId, loadWaterUnit(cropOf(survey)));
  const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = rundownFilename(name);
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return rundownAt;
}
