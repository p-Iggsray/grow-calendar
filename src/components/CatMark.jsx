import {
  CAT_HEAD, CAT_EYE_L, CAT_EYE_R, CAT_PUPILS, CAT_NOSE, CAT_WHISKERS,
  CAT_VIEWBOX, CAT_ASPECT,
} from "../lib/catMark.js";

/**
 * The brand mark, in the app.
 *
 * `ink` draws the outline, whiskers and nose. `eye` fills the eyes. `pupil` is
 * the slit, which wants to be whatever sits behind the mark so the eye looks
 * cut rather than painted.
 */
export default function CatMark({
  size = 40,
  ink = "var(--c-accent)",
  eye = "var(--c-accent)",
  pupil = "var(--c-bg)",
  fill = "#000",
  stroke = 3,
  title,
}) {
  return (
    <svg
      viewBox={CAT_VIEWBOX}
      width={size}
      height={Math.round(size * CAT_ASPECT)}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <path d={CAT_HEAD} fill={fill} stroke={ink} strokeWidth={stroke} strokeLinejoin="round" />
      {CAT_WHISKERS.map(([x1, y1, x2, y2]) => (
        <line
          key={`${x1},${y1}`}
          x1={x1} y1={y1} x2={x2} y2={y2}
          stroke={ink} strokeWidth={stroke * 0.8} strokeLinecap="round"
        />
      ))}
      <path d={CAT_EYE_L} fill={eye} />
      <path d={CAT_EYE_R} fill={eye} />
      {CAT_PUPILS.map((p) => (
        <ellipse key={p.cx} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={pupil} />
      ))}
      <path d={CAT_NOSE} fill={ink} />
    </svg>
  );
}
