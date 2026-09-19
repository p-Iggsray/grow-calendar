// Which of the two labels you are looking at.
//
// Both are six by four at 300dpi and both are fed by the same labelFields()
// spec, so flipping between them never changes a word on the jar. What changes
// is the treatment:
//
//   colour  a near-black panel in the app's palette, hazel accents, the potency
//           set as a badge. For a home inkjet or laser, on a sheet of labels.
//   plain   one ink, pure black on white, every size chosen so a thermal head
//           can hold it. This is the original label, untouched.
//
// The choice is remembered per device rather than per strain: it tracks which
// printer is on the desk, and that does not change from jar to jar.

const KEY = "bcb.labelVariant";

export const LABEL_VARIANTS = [
  { value: "colour", label: "Colour", hint: "Inkjet or laser" },
  { value: "plain", label: "Black & white", hint: "Thermal" },
];

export const DEFAULT_VARIANT = "colour";

/** Pure: a stored value, or the default for anything unrecognised. */
export function normalizeVariant(value) {
  return LABEL_VARIANTS.some((v) => v.value === value) ? value : DEFAULT_VARIANT;
}

/** The remembered choice. Storage can throw or be empty; that is not an error. */
export function labelVariant() {
  try { return normalizeVariant(localStorage.getItem(KEY)); }
  catch { return DEFAULT_VARIANT; }
}

export function rememberLabelVariant(value) {
  try { localStorage.setItem(KEY, normalizeVariant(value)); }
  catch { /* a device that will not remember still prints */ }
}

/** The filename half that says which label this file is. */
export function variantSuffix(value) {
  return normalizeVariant(value) === "plain" ? "bw" : "colour";
}
