import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Home, Plus, Trees, Warehouse } from "lucide-react";
import Portal from "./Portal.jsx";
import { usePlan } from "../lib/usePlan.jsx";
import { ymd } from "../lib/api.js";
import { currentStageOf, dayOfGrow, stageLabel } from "../lib/stageTimeline.js";
import { partitionPlants } from "./PlantsTab/constants.js";
import { tapHaptic } from "../lib/haptics.js";

const KIND_ICON = { indoor: Home, outdoor: Trees, greenhouse: Warehouse };
const UI = "var(--font-ui)";

// One space's line in the sheet: what it is, where it is, and how long it has
// been going. Everything shown is recorded, never predicted.
function growLine(grow, todayKey) {
  const { active } = partitionPlants(grow.survey);
  const stage = currentStageOf(active);
  const day = dayOfGrow(grow.firstDate, todayKey);
  return [
    stage ? stageLabel(stage) : null,
    day != null ? `Day ${day}` : null,
    `${active.length} plant${active.length === 1 ? "" : "s"}`,
  ].filter(Boolean).join(" · ");
}

// The header title, turned into a switcher. Tapping it lists every space you
// keep so you can jump between them from anywhere in the app, rather than
// digging into Spaces and re-activating one.
export default function GrowSwitcher({ today, onNewEnvironment }) {
  const { grows, activeGrowId, setActiveGrowId } = usePlan();
  const [open, setOpen] = useState(false);
  const todayKey = ymd(today ?? new Date());

  // Only finished spaces can go on the calendar; an unfinished one has no
  // timeline to show, and it is offered as "finish setup" instead.
  const ready = grows.filter((g) => g.survey);
  const unfinished = grows.filter((g) => !g.survey);
  const activeGrow = grows.find((g) => g.id === activeGrowId) ?? null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // With a single space there is nothing to switch to: render a plain title so
  // the header does not advertise a menu that would only ever hold one row.
  const canSwitch = grows.length > 1;

  function pick(id) {
    tapHaptic();
    setOpen(false);
    if (id !== activeGrowId) setActiveGrowId(id);
  }

  return (
    <>
      <button
        type="button"
        onClick={canSwitch ? () => { tapHaptic(); setOpen(true); } : undefined}
        aria-haspopup={canSwitch ? "dialog" : undefined}
        aria-label={canSwitch ? `${activeGrow?.displayName || "This space"}, switch space` : undefined}
        disabled={!canSwitch}
        style={{
          display: "flex", alignItems: "center", gap: 5,
          background: "none", border: "none", padding: 0, margin: 0,
          font: "inherit", color: "inherit", textAlign: "left",
          minWidth: 0, maxWidth: "100%",
          cursor: canSwitch ? "pointer" : "default",
        }}>
        <span style={{
          fontSize: 19, fontWeight: 700, letterSpacing: -0.4, color: "var(--c-text)",
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {activeGrow?.displayName || "Grow Calendar"}
        </span>
        {canSwitch && (
          <ChevronDown size={16} strokeWidth={2.4} aria-hidden="true" style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <Portal>
            <motion.div
              key="switcher-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 90,
                background: "rgba(0,0,0,0.5)",
                display: "flex", alignItems: "flex-end",
              }}>
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Switch space"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300, restDelta: 0.5 }}
                style={{
                  width: "100%", maxHeight: "82vh", overflowY: "auto",
                  background: "var(--c-panel-bg)",
                  borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  border: "1px solid var(--c-border-strong)", borderBottom: "none",
                  padding: "8px 0 calc(10px + env(safe-area-inset-bottom, 0px))",
                }}>
                <div aria-hidden="true" style={{
                  width: 38, height: 4, borderRadius: 2, margin: "4px auto 10px",
                  background: "var(--c-border-strong)",
                }} />
                <div style={{
                  fontFamily: UI, fontSize: 11, fontWeight: 600, letterSpacing: 1.6,
                  textTransform: "uppercase", color: "var(--c-text-faint)",
                  padding: "0 18px 8px",
                }}>
                  Switch space
                </div>

                {ready.map((g) => {
                  const isActive = g.id === activeGrowId;
                  const KindIcon = KIND_ICON[g.survey?.environment] ?? Home;
                  return (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => pick(g.id)}
                      aria-current={isActive ? "true" : undefined}
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", padding: "12px 18px", minHeight: 58,
                        background: isActive ? "rgba(74,222,128,0.08)" : "none",
                        border: "none", borderLeft: `3px solid ${isActive ? "var(--c-accent)" : "transparent"}`,
                        font: "inherit", textAlign: "left", cursor: "pointer",
                      }}>
                      <KindIcon size={17} strokeWidth={1.9} aria-hidden="true" style={{ color: "var(--c-text-muted)", flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                          display: "block", fontFamily: UI, fontSize: 15,
                          fontWeight: isActive ? 700 : 500, color: "var(--c-text)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {g.displayName || "Unnamed space"}
                        </span>
                        <span style={{
                          display: "block", fontFamily: UI, fontSize: 12,
                          color: "var(--c-text-faint)", marginTop: 2,
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                        }}>
                          {growLine(g, todayKey)}
                        </span>
                      </span>
                      {isActive && <Check size={17} strokeWidth={2.4} style={{ color: "var(--c-accent)", flexShrink: 0 }} />}
                    </button>
                  );
                })}

                {unfinished.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { tapHaptic(); setOpen(false); onNewEnvironment?.(g.id); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "12px 18px", minHeight: 58,
                      background: "none", border: "none", borderLeft: "3px solid transparent",
                      font: "inherit", textAlign: "left", cursor: "pointer",
                    }}>
                    <Home size={17} strokeWidth={1.9} aria-hidden="true" style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", fontFamily: UI, fontSize: 15, color: "var(--c-text-muted)" }}>
                        {g.displayName || "Unnamed space"}
                      </span>
                      <span style={{ display: "block", fontFamily: UI, fontSize: 12, color: "var(--c-warn)", marginTop: 2 }}>
                        Setup unfinished - tap to finish
                      </span>
                    </span>
                  </button>
                ))}

                <div style={{ borderTop: "1px solid var(--c-border-faint)", marginTop: 6, paddingTop: 6 }}>
                  <button
                    type="button"
                    onClick={() => { tapHaptic(); setOpen(false); onNewEnvironment?.(null); }}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      width: "100%", padding: "12px 18px", minHeight: 52,
                      background: "none", border: "none",
                      font: "inherit", textAlign: "left", cursor: "pointer",
                    }}>
                    <Plus size={17} strokeWidth={2.2} aria-hidden="true" style={{ color: "var(--c-accent)", flexShrink: 0 }} />
                    <span style={{ fontFamily: UI, fontSize: 15, fontWeight: 600, color: "var(--c-accent)" }}>
                      New space
                    </span>
                  </button>
                </div>
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
