import { createPortal } from "react-dom";

// Renders children at the end of <body>.
//
// Why this exists: a screen that slides in (framer-motion animates a
// transform) becomes the containing block for any `position: fixed`
// descendant. A sheet or dialog inside such a screen then pins itself to the
// SCREEN's box instead of the viewport, so it lands wherever that content
// happens to be scrolled to. Portalling to <body> puts full-screen overlays
// back on the viewport where they belong.
export default function Portal({ children }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.body);
}
