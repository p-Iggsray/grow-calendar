// Rasterise the app icons from public/icon.svg.
//
// The SVG is the only drawing; the PNGs exist because iOS and Android will not
// take an SVG for a home screen. Run `node scripts/icons.mjs` after changing
// the mark, and commit what it writes.
//
// The favicon gets its own tighter crop: it is never masked to a circle, so it
// does not need the safe-area inset the launcher icons do, and at 32px every
// wasted pixel of margin costs a whisker.

import sharp from "sharp";
import { readFileSync } from "node:fs";

const SAFE_AREA_SCALE = "scale(0.72)";
const FAVICON_SCALE = "scale(0.95)";

const svg = readFileSync("public/icon.svg", "utf8");
const favicon = svg.replace(SAFE_AREA_SCALE, FAVICON_SCALE);
if (favicon === svg) throw new Error("icon.svg no longer contains " + SAFE_AREA_SCALE);

// High density first, then downsample: librsvg rasterises at the density and
// the resize does the antialiasing, which is sharper than rendering small.
const render = (source, size, out) =>
  sharp(Buffer.from(source), { density: 1600 }).resize(size, size).png().toFile(out);

await render(svg, 180, "public/icon-180.png");
await render(svg, 192, "public/icon-192.png");
await render(svg, 512, "public/icon-512.png");
await render(favicon, 32, "public/icon-32.png");

console.log("wrote icon-32, icon-180, icon-192, icon-512");
