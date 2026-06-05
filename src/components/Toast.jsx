import { AnimatePresence, motion } from "framer-motion";
import { useToast } from "../lib/useToast.jsx";

export default function Toast() {
  const { toasts } = useToast();

  return (
    <div style={{
      position: "fixed",
      bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
      left: "50%",
      transform: "translateX(-50%)",
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      pointerEvents: "none",
    }}>
      <AnimatePresence>
        {toasts.map(toast => (
          <motion.div
            key={toast.id}
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 8, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 300 }}
            style={{
              background: "rgba(30,10,10,0.92)",
              border: "1px solid rgba(220,38,38,0.45)",
              borderRadius: 10,
              padding: "10px 18px",
              color: "#fca5a5",
              fontFamily: "'Courier New', monospace",
              fontSize: 12,
              letterSpacing: 0.3,
              whiteSpace: "nowrap",
              backdropFilter: "blur(8px)",
            }}>
            {toast.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
