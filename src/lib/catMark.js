// The Black Cat Botanicals mark: a cat's head, its whiskers, and its eyes.
//
// The geometry lives here, on its own, because three different renderers draw
// it: React in the app, a canvas in the printed label, and a string of SVG in
// the public strain page. They must be the same cat, so they read the same
// numbers.
//
// The coordinate space is a 100-wide box. The head spans y 6 to 86; the
// whiskers reach x 1.5 to 98.5.

// Head: two ear triangles and a rounded skull, drawn as one closed path so it
// fills cleanly and the ears are part of the silhouette rather than stuck on.
export const CAT_HEAD =
  "M20,32 L24,6 L44,20 C46,19 54,19 56,20 L76,6 L80,32 " +
  "C84,42 84,58 78,68 C72,80 60,86 50,86 C40,86 28,80 22,68 C16,58 16,42 20,32 Z";

// Almond eyes, wide apart and high on the skull the way a cat's are. They are
// the brand, so they are drawn large enough to still be two eyes at 32px.
export const CAT_EYE_L = "M26,50 Q36,39 46,50 Q36,61 26,50 Z";
export const CAT_EYE_R = "M54,50 Q64,39 74,50 Q64,61 54,50 Z";

// Slit pupils. Vertical, which is most of what makes a cat eye read as one.
export const CAT_PUPILS = [
  { cx: 36, cy: 50, rx: 2.3, ry: 6.2 },
  { cx: 64, cy: 50, rx: 2.3, ry: 6.2 },
];

export const CAT_NOSE = "M46.5,61 L53.5,61 L50,65.5 Z";

// Whiskers start at the cheek and run outward. They begin on the silhouette
// edge rather than inside it, because inside a black head a black whisker is
// not there at all.
export const CAT_WHISKERS = [
  [21, 60, 3, 53],
  [19.5, 66.5, 1.5, 66.5],
  [21, 73, 4, 79],
  [79, 60, 97, 53],
  [80.5, 66.5, 98.5, 66.5],
  [79, 73, 96, 79],
];

// A tight viewBox around all of it, with a hair of padding on every side.
export const CAT_VIEWBOX = "-2 2 104 88";
export const CAT_ASPECT = 88 / 104;

/**
 * The mark as a standalone SVG string, for the places that build HTML rather
 * than render components.
 */
export function catMarkSvg({ width = 26, ink = "#e0913f", eye = "#e0913f", pupil = "#0c0b0a", fill = "#000" } = {}) {
  const stroke = 3;
  return `<svg viewBox="${CAT_VIEWBOX}" width="${width}" height="${
    Math.round(width * CAT_ASPECT)
  }" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">` +
    `<path d="${CAT_HEAD}" fill="${fill}" stroke="${ink}" stroke-width="${stroke}" stroke-linejoin="round"/>` +
    CAT_WHISKERS.map(([x1, y1, x2, y2]) =>
      `<path d="M${x1},${y1} L${x2},${y2}" stroke="${ink}" stroke-width="${stroke * 0.8}" stroke-linecap="round"/>`,
    ).join("") +
    `<path d="${CAT_EYE_L}" fill="${eye}"/><path d="${CAT_EYE_R}" fill="${eye}"/>` +
    CAT_PUPILS.map((p) =>
      `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" fill="${pupil}"/>`,
    ).join("") +
    `<path d="${CAT_NOSE}" fill="${ink}"/></svg>`;
}
