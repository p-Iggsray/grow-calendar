// The Black Cat Botanicals mark: a cat's head, its whiskers, and its eyes.
//
// The geometry lives here, on its own, because four renderers draw it: React
// in the app, a string of SVG in the public strain page and the report, a
// canvas in the printed label, and the app icon. They must be the same cat, so
// they read the same numbers.
//
// The coordinate space is a 100-wide box. The head spans y 4 to 88; the
// whiskers reach x 0.5 to 99.5.
//
// Two things are drawn once and used twice. The silhouette carries the fur:
// the ears lean out, the cheeks break with a tuft rather than curving
// smoothly, and the jaw narrows to a chin, so the outline reads as an animal
// instead of a circle with triangles on it. The face is knocked out of it:
// eyes, pupils, nose, mouth. On paper that knockout is white and there is no
// other ink; on screen the same shapes take light.

// The head, as one closed path so the ears belong to the silhouette rather
// than sitting on top of it. Symmetric about x = 50.
export const CAT_HEAD =
  "M17,34 L21,4 L43,19 C46,16.5 54,16.5 57,19 L79,4 L83,34 " +
  "C87.5,44 89,54 84.5,63 C81,76 65,88.5 50,88.5 " +
  "C35,88.5 19,76 15.5,63 C11,54 12.5,44 17,34 Z";

// Inner ears, inset from the ear triangles. They only show where there is
// colour to show them in; on paper they would fill with the same black.
export const CAT_INNER_EARS = [
  "M20,29.5 L22.8,8.5 L38.2,19 Z",
  "M80,29.5 L77.2,8.5 L61.8,19 Z",
];

// The eyes. Not a symmetric lens: the outer corner rides higher than the
// inner one, which is most of the difference between a cat and a doll.
export const CAT_EYE_L = "M27,51 C30,42 42,40 46,47.5 C44,56 32,58.5 27,51 Z";
export const CAT_EYE_R = "M73,51 C70,42 58,40 54,47.5 C56,56 68,58.5 73,51 Z";

// Slit pupils, vertical.
export const CAT_PUPILS = [
  { cx: 36.5, cy: 49.5, rx: 2.5, ry: 5.5 },
  { cx: 63.5, cy: 49.5, rx: 2.5, ry: 5.5 },
];

// Where a highlight lands with the light up and to the left.
export const CAT_GLINTS = [
  { cx: 32.5, cy: 45.5, r: 1.9 },
  { cx: 59.5, cy: 45.5, r: 1.9 },
];

export const CAT_NOSE =
  "M45.6,61.2 Q50,59.8 54.4,61.2 Q53.1,65.4 50,67.6 Q46.9,65.4 45.6,61.2 Z";

// The muzzle: the line down from the nose and the two curves off it.
export const CAT_MOUTH = [
  "M50,67.6 L50,70.4",
  "M50,70.4 Q45.8,74.2 41.8,70.6",
  "M50,70.4 Q54.2,74.2 58.2,70.6",
];

// Whiskers, as filled slivers rather than strokes so each one tapers from the
// cheek to a point. They are drawn under the head, which covers their roots,
// so a whisker grows out from behind the face the way it actually does.
export const CAT_WHISKERS = [
  "M21,57.5 Q12,54 1.5,49 Q12,57.5 21,59.5 Z",
  "M20,65 Q10,63.9 0.5,64.5 Q10,66.5 20,67 Z",
  "M21,71.5 Q12.5,74.8 3,80 Q13,76.6 21,73.5 Z",
  "M79,57.5 Q88,54 98.5,49 Q88,57.5 79,59.5 Z",
  "M80,65 Q90,63.9 99.5,64.5 Q90,66.5 80,67 Z",
  "M79,71.5 Q87.5,74.8 97,80 Q87,76.6 79,73.5 Z",
];

// A tight box around all of it, with a hair of padding on every side.
export const CAT_VIEWBOX = "-2 1 104 90";
export const CAT_ASPECT = 90 / 104;

/**
 * The mark as a flat SVG string, for the places that build HTML rather than
 * render components.
 *
 * `ink` is the silhouette. `eye` fills the eyes and `pupil` cuts the slit.
 * `face` is the nose and mouth, which on paper have to be knocked out of the
 * black or they are not there at all.
 */
export function catMarkSvg({
  width = 26, ink = "#e0913f", eye = "#e0913f", pupil = "#0c0b0a",
  face = null, fill = "#000",
} = {}) {
  const detail = face ?? ink;
  return `<svg viewBox="${CAT_VIEWBOX}" width="${width}" height="${
    Math.round(width * CAT_ASPECT)
  }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    CAT_WHISKERS.map((d) => `<path d="${d}" fill="${ink}"/>`).join("") +
    `<path d="${CAT_HEAD}" fill="${fill}" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="${CAT_EYE_L}" fill="${eye}"/><path d="${CAT_EYE_R}" fill="${eye}"/>` +
    CAT_PUPILS.map((p) =>
      `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${pupil}"/>`,
    ).join("") +
    `<path d="${CAT_NOSE}" fill="${detail}"/>` +
    CAT_MOUTH.map((d) =>
      `<path d="${d}" fill="none" stroke="${detail}" stroke-width="1.7" stroke-linecap="round"/>`,
    ).join("") +
    `</svg>`;
}

/**
 * The mark lit, as an SVG string.
 *
 * Same treatment as `<CatMark lit>`: a coat with a gradient in it, a rim light
 * off the top left, warm inner ears, and eyes that carry their own glow. This
 * is that version for the one place that cannot run React at all, which is the
 * paint index.html puts on screen before the bundle has arrived.
 *
 * `uid` scopes every gradient id, so this can sit on a page beside a rendered
 * CatMark without the two stealing each other's paint.
 */
export function litCatMarkSvg({ width = 140, uid = "bcb" } = {}) {
  const id = (name) => `${uid}-${name}`;
  const url = (name) => `url(#${id(name)})`;
  const stops = (list) =>
    list.map(([o, c, a]) =>
      `<stop offset="${o}" stop-color="${c}"${a === undefined ? "" : ` stop-opacity="${a}"`}/>`,
    ).join("");

  return `<svg viewBox="${CAT_VIEWBOX}" width="${width}" height="${
    Math.round(width * CAT_ASPECT)
  }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<defs>` +
      `<linearGradient id="${id("coat")}" x1="0.15" y1="0" x2="0.85" y2="1">${
        stops([["0%", "#2a231d"], ["40%", "#0f0d0b"], ["100%", "#020202"]])
      }</linearGradient>` +
      `<linearGradient id="${id("rim")}" x1="0.05" y1="0.05" x2="0.8" y2="0.95">${
        stops([["0%", "#ffc27a"], ["42%", "#e89a45"], ["88%", "#e0913f", "0.22"], ["100%", "#e0913f", "0"]])
      }</linearGradient>` +
      `<linearGradient id="${id("ear")}" x1="0.5" y1="0" x2="0.5" y2="1">${
        stops([["0%", "#7a4520"], ["100%", "#2a160b"]])
      }</linearGradient>` +
      `<radialGradient id="${id("iris")}" cx="0.42" cy="0.3" r="0.85">${
        stops([["0%", "#ffe3a6"], ["42%", "#eda049"], ["100%", "#8f4d12"]])
      }</radialGradient>` +
      `<linearGradient id="${id("whiskerL")}" x1="1" y1="0" x2="0" y2="0">${
        stops([["0%", "#d8ccbc", "0.9"], ["100%", "#d8ccbc", "0.05"]])
      }</linearGradient>` +
      `<linearGradient id="${id("whiskerR")}" x1="0" y1="0" x2="1" y2="0">${
        stops([["0%", "#d8ccbc", "0.9"], ["100%", "#d8ccbc", "0.05"]])
      }</linearGradient>` +
      `<linearGradient id="${id("snout")}" x1="0.5" y1="0" x2="0.5" y2="1">${
        stops([["0%", "#d99a72"], ["100%", "#7c4326"]])
      }</linearGradient>` +
      `<filter id="${id("glow")}" x="-160%" y="-160%" width="420%" height="420%">` +
        `<feGaussianBlur stdDeviation="2.6"/>` +
      `</filter>` +
    `</defs>` +
    CAT_WHISKERS.map((d, i) =>
      `<path d="${d}" fill="${url(i < 3 ? "whiskerL" : "whiskerR")}"/>`,
    ).join("") +
    `<path d="${CAT_HEAD}" fill="${url("coat")}" stroke="${url("rim")}"` +
      ` stroke-width="2.7" stroke-linejoin="round"/>` +
    CAT_INNER_EARS.map((d) => `<path d="${d}" fill="${url("ear")}" opacity="0.85"/>`).join("") +
    `<g filter="${url("glow")}" opacity="0.85">` +
      `<path d="${CAT_EYE_L}" fill="#e0913f"/><path d="${CAT_EYE_R}" fill="#e0913f"/>` +
    `</g>` +
    `<path d="${CAT_EYE_L}" fill="${url("iris")}"/><path d="${CAT_EYE_R}" fill="${url("iris")}"/>` +
    CAT_PUPILS.map((p) =>
      `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="#0a0806"/>`,
    ).join("") +
    CAT_GLINTS.map((g) =>
      `<circle cx="${g.cx}" cy="${g.cy}" r="${g.r}" fill="#fffaf0" opacity="0.9"/>`,
    ).join("") +
    `<path d="${CAT_NOSE}" fill="${url("snout")}"/>` +
    CAT_MOUTH.map((d) =>
      `<path d="${d}" fill="none" stroke="#6f6053" stroke-width="1.7" stroke-linecap="round"/>`,
    ).join("") +
    `</svg>`;
}
