import { useId } from "react";
import {
  CAT_HEAD, CAT_INNER_EARS, CAT_EYE_L, CAT_EYE_R, CAT_PUPILS, CAT_GLINTS,
  CAT_NOSE, CAT_MOUTH, CAT_WHISKERS, CAT_VIEWBOX, CAT_ASPECT,
} from "../lib/catMark.js";

// Whiskers are drawn before the head so the head covers their roots, which is
// how a whisker actually leaves a face.
function Whiskers({ fill }) {
  return CAT_WHISKERS.map((d) => <path key={d} d={d} fill={fill} />);
}

function Face({ eye, pupil, nose, mouth, glint }) {
  return (
    <>
      <path d={CAT_EYE_L} fill={eye} />
      <path d={CAT_EYE_R} fill={eye} />
      {CAT_PUPILS.map((p) => (
        <ellipse key={p.cx} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={pupil} />
      ))}
      {glint && CAT_GLINTS.map((g) => (
        <circle key={g.cx} cx={g.cx} cy={g.cy} r={g.r} fill={glint} opacity="0.9" />
      ))}
      <path d={CAT_NOSE} fill={nose} />
      {CAT_MOUTH.map((d) => (
        <path key={d} d={d} fill="none" stroke={mouth} strokeWidth="1.7" strokeLinecap="round" />
      ))}
    </>
  );
}

/**
 * The brand mark, in the app.
 *
 * Flat by default: a black head outlined in hazel, which is what a 20px mark
 * beside a heading can carry. `lit` gives it the icon's treatment instead - a
 * coat with a gradient in it, a rim light off the top left, warm inner ears
 * and eyes that glow - for the places the mark is the whole point, like the
 * splash. Every gradient id is scoped to the instance, so two marks on one
 * page cannot steal each other's paint.
 */
export default function CatMark({
  size = 40,
  lit = false,
  ink = "var(--c-accent)",
  eye = "var(--c-accent)",
  pupil = "var(--c-bg)",
  fill = "#000",
  stroke = 2.6,
  title,
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const id = (name) => `${uid}-${name}`;
  const svgProps = {
    viewBox: CAT_VIEWBOX,
    width: size,
    height: Math.round(size * CAT_ASPECT),
    role: title ? "img" : "presentation",
    "aria-label": title,
    "aria-hidden": title ? undefined : true,
  };

  if (!lit) {
    return (
      <svg {...svgProps}>
        <Whiskers fill={ink} />
        <path d={CAT_HEAD} fill={fill} stroke={ink} strokeWidth={stroke} strokeLinejoin="round" />
        <Face eye={eye} pupil={pupil} nose={ink} mouth={ink} />
      </svg>
    );
  }

  return (
    <svg {...svgProps}>
      <defs>
        <linearGradient id={id("coat")} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#2a231d" />
          <stop offset="40%" stopColor="#0f0d0b" />
          <stop offset="100%" stopColor="#020202" />
        </linearGradient>
        <linearGradient id={id("rim")} x1="0.05" y1="0.05" x2="0.8" y2="0.95">
          <stop offset="0%" stopColor="#ffc27a" />
          <stop offset="42%" stopColor="#e89a45" />
          <stop offset="88%" stopColor="#e0913f" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#e0913f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id("ear")} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#7a4520" />
          <stop offset="100%" stopColor="#2a160b" />
        </linearGradient>
        <radialGradient id={id("iris")} cx="0.42" cy="0.3" r="0.85">
          <stop offset="0%" stopColor="#ffe3a6" />
          <stop offset="42%" stopColor="#eda049" />
          <stop offset="100%" stopColor="#8f4d12" />
        </radialGradient>
        <linearGradient id={id("whiskerL")} x1="1" y1="0" x2="0" y2="0">
          <stop offset="0%" stopColor="#d8ccbc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d8ccbc" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={id("whiskerR")} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#d8ccbc" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#d8ccbc" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id={id("snout")} x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#d99a72" />
          <stop offset="100%" stopColor="#7c4326" />
        </linearGradient>
        <filter id={id("glow")} x="-160%" y="-160%" width="420%" height="420%">
          <feGaussianBlur stdDeviation="2.6" />
        </filter>
      </defs>

      {CAT_WHISKERS.map((d, i) => (
        <path key={d} d={d} fill={`url(#${id(i < 3 ? "whiskerL" : "whiskerR")})`} />
      ))}
      <path
        d={CAT_HEAD}
        fill={`url(#${id("coat")})`}
        stroke={`url(#${id("rim")})`}
        strokeWidth="2.7"
        strokeLinejoin="round"
      />
      {CAT_INNER_EARS.map((d) => (
        <path key={d} d={d} fill={`url(#${id("ear")})`} opacity="0.85" />
      ))}
      <g filter={`url(#${id("glow")})`} opacity="0.85">
        <path d={CAT_EYE_L} fill="#e0913f" />
        <path d={CAT_EYE_R} fill="#e0913f" />
      </g>
      <Face
        eye={`url(#${id("iris")})`}
        pupil="#0a0806"
        nose={`url(#${id("snout")})`}
        mouth="#6f6053"
        glint="#fffaf0"
      />
    </svg>
  );
}
