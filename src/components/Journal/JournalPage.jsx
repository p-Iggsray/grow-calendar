import { useEffect, useRef, useState } from "react";
import { Pencil, Check, Sparkles } from "lucide-react";
import { MONTH_NAMES } from "../../lib/dates.js";
import { noteToHtml } from "../../lib/richText.js";
import { recordRows } from "../../lib/dayRecord.js";
import { stageGroup, stageLabel } from "../../lib/stageTimeline.js";
import { tapHaptic } from "../../lib/haptics.js";
import RichEntryEditor from "./RichEntryEditor.jsx";

// One day, set as a page rather than served as a form.
//
// Two things were wrong with the entry before. It was always an open editor,
// so a day you had finished writing still looked like an unsaved draft: a
// toolbar, a caret, a box. And the numbers you logged lived in a separate card
// further down, so the page never read as one account of the day.
//
// So: a dateline and a rule, then the day's record set at the head in its own
// panel, then the writing. The entry is prose until you ask to edit it, and the
// toolbar only exists while you are actually typing. Done sets it again.
//
// Nothing here is a second source of truth. The record is the day's own log,
// read out; editing any of it still happens in the log editor below, which is
// what the Edit control on the panel opens.

const UI = "var(--font-ui)";
const BOOK = "var(--font-journal)";
const NUM = "var(--font-num)";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function RecordRow({ row }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
      <span style={{
        fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1,
        textTransform: "uppercase", color: "var(--c-text-muted)",
        width: 62, flexShrink: 0, paddingTop: 1,
        display: "inline-flex", alignItems: "baseline", gap: 3,
      }}>
        {row.label}
        {/* Read out of the writing rather than typed. Marked because a value
            that filled itself in should never look like one you entered. */}
        {row.read && (
          <Sparkles
            size={9}
            strokeWidth={2.4}
            aria-label="read from your entry"
            style={{ color: "var(--c-accent)", flexShrink: 0, alignSelf: "center" }}
          />
        )}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        {row.items
          ? row.items.map((it, i) => (
              <span key={i} style={{ display: "block", fontFamily: UI, fontSize: 13, color: "var(--c-text)", lineHeight: 1.5 }}>
                {it.name}
                {it.amount && (
                  <span style={{ fontFamily: NUM, fontWeight: 600, marginLeft: 7, color: "var(--c-accent)" }}>
                    {it.amount}
                  </span>
                )}
                {it.detail && (
                  <span style={{ color: "var(--c-text-dim)", marginLeft: 7 }}>{it.detail}</span>
                )}
              </span>
            ))
          : (
            <span style={{ fontFamily: UI, fontSize: 13, color: "var(--c-text)", lineHeight: 1.5 }}>
              {row.key === "climate"
                ? <span style={{ fontFamily: NUM, fontWeight: 600 }}>{row.text}</span>
                : row.text}
              {row.source === "forecast" && (
                <span style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", marginLeft: 7 }}>
                  from the sky
                </span>
              )}
            </span>
          )}
      </span>
    </div>
  );
}

export default function JournalPage({
  date, isToday, stage, growDay, note, setNote, noteStatus,
  log, weather, crop, focusSignal = 0, onEditRecord, onFinishWriting,
}) {
  const [editing, setEditing] = useState(false);
  // What was last sent to be read. Finishing without having changed a word
  // costs nothing: there is nothing new to read.
  const lastRead = useRef(null);
  const [reading, setReading] = useState(false);

  async function finishWriting() {
    setEditing(false);
    const text = String(note ?? "");
    if (!onFinishWriting || !text.trim() || text === lastRead.current) return;
    lastRead.current = text;
    setReading(true);
    try { await onFinishWriting(); } finally { setReading(false); }
  }

  // A page turn ends editing: the next day is a different page, and leaving an
  // editor open on it would put the caret somewhere nobody asked for.
  const dateKey = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  useEffect(() => { setEditing(false); lastRead.current = null; }, [dateKey]);
  // A tap on the calendar's "write about today" arrives as a focus signal.
  useEffect(() => { if (focusSignal > 0) setEditing(true); }, [focusSignal]);

  const rows = recordRows({ log, weather, crop });
  const famColor = stage ? stageGroup(stage)?.color : null;
  const written = Boolean(note && note.trim());

  return (
    <article className="card" style={{ padding: "16px 16px 18px" }}>
      {/* The dateline. A page knows what day it is without being asked. */}
      <header>
        <div style={{
          fontFamily: UI, fontSize: 10, fontWeight: 700, letterSpacing: 2,
          textTransform: "uppercase", color: isToday ? "var(--c-accent)" : "var(--c-text-muted)",
        }}>
          {isToday ? "Today" : WEEKDAYS[date.getDay()]}
        </div>
        <h2 style={{
          fontFamily: BOOK, fontSize: 24, fontWeight: 600, letterSpacing: -0.3,
          color: "var(--c-text)", margin: "2px 0 0", lineHeight: 1.2,
        }}>
          {MONTH_NAMES[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
        </h2>
        <div style={{
          display: "flex", alignItems: "center", gap: 8, marginTop: 4,
          fontFamily: UI, fontSize: 11, color: "var(--c-text-faint)",
        }}>
          {stage && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              {famColor && <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 3, background: famColor }} />}
              {stageLabel(stage)}
            </span>
          )}
          {growDay != null && <span style={{ fontFamily: NUM }}>Day {growDay}</span>}
        </div>
        {/* The rule under a masthead: two weights, the way a printed page does it. */}
        <div aria-hidden="true" style={{ marginTop: 11 }}>
          <div style={{ height: 2, background: "var(--c-border-strong)" }} />
          <div style={{ height: 1, background: "var(--c-border-faint)", marginTop: 2 }} />
        </div>
      </header>

      {/* The day's record, set at the head of the page where it can be read
          without wading through the writing. */}
      {reading && rows.length === 0 && (
        <div style={{
          marginTop: 12, padding: "9px 11px", borderRadius: 10,
          background: "var(--c-surface-2)", borderLeft: "3px solid var(--c-border-strong)",
          fontFamily: UI, fontSize: 11.5, color: "var(--c-text-muted)",
        }}>
          Reading your entry for what to log…
        </div>
      )}
      {rows.length > 0 && (
        <section
          aria-label="What was logged on this day"
          style={{
            marginTop: 12, padding: "9px 11px 10px", borderRadius: 10,
            background: "var(--c-surface-2)",
            borderLeft: "3px solid var(--c-accent)",
          }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <span style={{
              flex: 1, fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: 1.6,
              textTransform: "uppercase", color: "var(--c-text-ghost)",
            }}>
              The record
            </span>
            {onEditRecord && (
              <button
                type="button"
                onClick={() => { tapHaptic(); onEditRecord(); }}
                aria-label="Edit this day's log"
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "none", border: "none", padding: "2px 3px", cursor: "pointer",
                  fontFamily: UI, fontSize: 10.5, fontWeight: 600, color: "var(--c-text-muted)",
                }}>
                <Pencil size={10} strokeWidth={2.2} aria-hidden="true" />
                Edit
              </button>
            )}
          </div>
          {rows.map((row) => <RecordRow key={row.key} row={row} />)}
        </section>
      )}

      {/* The writing. Prose until you say otherwise. */}
      <div style={{ marginTop: rows.length > 0 ? 14 : 13 }}>
        {editing ? (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{
                flex: 1, fontFamily: UI, fontSize: 9, fontWeight: 700, letterSpacing: 1.6,
                textTransform: "uppercase", color: "var(--c-text-ghost)",
              }}>
                Writing
              </span>
              <span style={{
                fontFamily: UI, fontSize: 10, letterSpacing: 0.6,
                color: noteStatus === "error" ? "var(--c-danger-soft)" : "var(--c-text-ghost)",
              }}>
                {noteStatus === "saving" ? "Saving…" : noteStatus === "saved" ? "Saved" : noteStatus === "error" ? "Save failed" : ""}
              </span>
              <button
                type="button"
                onClick={() => { tapHaptic(); finishWriting(); }}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 4,
                  background: "none", border: "1px solid var(--c-border-strong)",
                  borderRadius: 12, padding: "4px 10px", cursor: "pointer",
                  color: "var(--c-accent)", fontFamily: UI, fontSize: 11, fontWeight: 700,
                }}>
                <Check size={11} strokeWidth={2.6} aria-hidden="true" />
                Done
              </button>
            </div>
            <RichEntryEditor
              value={note}
              onChange={setNote}
              placeholder={isToday ? "Write about today in the garden…" : "Write about this day…"}
              focusSignal={editing ? 1 : 0}
              minHeight={120}
            />
          </>
        ) : written ? (
          <>
            {/* The written page. Tapping it starts editing, which is what a
                notebook does; the button below is the same door for anyone not
                using a finger, since headings and lists cannot live inside a
                button element. */}
            <div
              className="rich-entry"
              onClick={() => { tapHaptic(); setEditing(true); }}
              style={{
                fontFamily: BOOK, fontSize: 15.5, lineHeight: 1.85,
                color: "var(--c-text)", wordBreak: "break-word", cursor: "text",
              }}
              dangerouslySetInnerHTML={{ __html: noteToHtml(note) }}
            />
            <button
              type="button"
              onClick={() => { tapHaptic(); setEditing(true); }}
              style={{
                display: "flex", alignItems: "center", gap: 5, marginTop: 10,
                background: "none", border: "none", padding: "2px 3px", cursor: "pointer",
                fontFamily: UI, fontSize: 10.5, fontWeight: 600, letterSpacing: 0.4,
                color: "var(--c-text-ghost)",
              }}>
              <Pencil size={10} strokeWidth={2.2} aria-hidden="true" />
              Edit entry
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => { tapHaptic(); setEditing(true); }}
            style={{
              width: "100%", padding: "13px 14px", borderRadius: 11, cursor: "pointer",
              background: "none", border: "1px dashed var(--c-border-strong)",
              fontFamily: BOOK, fontSize: 14, fontStyle: "italic",
              color: "var(--c-text-ghost)", textAlign: "left",
            }}>
            {isToday ? "Write about today in the garden…" : "Write about this day…"}
          </button>
        )}
      </div>
    </article>
  );
}
