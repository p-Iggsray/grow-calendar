import { ChevronRight, Droplets, Scissors, Stethoscope, Camera, PenLine, Sprout } from "lucide-react";
import { MONTH_NAMES } from "../../lib/dates.js";
import { stageGroup, stageLabel, stageOnDate, stageStartedOn, dayOfGrow } from "../../lib/stageTimeline.js";
import { unitLabel } from "../../lib/waterUnits.js";
import { UI, BOOK, NUM, Empty } from "./chrome.jsx";

// What a day amounted to, at a glance. Only the counts that are non-zero get a
// chip, so a quiet day reads as a quiet day rather than as a row of zeroes.
function chipsFor(day, movedTo) {
  const out = [];
  // A day whose only mark is a stage change would otherwise be a bare date.
  if (movedTo) out.push({ key: "stage", Icon: Sprout, text: `moved to ${stageLabel(movedTo)}` });
  const log = day.log;
  if (log?.waterings > 0) out.push({ key: "water", Icon: Droplets, text: `${log.waterings} watered` });
  if (log?.trainings > 0) out.push({ key: "train", Icon: Scissors, text: `${log.trainings} trained` });
  if (log?.healthChecks > 0) out.push({ key: "health", Icon: Stethoscope, text: `${log.healthChecks} checked` });
  if (day.photos > 0) out.push({ key: "photos", Icon: Camera, text: String(day.photos) });
  if (day.noteExcerpt) out.push({ key: "wrote", Icon: PenLine, text: "written" });
  return out;
}

function waterLine(log) {
  if (!log || log.water_gal == null) return null;
  return `${log.water_gal} ${unitLabel(log.water_unit || "gal")}`;
}

function DayRow({ day, space, onOpen }) {
  const [y, m, d] = day.date.split("-").map(Number);
  const stage = stageOnDate(space.stageEvents, day.date);
  const color = stage ? stageGroup(stage)?.color : null;
  const growDay = dayOfGrow(space.firstDate, day.date);
  // The stage that began on this exact day, if one did.
  const movedTo = stageStartedOn(space.stageEvents, day.date) === day.date ? stage : null;
  const chips = chipsFor(day, movedTo);
  const water = waterLine(day.log);

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(day.date)}
        style={{
          display: "flex", gap: 11, width: "100%", textAlign: "left",
          padding: "13px 14px", background: "none", cursor: "pointer",
          border: "none", borderTop: "1px solid var(--c-border-faint)",
        }}>
        <span aria-hidden="true" style={{
          width: 3, alignSelf: "stretch", borderRadius: 3, flexShrink: 0,
          background: color || "var(--c-border-strong)",
        }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 750, color: "var(--c-text)" }}>
              {MONTH_NAMES[m - 1]} {d}
            </span>
            <span style={{ fontFamily: NUM, fontSize: 11, color: "var(--c-text-ghost)" }}>
              {growDay != null ? `Day ${growDay}` : y}
            </span>
            {water && (
              <span style={{ fontFamily: NUM, fontSize: 11.5, color: "var(--c-accent)", marginLeft: "auto" }}>
                {water}
              </span>
            )}
          </span>

          {day.noteExcerpt && (
            <span style={{
              marginTop: 4, fontFamily: BOOK, fontSize: 13.5,
              lineHeight: 1.6, color: "var(--c-text-dim)",
              // Two lines of the writing is enough to know whether to open it.
              display: "-webkit-box", overflow: "hidden",
              WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            }}>
              {day.noteExcerpt}
            </span>
          )}

          {chips.length > 0 && (
            <span style={{ display: "flex", flexWrap: "wrap", gap: "5px 9px", marginTop: 6 }}>
              {chips.map(({ key, Icon, text }) => (
                <span key={key} style={{
                  display: "inline-flex", alignItems: "center", gap: 3.5,
                  fontFamily: UI, fontSize: 10.5, color: "var(--c-text-faint)",
                }}>
                  <Icon size={11} strokeWidth={2} aria-hidden="true" />
                  {text}
                </span>
              ))}
            </span>
          )}
        </span>
        <ChevronRight
          size={16}
          strokeWidth={2}
          aria-hidden="true"
          style={{ color: "var(--c-text-ghost)", alignSelf: "center", flexShrink: 0 }}
        />
      </button>
    </li>
  );
}

/**
 * The whole grow, newest day first, as a scroll rather than a calendar. This
 * is the view for reading somebody's grow back to front without knowing which
 * dates to guess at.
 */
export default function BuddyTimeline({ space, days, hasMore, loading, onMore, onOpenDay }) {
  if (!days.length && !loading) {
    return <Empty>Nothing has been written in this space yet.</Empty>;
  }

  return (
    <div style={{
      background: "var(--c-surface-1)", borderRadius: 14,
      border: "1px solid var(--c-border-soft)", overflow: "hidden",
    }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {days.map((day) => (
          <DayRow key={day.date} day={day} space={space} onOpen={onOpenDay} />
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          onClick={onMore}
          disabled={loading}
          style={{
            display: "block", width: "100%", padding: "13px 14px",
            background: "none", border: "none", borderTop: "1px solid var(--c-border-faint)",
            cursor: loading ? "default" : "pointer", fontFamily: UI, fontSize: 12,
            fontWeight: 650, letterSpacing: 0.4, color: "var(--c-accent)",
          }}>
          {loading ? "Loading…" : "Read further back"}
        </button>
      )}
    </div>
  );
}
