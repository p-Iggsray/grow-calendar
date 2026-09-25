import { MONTH_NAMES } from "../../lib/dates.js";
import { noteToHtml } from "../../lib/richText.js";
import { recordRows } from "../../lib/dayRecord.js";
import { stageGroup, stageLabel, stageOnDate, dayOfGrow } from "../../lib/stageTimeline.js";
import { cropOf } from "../../lib/crops.js";
import { kindLabel, summarizeEntry, HEALTH_MAP } from "../PlantsTab/constants.js";
import { UI, BOOK, NUM, SectionLabel, Rule } from "./chrome.jsx";
import { Photos } from "./BuddyPhotos.jsx";

// "3 photographs, 1 video", leaving out whichever there are none of.
function mediaCount(items) {
  const videos = items.filter((p) => p.kind === "video").length;
  const stills = items.length - videos;
  return [
    stills ? `${stills} ${stills === 1 ? "photograph" : "photographs"}` : "",
    videos ? `${videos} ${videos === 1 ? "video" : "videos"}` : "",
  ].filter(Boolean).join(", ");
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// The same record row the grower reads on their own journal page, minus the
// edit control and the "read from your entry" mark, which are about how the
// number got there rather than what it says.
function RecordRow({ row }) {
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "baseline", padding: "3px 0" }}>
      <span style={{
        fontFamily: UI, fontSize: 9.5, fontWeight: 700, letterSpacing: 1.1,
        textTransform: "uppercase", color: "var(--c-text-muted)",
        width: 62, flexShrink: 0, paddingTop: 1,
      }}>
        {row.label}
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
                {it.detail && <span style={{ color: "var(--c-text-dim)", marginLeft: 7 }}>{it.detail}</span>}
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

// Entries are written against one plant at a time, so they read best gathered
// under the plant they were written about rather than in one flat stream.
function groupByPlant(entries) {
  const groups = [];
  const index = new Map();
  for (const e of entries) {
    const key = e.plantId ?? e.plantName ?? "?";
    if (!index.has(key)) {
      index.set(key, { key, name: e.plantName || "Plant", entries: [] });
      groups.push(index.get(key));
    }
    index.get(key).entries.push(e);
  }
  return groups;
}

function PlantEntry({ entry, crop }) {
  const summary = summarizeEntry(entry);
  const health = entry.health ? HEALTH_MAP[entry.health] : null;
  const body = String(entry.body ?? "").trim();
  // A stage entry's body already reads "Stage -> Flowering", and its kind chip
  // would say the same thing twice.
  const showBody = body && !(entry.kind === "stage" && summary && body.includes(summary));

  return (
    <li style={{ display: "flex", gap: 9, padding: "7px 0", borderTop: "1px solid var(--c-border-faint)" }}>
      <span style={{
        fontFamily: UI, fontSize: 9, letterSpacing: 1, textTransform: "uppercase",
        color: "var(--c-text-faint)", background: "var(--c-surface-2)",
        borderRadius: 5, padding: "3px 6px", height: "fit-content", flexShrink: 0, whiteSpace: "nowrap",
      }}>
        {kindLabel(entry.kind, crop)}
      </span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: UI, fontSize: 13, color: "var(--c-text)", lineHeight: 1.55 }}>
        {summary && (
          <span style={{ fontWeight: 600, color: health?.color || "var(--c-text)" }}>{summary}</span>
        )}
        {entry.height != null && (
          <span style={{ fontFamily: NUM, marginLeft: summary ? 8 : 0, color: "var(--c-accent)" }}>
            {entry.height}{entry.height_unit || ""}
          </span>
        )}
        {showBody && (
          <span style={{ display: "block", color: "var(--c-text-dim)", marginTop: summary ? 2 : 0, wordBreak: "break-word" }}>
            {body}
          </span>
        )}
      </span>
    </li>
  );
}

/**
 * One day of somebody else's grow, read end to end: what the air did and what
 * went in, what they wrote about it, what each plant had done to it, and every
 * picture taken that day.
 */
export default function BuddyDay({ space, day, api, today }) {
  const [y, m, d] = day.date.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const isToday = day.date === today;
  const crop = cropOf(space.survey);
  const stage = stageOnDate(space.stageEvents, day.date);
  const growDay = dayOfGrow(space.firstDate, day.date);
  const famColor = stage ? stageGroup(stage)?.color : null;

  const rows = recordRows({ log: day.log, weather: null, crop });
  const note = String(day.note ?? "").trim();
  const groups = groupByPlant(day.plantEntries ?? []);
  const photos = day.photos ?? [];

  return (
    <article className="card" style={{ padding: "16px 16px 18px" }}>
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
        <Rule style={{ marginTop: 11 }} />
      </header>

      {rows.length > 0 && (
        <section
          aria-label="What was logged on this day"
          style={{
            marginTop: 12, padding: "9px 11px 10px", borderRadius: 10,
            background: "var(--c-surface-2)", borderLeft: "3px solid var(--c-accent)",
          }}>
          <SectionLabel style={{ marginBottom: 4 }}>The record</SectionLabel>
          {rows.map((row) => <RecordRow key={row.key} row={row} />)}
        </section>
      )}

      {note && (
        <div
          className="rich-entry"
          style={{
            marginTop: rows.length > 0 ? 14 : 13,
            fontFamily: BOOK, fontSize: 15.5, lineHeight: 1.85,
            color: "var(--c-text)", wordBreak: "break-word",
          }}
          dangerouslySetInnerHTML={{ __html: noteToHtml(note) }}
        />
      )}

      {groups.length > 0 && (
        <section aria-label="Plant entries" style={{ marginTop: 16 }}>
          <SectionLabel style={{ marginBottom: 6 }}>Plant by plant</SectionLabel>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 10 }}>
              <div style={{ fontFamily: UI, fontSize: 12.5, fontWeight: 750, color: "var(--c-text)" }}>
                {g.name}
              </div>
              <ul style={{ listStyle: "none", margin: "2px 0 0", padding: 0 }}>
                {g.entries.map((e) => <PlantEntry key={e.id} entry={e} crop={crop} />)}
              </ul>
            </div>
          ))}
        </section>
      )}

      {photos.length > 0 && (
        <section aria-label="Photos and videos from this day" style={{ marginTop: 16 }}>
          <SectionLabel style={{ marginBottom: 7 }}>
            {mediaCount(photos)}
          </SectionLabel>
          <Photos photos={photos} api={api} />
        </section>
      )}

      {rows.length === 0 && !note && groups.length === 0 && photos.length === 0 && (
        <div style={{ marginTop: 14, fontFamily: BOOK, fontSize: 14, fontStyle: "italic", color: "var(--c-text-ghost)" }}>
          Nothing was written on this day.
        </div>
      )}
    </article>
  );
}
