import { useId } from "react";
import { catMarkSvg } from "../lib/catMark.js";

/**
 * The brand mark, in the app: the grin, with a seedling clenched in it.
 *
 * `size` is the width; the mark is wider than it is tall. `glow` puts the soft
 * purple aura of the brand artwork behind the eyes and grin, for the places
 * the mark is the whole point, like the splash.
 *
 * The SVG comes from the same steps every other renderer uses, so the app
 * cannot drift from the labels and the icon. Every id is scoped to the
 * instance, so two marks on one page cannot steal each other's paint.
 */
export default function CatMark({ size = 120, glow = false, title }) {
  const uid = "m" + useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <span
      style={{ display: "inline-flex", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: catMarkSvg({ width: size, glow, uid, title }) }}
    />
  );
}
