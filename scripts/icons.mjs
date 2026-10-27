// Build the app icons from the brand mark.
//
// public/icon.svg is written from src/lib/catMark.js, so the icon is the same
// grin as everywhere else, then rasterised: iOS and Android will not take an
// SVG for a home screen. Run `node scripts/icons.mjs` after changing the mark,
// and commit what it writes.
//
// The launcher icons keep the whole mark, smoke and all, inside the safe area
// a circular mask leaves. The favicon is never masked and is 32px across, so
// it gets the face alone, as large as it will go: at that size smoke is a
// smudge.

import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { BRAND, catMarkSvg, markAspect } from "../src/lib/catMark.js";

const SIZE = 1024;
const SAFE_WIDTH = 0.78;
const FAVICON_WIDTH = 0.96;

function iconSvg({ width, smoke }) {
  const w = Math.round(SIZE * width);
  const h = Math.round(w * markAspect({ smoke }));
  const mark = catMarkSvg({ width: w, smoke, glow: true, uid: smoke ? "ic" : "fv" })
    .replace("<svg ", `<svg x="${(SIZE - w) / 2}" y="${(SIZE - h) / 2}" `);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">` +
    `<title>Black Cat Growz</title>` +
    `<defs><radialGradient id="aura" cx="0.5" cy="0.5" r="0.55">` +
      `<stop offset="0" stop-color="${BRAND.aura}" stop-opacity="0.35"/>` +
      `<stop offset="1" stop-color="${BRAND.aura}" stop-opacity="0"/></radialGradient></defs>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="${BRAND.ground}"/>` +
    `<rect width="${SIZE}" height="${SIZE}" fill="url(#aura)"/>` +
    mark + `</svg>`;
}

const icon = iconSvg({ width: SAFE_WIDTH, smoke: true });
const favicon = iconSvg({ width: FAVICON_WIDTH, smoke: false });
writeFileSync("public/icon.svg", icon + "\n");

// High density first, then downsample: librsvg rasterises at the density and
// the resize does the antialiasing, which is sharper than rendering small.
const render = (source, size, out) =>
  sharp(Buffer.from(source), { density: 300 }).resize(size, size).png().toFile(out);

await render(icon, 180, "public/icon-180.png");
await render(icon, 192, "public/icon-192.png");
await render(icon, 512, "public/icon-512.png");
await render(favicon, 32, "public/icon-32.png");

console.log("wrote icon.svg, icon-32, icon-180, icon-192, icon-512");
