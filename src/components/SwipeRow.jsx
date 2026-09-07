import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, useReducedMotion, animate as animateValue } from "framer-motion";
import { tapHaptic } from "../lib/haptics.js";

// A row you can push aside to get at what you can do with it.
//
// The card itself stays exactly what it was - a button you tap to open. This
// only adds a drawer behind it: drag left and the actions come out from under
// the right edge, drag back (or tap the card, or open another row) and they
// tuck away again.
//
// Three things make it behave rather than fight the page:
//
//   * The drag locks to whichever axis you started moving in, so a scroll up
//     the list stays a scroll and never peels a row open by accident.
//   * A drag is not a tap. Any real movement swallows the click that the
//     pointer-up would otherwise fire on the card underneath.
//   * Only the row you opened is open, which is the parent's business - it
//     owns `open` and hears about changes, so two drawers can never gape at
//     once.
//
// The drawer rides in over the right of the card rather than out from under it.
// Two reasons: a card's background is translucent, so anything parked
// underneath would show straight through while the row was shut; and a card's
// content is left-aligned and short, so sliding the whole card aside by the
// drawer's width would push its name clean off the screen and leave what looks
// like an empty card. The card eases over just enough to feel pushed.
//
// Swipe is an accelerator, never the only way in: every action here is also
// reachable from the space's own settings, so nothing is lost to a keyboard or
// a screen reader. The buttons stay out of the tab order while tucked away.

const ACTION_WIDTH = 84;
// Past a third of the drawer, or thrown hard enough, it opens. Otherwise it
// snaps back, so a hesitant drag never leaves the row half-open.
const OPEN_RATIO = 0.34;
const FLING_VELOCITY = 380;

// The card answers the drag by a nudge, never more than this: a card's text
// starts close to its left edge, and anything further would slide the name out
// through the clip.
const CARD_DRIFT = 0.15;
const CARD_DRIFT_MAX = 12;

const SNAP = { type: "spring", stiffness: 520, damping: 42, mass: 0.7 };

export default function SwipeRow({ actions = [], open = false, onOpenChange, children }) {
  const reduced = useReducedMotion();
  const x = useMotionValue(0);
  const draggedRef = useRef(false);
  const width = ACTION_WIDTH * actions.length;
  // Shut, the drawer sits its own width past the right edge, where the
  // wrapper's clipping hides it. It arrives exactly as fast as the card
  // leaves, so the two edges stay locked together.
  const drawerX = useTransform(x, (v) => Math.max(0, width + v));
  // The card sits inside the dragged layer, so it would travel the full width
  // with it. Pull most of that back: what is left is a nudge that answers your
  // finger without carrying the card's own name out of sight.
  const undrift = useTransform(x, (v) => -v + Math.max(v * CARD_DRIFT, -CARD_DRIFT_MAX));

  // The parent owns which row is open, so follow it whenever it changes -
  // including when another row opening closes this one.
  useEffect(() => {
    const to = open ? -width : 0;
    if (x.get() === to) return;
    const controls = animateValue(x, to, reduced ? { duration: 0 } : SNAP);
    return () => controls.stop();
  }, [open, width, x, reduced]);

  function settle(offsetX, velocityX) {
    const past = -offsetX > width * OPEN_RATIO;
    const flung = velocityX < -FLING_VELOCITY;
    const next = (past || flung) && velocityX < FLING_VELOCITY;
    if (next !== open) {
      tapHaptic();
      onOpenChange?.(next);
    } else {
      animateValue(x, next ? -width : 0, reduced ? { duration: 0 } : SNAP);
    }
  }

  if (actions.length === 0) return children;

  return (
    <div style={{ position: "relative", borderRadius: "var(--radius-lg)", overflow: "hidden" }}>
      {/* The drawer: parked past the right edge until the card moves off it. */}
      <motion.div
        style={{
          // Above the drag layer, because it slides ON TOP of the card: under
          // it, every tap meant for Edit or Delete would be caught by the card.
          position: "absolute", top: 0, bottom: 0, right: 0, width, zIndex: 2,
          display: "flex", x: drawerX,
          pointerEvents: open ? "auto" : "none",
        }}
        aria-hidden={!open}>
        {actions.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={open ? 0 : -1}
            onClick={() => { tapHaptic(); onOpenChange?.(false); a.onClick?.(); }}
            aria-label={a.ariaLabel ?? a.label}
            style={{
              width: ACTION_WIDTH, flexShrink: 0, border: "none", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6,
              background: a.tone === "destructive" ? "rgba(239,68,68,0.16)" : "var(--c-surface-2)",
              color: a.tone === "destructive" ? "var(--c-danger)" : "var(--c-text-dim)",
              fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 0.4, fontWeight: 600,
            }}>
            {a.icon}
            {a.label}
          </button>
        ))}
      </motion.div>

      {/* The drag lives on an invisible layer that carries `x` the full width,
          so the drawer tracks the finger one to one. The card underneath rides
          a fraction of it. */}
      <motion.div
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: -width, right: 0 }}
        dragElastic={{ left: 0.06, right: 0 }}
        dragMomentum={false}
        style={{ x, position: "relative", zIndex: 1, touchAction: "pan-y" }}
        onDragStart={() => { draggedRef.current = true; }}
        onDragEnd={(_, info) => {
          settle(info.offset.x, info.velocity.x);
          // Let the click that follows this pointer-up land on us, not the card.
          setTimeout(() => { draggedRef.current = false; }, 0);
        }}
        onClickCapture={(e) => {
          // A drag is not a tap, and neither is the tap that closes a drawer.
          if (draggedRef.current || open) {
            e.stopPropagation();
            e.preventDefault();
            if (open) onOpenChange?.(false);
          }
        }}>
        {/* Undo the drag layer's travel, then apply the card's own share of it. */}
        <motion.div style={{ x: undrift }}>{children}</motion.div>
      </motion.div>
    </div>
  );
}
