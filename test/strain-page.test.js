import { test } from "node:test";
import assert from "node:assert/strict";
import { renderStrainPage } from "../worker/strainPage.js";
import { strainPagePath } from "../src/lib/strainPage.js";

// The page a label's code opens. Its whole job is to say something about the
// variety and nothing about the grower, so that is what these pin.

test("the path is a minted code, never the strain's name", () => {
  // The address used to be the name, which meant guessing the word was enough
  // to confirm the variety existed. It is a code the server mints now, and a
  // name handed to this function is not an address at all.
  assert.equal(strainPagePath("k7Fq2mXp91nR"), "/s/k7Fq2mXp91nR");
  assert.equal(strainPagePath("blue dream"), null);
  assert.equal(strainPagePath("Blue Dream"), null);
  assert.equal(strainPagePath(""), null);
  assert.equal(strainPagePath(null), null);
});

test("a variety with no code prints a label with no square on it", () => {
  // Which is what a mushroom gets, and what anything else with no public page
  // gets: no code means no QR, never a QR that leads nowhere.
  assert.equal(strainPagePath(undefined), null);
  assert.equal(strainPagePath("../../etc/passwd"), null);
});

test("a full profile renders every section it was given", () => {
  const html = renderStrainPage(
    { name: "Blue Dream", type: "hybrid", flower_weeks: 9, photo: 1 },
    {
      summary: "A sativa-leaning hybrid.", lineage: "Blueberry x Haze",
      aroma: ["berry", "sweet"], flavour: ["blueberry"], effects: ["uplifting"],
      terpenes: ["Myrcene"], growing: "Stretches hard in early flower.", difficulty: "easy",
    },
  );
  for (const bit of ["Blue Dream", "sativa-leaning", "Blueberry x Haze", "berry",
                     "blueberry", "uplifting", "Myrcene", "Stretches hard", "Hybrid", "9 weeks", "Photoperiod", "easy"]) {
    assert.ok(html.includes(bit), `missing: ${bit}`);
  }
});

test("a strain with no profile still gets a page, from the catalog alone", () => {
  const html = renderStrainPage({ name: "Mystery", type: "indica" }, null);
  assert.ok(html.includes("Mystery"));
  assert.ok(html.includes("Indica"));
  assert.ok(html.includes("No written profile"));
});

test("an autoflower says so, and an unknown growth habit says nothing", () => {
  assert.ok(renderStrainPage({ name: "A", photo: 0 }, null).includes("Autoflower"));
  assert.ok(renderStrainPage({ name: "A", photo: 1 }, null).includes("Photoperiod"));
  const quiet = renderStrainPage({ name: "A" }, null);
  assert.ok(!quiet.includes("Autoflower") && !quiet.includes("Photoperiod"));
});

test("nothing the grower recorded can reach the page", () => {
  // Everything a user owns, offered to the renderer, must be ignored: it only
  // ever reads the catalog columns and the written profile.
  const html = renderStrainPage(
    { name: "Blue Dream", type: "hybrid", note: "my private note", rating: 5, grows: [{ growName: "Tent One" }] },
    { summary: "General information." },
  );
  assert.ok(!html.includes("my private note"));
  assert.ok(!html.includes("Tent One"));
});

test("a name carrying markup cannot inject into the page", () => {
  const html = renderStrainPage({ name: '<script>alert(1)</script>' }, null);
  assert.ok(!html.includes("<script>alert"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("a profile carrying markup cannot inject either", () => {
  const html = renderStrainPage({ name: "X" }, {
    summary: '</p><script>bad()</script>',
    aroma: ['<img src=x onerror=bad()>'],
  });
  assert.ok(!html.includes("<script>bad"));
  assert.ok(!html.includes("<img src=x"));
});

test("the page tells the reader what it is and is not", () => {
  const html = renderStrainPage({ name: "X" }, { summary: "y" });
  assert.match(html, /not verified/i);
  assert.match(html, /noindex/, "a jar's label should not seed a search index");
});
