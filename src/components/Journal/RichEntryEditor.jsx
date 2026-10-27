import { useCallback, useEffect, useRef, useState } from "react";
import { Bold, Italic, Underline, Heading1, Heading2, List, ListOrdered, Type } from "lucide-react";
import { sanitizeHtml, noteToHtml, htmlIsEmpty, trimTrailingSpace } from "../../lib/richText.js";
import { pasteToHtml, withLineAfterTable } from "../../lib/pasteContent.js";
import { WORD_END, correctWord, wordBeforeBoundary } from "../../lib/autocorrect.js";

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
      aria-pressed={active}
      title={label}
      // Prevent the button from stealing focus/selection from the editor.
      onPointerDown={(e) => e.preventDefault()}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPress}
      style={{
        width: 34, height: 30, borderRadius: 8, flexShrink: 0,
        background: active ? "rgba(var(--c-accent-rgb), 0.16)" : "none",
        border: `1px solid ${active ? "rgba(var(--c-accent-rgb), 0.5)" : "transparent"}`,
        color: active ? "var(--c-accent)" : "var(--c-text-dim)",
        cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "background 0.12s, color 0.12s",
      }}>
      {children}
    </button>
  );
}

const INACTIVE = { bold: false, italic: false, underline: false, ul: false, ol: false, h1: false, h2: false, size: "3" };

// What formatting applies at the current caret/selection, so the toolbar can
// light up the active options. queryCommandState/Value are legacy but remain
// the only selection-format introspection contentEditable offers.
function readActiveFormats() {
  const q = (c) => { try { return document.queryCommandState(c); } catch { return false; } };
  let block = "";
  try { block = String(document.queryCommandValue("formatBlock") || "").toLowerCase(); } catch { /* unsupported */ }
  let size = "";
  try { size = String(document.queryCommandValue("fontSize") || ""); } catch { /* unsupported */ }
  return {
    bold: q("bold"), italic: q("italic"), underline: q("underline"),
    ul: q("insertUnorderedList"), ol: q("insertOrderedList"),
    h1: block === "h1", h2: block === "h2",
    size: size || "3", // no font tag = normal
  };
}

function placeCaret(node, offset) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStart(node, Math.min(offset, node.length));
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

// The text node the caret sits in, and where, when it is a plain caret inside
// this editor. Anything else (a selection, an element boundary) is left alone.
function caretInText(el) {
  const sel = window.getSelection();
  if (!el || !sel || sel.rangeCount === 0 || !sel.isCollapsed) return null;
  const node = sel.anchorNode;
  if (!node || node.nodeType !== Node.TEXT_NODE || !el.contains(node)) return null;
  return { node, offset: sel.anchorOffset };
}

const hasWords = (html) => html.replace(/<[^>]*>/g, "").trim() !== "";

// WYSIWYG editor for journal entries: bold/italic/underline, header +
// subheader, bullet/numbered lists, and three font sizes. Emits a sanitized
// HTML string (whitelisted tags only); blank content is emitted as "" so an
// emptied entry never counts as a journaled day. Toolbar buttons highlight to
// show the formatting active at the caret.
//
// On top of the keyboard's own autocorrect, a finished word that is a known
// mistake (see lib/autocorrect.js) is fixed in place, and a backspace straight
// after puts back what was typed and leaves that word alone from then on.
// Pastes are cleaned rather than taken as given: tables come in tidy, and a
// pasted picture (a chart, a screenshot) goes to the day's photos through
// onPasteImages instead of into the writing.
export default function RichEntryEditor({ value, onChange, onBlur, onPasteImages, placeholder = "", focusSignal = 0, minHeight = 96, style }) {
  const ref = useRef(null);
  const lastEmitted = useRef(null);
  // The correction a backspace would undo, and the words undone this session.
  const lastFix = useRef(null);
  const declined = useRef(new Set());
  const [sizeMenu, setSizeMenu] = useState(false);
  const [fmt, setFmt] = useState(INACTIVE);

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

  const refreshFmt = useCallback(() => {
    const el = ref.current;
    const sel = window.getSelection();
    // Only reflect selections inside THIS editor; leave the last state alone
    // otherwise so the toolbar doesn't flicker when a toolbar button is tapped.
    if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return;
    const next = readActiveFormats();
    setFmt((prev) => (
      prev.bold === next.bold && prev.italic === next.italic && prev.underline === next.underline
      && prev.ul === next.ul && prev.ol === next.ol
      && prev.h1 === next.h1 && prev.h2 === next.h2 && prev.size === next.size
        ? prev : next
    ));
  }, []);

  // Track the caret as it moves (taps, arrow keys, selections).
  useEffect(() => {
    document.addEventListener("selectionchange", refreshFmt);
    return () => document.removeEventListener("selectionchange", refreshFmt);
  }, [refreshFmt]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    // Restore the :empty placeholder when the editor is visually blank
    // (browsers leave "<div><br></div>" behind after deleting everything).
    if (el.textContent.trim() === "" && !el.querySelector("li") && el.innerHTML !== "") {
      el.innerHTML = "";
    }
    // Sanitizing turns the browser's non-breaking spaces back into ordinary
    // ones; trimming stops a trailing one from being stored at all. Only the
    // emitted value is touched, never the DOM, so the caret does not move.
    const html = trimTrailingSpace(sanitizeHtml(el.innerHTML));
    const out = htmlIsEmpty(html) ? "" : html;
    lastEmitted.current = out;
    onChange(out);
    refreshFmt();
  }

  function autocorrectAtCaret() {
    const at = caretInText(ref.current);
    if (!at) return;
    const { node, offset } = at;
    const found = wordBeforeBoundary(node.data, offset);
    if (!found || declined.current.has(found.word.toLowerCase())) return;
    const fix = correctWord(found.word, found.previousWord);
    if (!fix) return;
    // A doubled word goes with the spaces before it; anything else is swapped
    // for its correction. Either way the character that ended it stays put.
    const from = fix.dropDouble ? found.previousEnd : found.start;
    const removed = node.data.slice(from, found.end);
    const inserted = fix.dropDouble ? "" : fix.replace;
    node.replaceData(from, removed.length, inserted);
    const caret = from + inserted.length + 1;
    placeCaret(node, caret);
    lastFix.current = { node, from, removed, inserted, caret, word: found.word.toLowerCase() };
  }

  // Backspace straight after a correction takes it back instead of deleting.
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    function onBeforeInput(e) {
      const fix = lastFix.current;
      if (e.inputType !== "deleteContentBackward" || !fix) return;
      const at = caretInText(el);
      lastFix.current = null;
      if (!at || at.node !== fix.node || at.offset !== fix.caret) return;
      e.preventDefault();
      fix.node.replaceData(fix.from, fix.inserted.length, fix.removed);
      placeCaret(fix.node, fix.from + fix.removed.length + 1);
      declined.current.add(fix.word);
      emit();
    }
    el.addEventListener("beforeinput", onBeforeInput);
    return () => el.removeEventListener("beforeinput", onBeforeInput);
  // emit reads only refs and the latest onChange through closure; rebinding
  // per render would drop a pending undo.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onInput(e) {
    const native = e.nativeEvent;
    lastFix.current = null;
    if (native?.inputType === "insertText" && !native.isComposing && WORD_END.test(native.data ?? "")) {
      autocorrectAtCaret();
    }
    emit();
  }

  function onPaste(e) {
    const clip = e.clipboardData;
    if (!clip) return;
    e.preventDefault();
    lastFix.current = null;
    const images = Array.from(clip.files ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length && onPasteImages) onPasteImages(images);
    const html = withLineAfterTable(pasteToHtml({
      html: clip.getData("text/html") || "",
      text: clip.getData("text/plain") || "",
    }));
    if (!hasWords(html)) return;
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    emit();
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

  const sizedUp = fmt.size !== "3";

  return (
    // Swallow pointer-downs so page-turn swipe gestures never start from
    // inside the editor or its toolbar.
    <div onPointerDownCapture={(e) => e.stopPropagation()}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", marginBottom: 8 }}>
        {sizeMenu ? (
          <>
            {SIZES.map((s) => {
              const active = fmt.size === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  aria-pressed={active}
                  onPointerDown={(e) => e.preventDefault()}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { exec("fontSize", s.value); setSizeMenu(false); }}
                  style={{
                    padding: "5px 12px", borderRadius: 8, cursor: "pointer",
                    background: active ? "rgba(var(--c-accent-rgb), 0.16)" : "var(--c-surface-2)",
                    border: `1px solid ${active ? "rgba(var(--c-accent-rgb), 0.5)" : "var(--c-border-strong)"}`,
                    color: active ? "var(--c-accent)" : "var(--c-text-dim)",
                    fontFamily: "var(--font-ui)",
                    fontWeight: active ? 700 : 400,
                    fontSize: s.value === "2" ? 11 : s.value === "5" ? 15 : 13,
                  }}>
                  {s.label}
                </button>
              );
            })}
            <ToolButton label="Close size menu" onPress={() => setSizeMenu(false)} active>
              <Type size={14} strokeWidth={2} />
            </ToolButton>
          </>
        ) : (
          <>
            <ToolButton label="Bold" active={fmt.bold} onPress={() => exec("bold")}><Bold size={14} strokeWidth={2.4} /></ToolButton>
            <ToolButton label="Italic" active={fmt.italic} onPress={() => exec("italic")}><Italic size={14} strokeWidth={2.2} /></ToolButton>
            <ToolButton label="Underline" active={fmt.underline} onPress={() => exec("underline")}><Underline size={14} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Header" active={fmt.h1} onPress={() => toggleBlock("h1")}><Heading1 size={15} strokeWidth={2} /></ToolButton>
            <ToolButton label="Subheader" active={fmt.h2} onPress={() => toggleBlock("h2")}><Heading2 size={15} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Bullet list" active={fmt.ul} onPress={() => exec("insertUnorderedList")}><List size={15} strokeWidth={2} /></ToolButton>
            <ToolButton label="Numbered list" active={fmt.ol} onPress={() => exec("insertOrderedList")}><ListOrdered size={15} strokeWidth={2} /></ToolButton>
            <span style={{ width: 1, height: 18, background: "var(--c-border)", margin: "0 4px", flexShrink: 0 }} />
            <ToolButton label="Font size" active={sizedUp} onPress={() => setSizeMenu(true)}><Type size={14} strokeWidth={2} /></ToolButton>
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
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
        onInput={onInput}
        onPaste={onPaste}
        onFocus={refreshFmt}
        onKeyUp={refreshFmt}
        onMouseUp={refreshFmt}
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
