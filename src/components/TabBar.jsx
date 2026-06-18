import { motion } from "framer-motion";
import { CalendarDays, Sprout, Sparkles, ClipboardList, MoreHorizontal } from "lucide-react";

const TABS = [
  { id: "calendar", Icon: CalendarDays,   label: "CALENDAR" },
  { id: "plants",   Icon: Sprout,          label: "PLANTS"   },
  { id: "mj",       Icon: Sparkles,        label: "MJ"       },
  { id: "plan",     Icon: ClipboardList,   label: "PLAN"     },
  { id: "more",     Icon: MoreHorizontal,  label: "MORE"     },
];

export default function TabBar({ activeTab, onTab }) {
  return (
    <nav
      aria-label="Main navigation"
      style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        zIndex: 35,
        background: "var(--c-tab-bar-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--c-surface-2)",
        display: "flex",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
        paddingLeft: "env(safe-area-inset-left, 0px)",
        paddingRight: "env(safe-area-inset-right, 0px)",
      }}
    >
      {TABS.map(({ id, Icon, label }) => {
        const active = activeTab === id;
        const isMj = id === "mj";
        return (
          <button
            key={id}
            type="button"
            aria-label={label.toLowerCase()}
            aria-current={active ? "page" : undefined}
            onClick={() => onTab(id)}
            style={{
              flex: 1,
              position: "relative",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center",
              gap: 4,
              padding: "9px 4px 11px",
              background: "none", border: "none",
              cursor: "pointer",
              minHeight: 56,
              color: active ? "var(--c-accent)" : "var(--c-text-ghost)",
              transition: "color 0.18s",
            }}
          >
            {active && (
              <motion.div
                layoutId="tab-indicator"
                style={{
                  position: "absolute",
                  top: 0,
                  left: "20%", right: "20%",
                  height: 2,
                  background: "var(--c-accent)",
                  borderRadius: 1,
                }}
                transition={{ type: "spring", damping: 26, stiffness: 300 }}
              />
            )}
            {isMj ? (
              <div style={{
                width: 50, height: 28,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: active ? "rgba(34,197,94,0.18)" : "rgba(34,197,94,0.07)",
                border: `1px solid ${active ? "rgba(34,197,94,0.5)" : "rgba(34,197,94,0.18)"}`,
                borderRadius: 14,
                transition: "all 0.18s",
              }}>
                <Icon size={16} strokeWidth={active ? 2.2 : 1.7} />
              </div>
            ) : (
              <Icon size={22} strokeWidth={active ? 2.2 : 1.7} />
            )}
            <span style={{
              fontSize: 11,
              fontFamily: "'Courier New', monospace",
              letterSpacing: 0.8,
              fontWeight: active ? 700 : 400,
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
