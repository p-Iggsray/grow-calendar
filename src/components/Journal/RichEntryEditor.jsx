import { useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Type } from "lucide-react";
import { sanitizeHtml, noteToHtml, htmlIsEmpty } from "../../lib/richText.js";

const SIZES = [
  { label: "Small",  value: "2" },
  { label: "Normal", value: "3" },
  { label: "Large",  value: "5" },
];

function ToolButton({ onPress, label, children, active = false }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      // Prevent the button from stealing focus/selection from the editor.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      style={{
        width: 34, height: 30, borderRadius: 8, flexShrink: 0,
        background: active ? "var(--c-surface-2)" : "none",
        border: "1px solid " + (active ? "var(--c-border-strong)" : "transparent"),
        color: "var(--c-text-dim)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      {children}
    </button>
  );
}

// WYSIWYG editor for journal entries: bold/italic/underline, header +
// subheader, bullet/numbered lists, and three font sizes. Emits a sanitized
// HTML string (whitelisted tags only); blank content is emitted as "" so an
// emptied entry never counts as a journaled day.
export default function RichEntryEditor({ value, onChange, onBlur, placeholder = "", focusSignal = 0, minHeight = 96, style }) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);
  const [sizeMenu, setSizeMenu] = useState(false);

  // Load external content (day change, initial fetch) without clobbering the
  // caret when this editor itself was the source of the change.
  useEffect(() => {
    const el = ref.current;
    if (!el || value === lastEmitted.current) return;
    el.innerHTML = noteToHtml(value);
    lastEmitted.current = value;
  }, [value]);

  useEffect(() => {
    if (focusSignal > 0) ref.current?.focus();
  }, [focusSignal]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    // Restore the :empty placeholder when the editor is visually blank
    // (browsers leave "<div><br></div>" behind after deleting everything).
    if (el.textContent.trim() === "" && !el.querySelector("li") && el.innerHTML !== "") {
      el.innerHTML = "";
    }
    const html = sanitizeHtml(el.innerHTML);
    const out = htmlIsEmpty(html) ? "" : html;
    lastEmitted.current = out;
    onChange(out);
  }

  function exec(cmd, val) {
    const el = ref.current;
    if (!el) return;
    el.focus();
    // Tags, not style spans - the sanitizer only keeps whitelisted tags.
    try { document.execCommand("styleWithCSS", false, false); } catch { /* older engines */ }
    document.execCommand(cmd, false, val);
    emit();
  }

  function toggleBlock(tag) {
    let current = "";
    try { current = String(document.queryCommandValue("formatBlock") || "").toLowerCase(); } catch { /* unsupported */ }
    exec("formatBlock", current === tag ? "<p>" : `<${tag}>`);
  }

  return (
    // Swallow pointer-downs so page-turn swipe gestures never start from
    // inside the editor or its toolbar.
    <div onPointerDownCapture={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", marginBottom: 8 }}>
        {sizeMenu ? (
          <>
            {SIZES.map((s) => (
              <button
                key={s.value}
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => { exec("fontSize", s.value); setSizeMenu(false); }}
                style={{
                  padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                  background: "var(--c-surface-2)", border: "1px solid var(--c-border-strong)",
                  color: "var(--c-text-dim)", fontFamily: "var(--font-ui)",
                  fontSize: s.value === "2" ? 11 : s.value === "5" ? 15 : 13,
                }}>
                {s.label}
              </button>
            ))}
            <ToolButton label="Close size menu" onPress={() => setSizeMenu(false)} active>
              <Type size={14} strokeWidth={2} />
            </ToolButton>
          </>
        ) : (
          <>
            <ToolButton label="Bold" onPress={() => exec("bold")}><Bold size={14} strokeWidth={2.4} /></ToolButton>
            <ToolButton label="Italic" onPress={() => exec("italic")}><Italic size={14} strokeWidth={2.2} /></ToolButton>
            <ToolButton label="Underline" onPress={() => exec("underline")}><Underline size={14} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Header" onPress={() => toggleBlock("h1")}><Heading1 size={15} strokeWidth={2} /></ToolButton>
            <ToolButton label="Subheader" onPress={() => toggleBlock("h2")}><Heading2 size={15} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Bullet list" onPress={() => exec("insertUnorderedList")}><List size={15} strokeWidth={2} /></ToolButton>
            <ToolButton label="Numbered list" onPress={() => exec("insertOrderedList")}><ListOrdered size={15} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Font size" onPress={() => setSizeMenu(true)}><Type size={14} strokeWidth={2} /></ToolButton>
          </>
        )}
      </div>
      <div
        ref={ref}
        className="rich-entry"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Journal entry"
        data-placeholder={placeholder}
        onInput={emit}
        onBlur={onBlur}
        style={{
          minHeight,
          fontFamily: "var(--font-journal)", fontSize: 15.5, lineHeight: 1.8,
          color: "var(--c-text)", caretColor: "var(--c-accent)",
          wordBreak: "break-word",
          ...style,
        }}
      />
    </div>
  );
}
