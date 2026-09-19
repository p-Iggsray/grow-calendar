// The colour label's typeface, and making sure it is actually there before
// anything is drawn with it.
//
// Canvas does not wait for fonts and it does not complain. Set ctx.font to a
// family the browser has not finished loading and it silently draws in the
// fallback, the label looks wrong, and nothing anywhere says why. Every canvas
// font bug is this bug.
//
// So the font is bundled rather than borrowed from the device (Comic Sans is on
// Windows and most Macs, but not on iOS, not on Android, and not on a Linux
// box, and a brand label that changes face depending on who opens the app is
// not a brand label), and the draw waits for it.

/** The bundled family. Declared in src/styles.css, served from public/fonts. */
export const LABEL_FONT = "Comic Neue";

// The weights the label actually asks for. Loading a weight that was never
// declared resolves immediately and teaches you nothing, so this list has to
// match the @font-face blocks.
const WEIGHTS = [400, 700];

let _ready = null;

/**
 * Resolves once the label font can be drawn with, or once it is clear it
 * cannot be.
 *
 * Never rejects. A font that fails to load is a label set in the fallback,
 * which is worse-looking but still correct and still printable; it is not a
 * reason to leave the grower staring at an empty preview. Memoized, because
 * this runs on every keystroke in the label sheet.
 */
export function ensureLabelFont() {
  if (_ready) return _ready;
  _ready = (async () => {
    // A browser without the FontFace API draws in whatever it has.
    if (typeof document === "undefined" || !document.fonts?.load) return false;
    try {
      await Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 100px "${LABEL_FONT}"`)));
      return WEIGHTS.every((w) => document.fonts.check(`${w} 100px "${LABEL_FONT}"`));
    } catch {
      return false;
    }
  })();
  return _ready;
}
