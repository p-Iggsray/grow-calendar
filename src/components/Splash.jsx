import { motion, useReducedMotion } from "framer-motion";

// The app's launch screen: a branded, animated sprout on the deep-green
// background. Shown on first boot (auth check) and while the main bundle loads,
// so it doubles as the Suspense fallback. Kept lightweight — no data, no fonts
// beyond the system stack already in use.
export default function Splash() {
  const reduce = useReducedMotion();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading The Grow Calendar"
      style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 22,
        // Solid brand background (must be fully opaque so nothing bleeds through
        // the overlay) with a soft green glow layered on top for depth.
        backgroundColor: "var(--c-bg)",
        backgroundImage: "radial-gradient(120% 80% at 50% 18%, rgba(34,197,94,0.12), transparent 60%)",
        fontFamily: "var(--font-ui)",
        color: "var(--c-text)",
        padding: "0 24px",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      <Sprout reduce={reduce} />

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.5, ease: "easeOut" }}
        style={{ textAlign: "center" }}>
        <div style={{
          fontFamily: "var(--font-ui)", fontSize: 11, letterSpacing: 5,
          textTransform: "uppercase", color: "var(--c-text-faint)", marginBottom: 8,
        }}>
          Est. 2026
        </div>
        <div style={{ fontSize: 30, fontWeight: 900, letterSpacing: -1, lineHeight: 1.05 }}>
          The Grow Calendar
        </div>
        <div style={{ fontSize: 13.5, color: "var(--c-text-dim)", marginTop: 8, letterSpacing: 0.2 }}>
          Your grow, day by day.
        </div>
      </motion.div>

      <Dots reduce={reduce} />
    </div>
  );
}

// An animated two-leaf sprout: the stem draws in, leaves unfurl, then the whole
// thing sways gently. Behind it, a slow breathing glow.
function Sprout({ reduce }) {
  return (
    <div style={{ position: "relative", width: 96, height: 104, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {/* Breathing glow */}
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0.35, scale: 0.85 }}
        animate={reduce ? { opacity: 0.4 } : { opacity: [0.35, 0.6, 0.35], scale: [0.85, 1.05, 0.85] }}
        transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", width: 96, height: 96, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(74,222,128,0.45), rgba(74,222,128,0) 70%)",
          filter: "blur(2px)",
        }}
      />
      {/* Sprout, swaying from its base */}
      <motion.svg
        viewBox="0 0 64 72" width="80" height="90"
        style={{ position: "relative", transformOrigin: "50% 92%", overflow: "visible" }}
        initial={reduce ? false : { rotate: 0 }}
        animate={reduce ? undefined : { rotate: [-2.5, 2.5, -2.5] }}
        transition={reduce ? undefined : { duration: 4, repeat: Infinity, ease: "easeInOut" }}>
        {/* Stem draws upward */}
        <motion.path
          d="M32 70 C 32 56 32 48 32 34"
          stroke="#4ade80" strokeWidth="3.2" strokeLinecap="round" fill="none"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        {/* Left leaf unfurls (fill-box keeps the scale origin on the leaf
            itself, near where it meets the stem) */}
        <motion.path
          d="M32 48 C 18 47 9 38 9 25 C 23 26 32 35 32 48 Z"
          fill="#22c55e"
          style={{ transformBox: "fill-box", transformOrigin: "100% 100%" }}
          initial={reduce ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.45, ease: "backOut" }}
        />
        {/* Right leaf unfurls */}
        <motion.path
          d="M32 42 C 46 41 55 32 55 19 C 41 20 32 29 32 42 Z"
          fill="#4ade80"
          style={{ transformBox: "fill-box", transformOrigin: "0% 100%" }}
          initial={reduce ? false : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.66, duration: 0.45, ease: "backOut" }}
        />
      </motion.svg>
    </div>
  );
}

// Three pulsing dots as a subtle "working" indicator.
function Dots({ reduce }) {
  return (
    <div aria-hidden="true" style={{ display: "flex", gap: 7 }}>
      {[0, 1, 2].map(i => (
        <motion.span
          key={i}
          style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--c-accent)" }}
          initial={reduce ? false : { opacity: 0.25 }}
          animate={reduce ? { opacity: 0.5 } : { opacity: [0.25, 1, 0.25] }}
          transition={reduce ? undefined : { duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.18 }}
        />
      ))}
    </div>
  );
}
