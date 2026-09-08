import { motion, useReducedMotion } from "framer-motion";
import CatMark from "./CatMark.jsx";

// The app's launch screen: the cat, opening its eyes, on the black. Shown on
// first boot (auth check) and while the main bundle loads, so it doubles as
// the Suspense fallback. Kept lightweight - no data, no fonts beyond the
// system stack already in use.
export default function Splash() {
  const reduce = useReducedMotion();

  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading Black Cat Botanicals"
      style={{
        position: "fixed", inset: 0,
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 22,
        // Solid brand background (must be fully opaque so nothing bleeds
        // through the overlay) with a hazel glow layered on for depth.
        backgroundColor: "var(--c-bg)",
        backgroundImage: "radial-gradient(120% 80% at 50% 18%, rgba(var(--c-accent-rgb), 0.13), transparent 60%)",
        fontFamily: "var(--font-ui)",
        color: "var(--c-text)",
        padding: "0 24px",
        paddingTop: "env(safe-area-inset-top, 0px)",
      }}>
      <Cat reduce={reduce} />

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
          Black Cat Botanicals
        </div>
        <div style={{ fontSize: 13.5, color: "var(--c-text-dim)", marginTop: 8, letterSpacing: 0.2 }}>
          Your grow, day by day.
        </div>
      </motion.div>

      <Dots reduce={reduce} />
    </div>
  );
}

// The mark arrives, then sits there breathing in its own glow.
function Cat({ reduce }) {
  return (
    <div style={{
      position: "relative", width: 132, height: 118,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <motion.div
        aria-hidden="true"
        initial={reduce ? false : { opacity: 0.3, scale: 0.85 }}
        animate={reduce ? { opacity: 0.4 } : { opacity: [0.3, 0.58, 0.3], scale: [0.85, 1.05, 0.85] }}
        transition={reduce ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        style={{
          position: "absolute", width: 108, height: 108, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(var(--c-accent-rgb), 0.4), rgba(var(--c-accent-rgb), 0) 70%)",
          filter: "blur(2px)",
        }}
      />
      <motion.div
        style={{ position: "relative", lineHeight: 0 }}
        initial={reduce ? false : { opacity: 0, scale: 0.82 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.55, ease: "backOut" }}>
        <CatMark size={132} />
      </motion.div>
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
