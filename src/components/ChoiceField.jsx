import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { tapHaptic } from "../lib/haptics.js";
import { buildOptions, filterOptions, loadRemembered, rememberValue, sameChoice } from "../lib/choices.js";
import Portal from "./Portal.jsx";

const UI = "var(--font-ui)";
// Short lists read better as chips you can see all at once; longer ones get a
// searchable sheet instead of a wall of pills.
const CHIP_LIMIT = 6;

function Chip({ label, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: "8px 13px", borderRadius: 16, cursor: "pointer",
        background: active ? "rgba(74,222,128,0.16)" : "rgba(255,255,255,0.05)",
        border: active ? "1px solid rgba(74,222,128,0.5)" : "1px solid var(--c-border-strong)",
        color: active ? "var(--c-accent)" : "var(--c-text-muted)",
        fontFamily: UI, fontSize: 12.5, letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}>
      {label}
    </button>
  );
}

// A pickable field: tap a choice instead of typing. `fieldKey` turns on
// remembering - anything typed under "Something else" is offered as a choice
// on this device from then on.
export default function ChoiceField({
  value,
  onChange,
  presets = [],
  fieldKey,
  placeholder = "Choose…",
  searchLabel = "Search",
  allowCustom = true,
  customLabel = "Something else…",
  mode,           // "chips" | "sheet"; omit to pick by list length
  clearable = true,
}) {
  const [remembered, setRemembered] = useState(() => loadRemembered(fieldKey));
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [customOpen, setCustomOpen] = useState(false);
  const [customText, setCustomText] = useState("");
  const customRef = useRef(null);

  const options = useMemo(
    () => buildOptions(presets, remembered, value),
    [presets, remembered, value],
  );
  const useChips = (mode ?? (options.length <= CHIP_LIMIT ? "chips" : "sheet")) === "chips";

  useEffect(() => { if (customOpen) customRef.current?.focus(); }, [customOpen]);
  useEffect(() => { if (!sheetOpen) { setQuery(""); setCustomOpen(false); setCustomText(""); } }, [sheetOpen]);

  function choose(next) {
    tapHaptic();
    onChange(next);
    setSheetOpen(false);
  }
  function saveCustom() {
    const text = customText.trim();
    if (!text) return;
    if (fieldKey) {
      rememberValue(fieldKey, text);
      setRemembered(loadRemembered(fieldKey));
    }
    setCustomOpen(false);
    setCustomText("");
    choose(text);
  }

  const customInput = (
    <div style={{ display: "flex", gap: 7, marginTop: 8 }}>
      <input
        ref={customRef}
        type="text"
        value={customText}
        onChange={(e) => setCustomText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); saveCustom(); } }}
        placeholder="Type it once and it is saved as a choice"
        maxLength={80}
        style={{
          flex: 1, minWidth: 0, padding: "11px 13px", borderRadius: 10,
          background: "rgba(0,0,0,0.25)", border: "1px solid var(--c-border-strong)",
          color: "var(--c-text)", fontFamily: UI, fontSize: 16, outline: "none",
        }}
      />
      <button
        type="button"
        onClick={saveCustom}
        style={{
          flexShrink: 0, padding: "11px 15px", borderRadius: 10,
          background: "rgba(74,222,128,0.16)", border: "1px solid rgba(74,222,128,0.45)",
          color: "var(--c-accent)", fontFamily: UI, fontSize: 12.5, fontWeight: 700, cursor: "pointer",
        }}>
        Use
      </button>
    </div>
  );

  // ── Chips: the whole list is visible, one tap to pick ──────────────────────
  if (useChips) {
    return (
      <div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
          {options.map((opt) => (
            <Chip
              key={opt}
              label={opt}
              active={sameChoice(opt, value)}
              onClick={() => choose(sameChoice(opt, value) && clearable ? "" : opt)}
            />
          ))}
          {allowCustom && (
            <Chip label={customOpen ? "Cancel" : customLabel} active={false} onClick={() => setCustomOpen((o) => !o)} />
          )}
        </div>
        {customOpen && customInput}
      </div>
    );
  }

  // ── Sheet: a searchable list for the long catalogues ───────────────────────
  const shown = filterOptions(options, query);
  return (
    <>
      <button
        type="button"
        onClick={() => { tapHaptic(); setSheetOpen(true); }}
        style={{
          width: "100%", boxSizing: "border-box", padding: "12px 14px", borderRadius: 10,
          background: "rgba(0,0,0,0.25)", border: "1px solid var(--c-border-strong)",
          color: value ? "var(--c-text)" : "var(--c-text-ghost)",
          fontFamily: UI, fontSize: 15, cursor: "pointer", textAlign: "left",
          display: "flex", alignItems: "center", gap: 10, minHeight: 48,
        }}>
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || placeholder}
        </span>
        {value && clearable && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear"
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onChange(""); } }}
            style={{ display: "flex", color: "var(--c-text-ghost)", padding: 2 }}>
            <X size={15} strokeWidth={2} />
          </span>
        )}
        <ChevronDown size={17} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
      </button>

      <AnimatePresence>
        {sheetOpen && (
          <Portal>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.14 }}
              onClick={() => setSheetOpen(false)}
              style={{
                position: "fixed", inset: 0, zIndex: 90,
                background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end",
              }}>
              <motion.div
                initial={{ y: 40 }}
                animate={{ y: 0 }}
                exit={{ y: 40 }}
                transition={{ type: "spring", damping: 30, stiffness: 320 }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "100%", maxHeight: "82vh", display: "flex", flexDirection: "column",
                  background: "var(--c-panel-bg)",
                  borderTopLeftRadius: 20, borderTopRightRadius: 20,
                  padding: "8px 12px calc(14px + env(safe-area-inset-bottom, 0px))",
                  borderTop: "1px solid var(--c-border)",
                }}>
                <div aria-hidden="true" style={{
                  width: 38, height: 4, borderRadius: 2, margin: "4px auto 10px",
                  background: "var(--c-border-strong)", flexShrink: 0,
                }} />

                <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0, marginBottom: 8 }}>
                  <Search size={16} strokeWidth={2} style={{ color: "var(--c-text-ghost)", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={searchLabel}
                    style={{
                      flex: 1, minWidth: 0, padding: "10px 0", border: "none", background: "none",
                      color: "var(--c-text)", fontFamily: UI, fontSize: 16, outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setSheetOpen(false)}
                    aria-label="Close"
                    style={{
                      flexShrink: 0, width: 32, height: 32, borderRadius: 16, border: "none",
                      background: "var(--c-surface-2)", color: "var(--c-text-dim)", cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                    <X size={16} strokeWidth={2} />
                  </button>
                </div>

                <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
                  {shown.length === 0 && (
                    <div style={{ fontFamily: UI, fontSize: 13, color: "var(--c-text-ghost)", padding: "16px 4px", textAlign: "center" }}>
                      Nothing matches. Use &ldquo;{customLabel}&rdquo; below.
                    </div>
                  )}
                  {shown.map((opt) => {
                    const active = sameChoice(opt, value);
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => choose(opt)}
                        style={{
                          display: "flex", alignItems: "center", gap: 10, width: "100%",
                          padding: "13px 8px", borderRadius: 10, minHeight: 50,
                          background: "none", border: "none",
                          borderBottom: "1px solid var(--c-border-faint)",
                          color: active ? "var(--c-accent)" : "var(--c-text)",
                          fontFamily: UI, fontSize: 15, textAlign: "left", cursor: "pointer",
                        }}>
                        <span style={{ flex: 1, minWidth: 0 }}>{opt}</span>
                        {active && <Check size={16} strokeWidth={2.4} />}
                      </button>
                    );
                  })}
                </div>

                {allowCustom && (
                  <div style={{ flexShrink: 0, paddingTop: 8 }}>
                    {customOpen ? customInput : (
                      <button
                        type="button"
                        onClick={() => setCustomOpen(true)}
                        style={{
                          width: "100%", padding: "13px", borderRadius: 12,
                          background: "var(--c-surface-1)", border: "1px dashed var(--c-border-strong)",
                          color: "var(--c-text-dim)", fontFamily: UI, fontSize: 14, cursor: "pointer",
                        }}>
                        {customLabel}
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
            </motion.div>
          </Portal>
        )}
      </AnimatePresence>
    </>
  );
}
