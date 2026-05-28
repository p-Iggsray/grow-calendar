// One-shot: rasterizes public/icon.svg to a 180x180 PNG for iOS 15 and older,
// which doesn't render SVG apple-touch-icons reliably. Re-run when icon.svg
// changes:
//
//   node scripts/gen-png-icon.mjs
//
// sharp ships transitively (wrangler depends on it). If it ever drops out,
// `npm i -D sharp` and re-run.
import sharp from "sharp";
import fs from "node:fs";

const svg = fs.readFileSync("public/icon.svg");
const dest = "public/icon-180.png";

await sharp(svg, { density: 384 })
  .resize(180, 180)
  .png({ compressionLevel: 9 })
  .toFile(dest);

console.log(`wrote ${dest}`);
