import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Droplets, Sprout, LayoutGrid, CloudSun } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { sameDay } from "../../lib/dates.js";
import { useJournalDay, useJournalMonth } from "../../lib/useJournal.js";
import { useDayNote } from "../../lib/useDayNote.js";
import { dayOfGrow, stageOnDate } from "../../lib/stageTimeline.js";
import { kindLabel, summarizeEntry, HEALTH_MAP } from "../PlantsTab/constants.js";
import { Skeleton } from "../Skeleton.jsx";
import { tapHaptic } from "../../lib/haptics.js";
import JournalPage from "./JournalPage.jsx";
import ScreenHeader from "../ScreenHeader.jsx";
import PhotosCard from "./PhotosCard.jsx";
import RemindersCard from "./RemindersCard.jsx";
import ConditionsCard from "./ConditionsCard.jsx";
import DayLogEditor from "./DayLogEditor.jsx";
import { readsOwnClimate } from "../../lib/growEnvironment.js";
import { words } from "../../lib/crops.js";

const UI = "var(--font-ui)";
const NUM = "var(--font-num)";
const BOOK = "var(--font-journal)";

function NavButton({ onClick, children, label }) {
  return (
    <button
      type="button"
      className="touch-target"
      aria-label={label}
      onClick={onClick}
      style={{
        width: 42, height: 42, borderRadius: 21, flexShrink: 0,
        background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
        color: "var(--c-text-dim)", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
      {children}
    </button>
  );
}

function Card({ title, icon, action, children }) {
  return (
    <div className="card" style={{ padding: "14px 14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 11 }}>
        {icon}
        <span style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
          color: "var(--c-text-muted)", flex: 1,
        }}>
          {title}
        </span>
        {action}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value, unit }) {
  return (
    <div style={{
      flex: "1 1 30%", minWidth: 86, padding: "9px 11px", borderRadius: 10,
      background: "var(--c-surface-2)", border: "1px solid var(--c-border-faint)",
    }}>
      <div style={{ fontFamily: UI, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase", color: "var(--c-text-ghost)" }}>
        {label}
      </div>
      <div style={{ fontFamily: NUM, fontSize: 17, color: "var(--c-text)", marginTop: 2 }}>
        {value}
        {unit && <span style={{ fontSize: 11, color: "var(--c-text-muted)", marginLeft: 3 }}>{unit}</span>}
      </div>
    </div>
  );
}

// A single day's page: the written entry edited in place, the day's reminders,
// the daily log (edited right here), and every plant's entries. Swipe (or use
// the arrows) to turn the page; the LayoutGrid button zooms out to the
// all-days timeline. This IS the day surface - tapping a calendar day lands
// here.
export default function DaySpread({
  today, date, onChangeDate, stageEvents = [], firstDate = null, growId, onOpenPlant, onZoomOut, onExit,
  plants = [], environment = "outdoor", crop, focusSignal = 0, active = true,
}) {
  const w = words(crop);
  const dateKey = ymd(date);
  const monthKey = dateKey.slice(0, 7);
  const { day, loading } = useJournalDay(dateKey, active, growId);
  const monthDays = useJournalMonth(monthKey, active, growId);
  const { note, setNote, status: noteStatus, flush: flushNote } = useDayNote(date, active, growId);
  const dateInputRef = useRef(null);
  const [dir, setDir] = useState(0); // -1 back, 1 forward: drives the page-turn slide
  // The structured log opens for editing in place; collapses on page turn.
  const [editingLog, setEditingLog] = useState(false);
  useEffect(() => { setEditingLog(false); }, [dateKey, growId]);

  // The stage this day was in, read back out of the recorded switches.
  const stage = firstDate && dateKey >= firstDate ? stageOnDate(stageEvents, dateKey) : null;
  const isToday = sameDay(date, today);
  const growDay = dayOfGrow(firstDate, dateKey);

  function go(delta) {
    tapHaptic();
    setDir(delta);
    onChangeDate(new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta));
  }
  function jumpTo(key) {
    const [y, m, d] = (key || "").split("-").map(Number);
    if (!y || !m || !d) return;
    tapHaptic();
    setDir(key > dateKey ? 1 : -1);
    onChangeDate(new Date(y, m - 1, d));
  }
  function openPicker() {
    const el = dateInputRef.current;
    if (!el) return;
    if (typeof el.showPicker === "function") { try { el.showPicker(); return; } catch { /* fall through */ } }
    el.click();
  }

  const entryDays = Object.keys(monthDays).sort();
  const log = day.log;
  // What was logged is read out at the head of the page now, by the record
  // panel, so none of the folding that used to happen here belongs here any
  // more - it lives in dayRecord.js, where it is tested.

  // Group plant entries by plant for a tidy per-plant read.
  const groups = [];
  {
    const byPlant = new Map();
    for (const e of day.plantEntries) {
      if (!byPlant.has(e.plantName)) { byPlant.set(e.plantName, []); groups.push({ name: e.plantName, entries: byPlant.get(e.plantName) }); }
      byPlant.get(e.plantName).push(e);
    }
  }

  return (
    <>
      <ScreenHeader
        title="Journal"
        onBack={onExit}
        backLabel="Back to the calendar"
        right={(
          <button
            type="button"
            className="touch-target"
            onClick={() => { tapHaptic(); onZoomOut(); }}
            style={{
              display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              padding: "9px 13px", borderRadius: 19, cursor: "pointer",
              background: "var(--c-surface-2)", border: "none",
              color: "var(--c-text)", fontFamily: UI, fontSize: 12, fontWeight: 600,
            }}>
            <LayoutGrid size={14} strokeWidth={2} />
            All days
          </button>
        )}
      />

    <div style={{ padding: "10px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Date pager */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NavButton label="Previous day" onClick={() => go(-1)}>
          <ChevronLeft size={19} strokeWidth={2} />
        </NavButton>
        {/* Navigation only. The page below carries its own dateline, stage and
            day count, so repeating them here would print the same header
            twice, one above the other. */}
        <button
          type="button"
          onClick={openPicker}
          aria-label="Jump to another day"
          style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            padding: "6px 0", textAlign: "center",
            fontFamily: UI, fontSize: 11.5, fontWeight: 600, letterSpacing: 0.3,
            color: "var(--c-text-muted)",
          }}>
          Jump to a day
        </button>
        <NavButton label="Next day" onClick={() => go(1)}>
          <ChevronRight size={19} strokeWidth={2} />
        </NavButton>
        {/* Hidden native date input drives jump-to-any-day. */}
        <input
          ref={dateInputRef}
          type="date"
          value={dateKey}
          onChange={e => jumpTo(e.target.value)}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      {/* Days in this month that hold entries - quick jumps */}
      {entryDays.length > 0 && (
        <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "2px 2px 4px", WebkitOverflowScrolling: "touch" }}>
          {entryDays.map(k => {
            const info = monthDays[k];
            const isActive = k === dateKey;
            return (
              <button
                key={k}
                type="button"
                onClick={() => jumpTo(k)}
                style={{
                  flexShrink: 0, minWidth: 44, padding: "7px 9px 6px", borderRadius: 11,
                  background: isActive ? "rgba(34,197,94,0.14)" : "var(--c-surface-1)",
                  border: isActive ? "1px solid rgba(34,197,94,0.45)" : "1px solid var(--c-border-faint)",
                  cursor: "pointer",
                }}>
                <div style={{ fontFamily: NUM, fontSize: 13.5, color: isActive ? "var(--c-accent)" : "var(--c-text-dim)" }}>
                  {Number(k.slice(8, 10))}
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 3, marginTop: 3, minHeight: 4 }}>
                  {info.log && <span style={{ width: 4, height: 4, borderRadius: 2, background: "var(--c-accent)" }} />}
                  {info.note && <span style={{ width: 4, height: 4, borderRadius: 2, background: "#60a5fa" }} />}
                  {info.plants > 0 && <span style={{ width: 4, height: 4, borderRadius: 2, background: "#c084fc" }} />}
                  {info.photos > 0 && <span style={{ width: 4, height: 4, borderRadius: 2, background: "#fbbf24" }} />}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* The page itself: swipe horizontally to turn to the previous/next day.
          key change slides the new page in from the swipe direction. */}
      <motion.div
        key={dateKey}
        initial={dir === 0 ? false : { x: dir > 0 ? 56 : -56, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        drag={editingLog ? false : "x"}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.16}
        onDragEnd={(e, info) => {
          if (info.offset.x < -70 || info.velocity.x < -600) go(1);
          else if (info.offset.x > 70 || info.velocity.x > 600) go(-1);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* First thing on the page: what you meant to do today. */}
        <RemindersCard date={date} growId={growId} events={day.events} today={today} />

        {/* The day, set as a page: its dateline, the record of what was logged,
            and the writing. Read as prose until you ask to edit it. */}
        <JournalPage
          date={date}
          isToday={isToday}
          stage={stage}
          growDay={growDay}
          note={note}
          setNote={setNote}
          noteStatus={noteStatus}
          log={log}
          weather={day.weather}
          crop={crop}
          focusSignal={focusSignal}
          onEditRecord={() => setEditingLog(true)}
          onFinishWriting={async () => {
            // The note has to be on the server before it can be read there, so
            // the pending autosave is flushed rather than raced.
            await flushNote();
            const res = await api.readJournalEntry(dateKey, growId);
            // Anything found lands in this day's log, so the page and every
            // other journal surface refetch.
            if (res?.found) window.dispatchEvent(new CustomEvent("growlog-mutated"));
          }}
        />

        {/* The day's photos + the journal's add-a-photo action. */}
        <PhotosCard date={date} growId={growId} photos={day.photos} plants={plants} />

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={92} radius={14} />
            <Skeleton height={64} radius={14} />
          </div>
        ) : (
          <>
            {/* The day's weather, documented automatically from the grow's
                location - no hand-logging needed. */}
            {day.weather && (day.weather.high != null || day.weather.low != null || day.weather.humidity != null) && (
              <Card title="Weather" icon={<CloudSun size={13} strokeWidth={2} style={{ color: "var(--c-warn)" }} />}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {day.weather.high != null && <Stat label="High" value={day.weather.high} unit="F" />}
                  {day.weather.low != null && <Stat label="Low" value={day.weather.low} unit="F" />}
                  {day.weather.humidity != null && <Stat label="Humidity" value={day.weather.humidity} unit="%" />}
                  {day.weather.precip != null && day.weather.precip > 0 && (
                    <Stat label="Rain" value={day.weather.precip} unit="in" />
                  )}
                </div>
                <div style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 9, lineHeight: 1.5 }}>
                  Logged automatically for your grow&rsquo;s location{isToday ? " (updates through the day)" : ""}.
                </div>
              </Card>
            )}
            {/* A space with its own climate gets read off its own instruments,
                every day, right here rather than buried in the daily log. */}
            {readsOwnClimate(environment) && (
              <ConditionsCard date={date} growId={growId} environment={environment} crop={crop} active={active} />
            )}

            {/* Never fail silently: say WHY there is no weather card. Only
                asked of a space the weather actually describes. */}
            {!day.hasWeatherLocation && !readsOwnClimate(environment) && (
              <div style={{
                fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)",
                textAlign: "center", lineHeight: 1.6, padding: "2px 10px",
              }}>
                Add your grow&rsquo;s location (banner on the Calendar page) and each day will log its weather here automatically.
              </div>
            )}

            {/* The structured daily log, edited right here on the page. */}
            {editingLog ? (
              <Card
                title="Daily log"
                icon={<Droplets size={13} strokeWidth={2} style={{ color: "var(--c-accent)" }} />}
                action={
                  <button
                    type="button"
                    onClick={() => { tapHaptic(); setEditingLog(false); }}
                    style={{
                      background: "none", border: "1px solid var(--c-border-strong)",
                      borderRadius: 12, padding: "5px 11px", cursor: "pointer",
                      color: "var(--c-accent)", fontFamily: UI, fontSize: 11, fontWeight: 600,
                    }}>
                    Done
                  </button>
                }>
                <DayLogEditor
                  date={date}
                  growId={growId}
                  plants={plants}
                  environment={environment}
                  crop={crop}
                  hasWeatherLocation={day.hasWeatherLocation}
                  active={active}
                />
              </Card>
            ) : !log ? (
              <button
                type="button"
                className="touch-target"
                onClick={() => { tapHaptic(); setEditingLog(true); }}
                style={{
                  width: "100%", padding: "12px 14px", borderRadius: 12,
                  background: "var(--c-surface-1)", border: "1px dashed var(--c-border-strong)",
                  color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5, fontWeight: 600,
                  cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}>
                <Droplets size={13} strokeWidth={2} />
                {`Log this day: ${w.waterField.toLowerCase()}, conditions, health`}
              </button>
            ) : null}

            {/* No read-only log card here any more. What was logged is set at
                the head of the page, in the record panel, and its Edit control
                opens the editor above. One day, one account of it. */}

            {groups.length > 0 && (
              <Card title={`${w.Unit} journal`} icon={<Sprout size={13} strokeWidth={2} style={{ color: "#c084fc" }} />}>
                {groups.map((g, gi) => (
                  <div key={g.name + gi} style={{ marginTop: gi === 0 ? 0 : 13 }}>
                    <button
                      type="button"
                      onClick={() => { tapHaptic(); onOpenPlant?.(g.entries[0]?.plantId); }}
                      disabled={!onOpenPlant || !g.entries[0]?.plantId}
                      style={{
                        display: "flex", alignItems: "center", gap: 4, marginBottom: 4,
                        background: "none", border: "none", padding: 0,
                        cursor: onOpenPlant && g.entries[0]?.plantId ? "pointer" : "default",
                        fontFamily: UI, fontSize: 13.5, fontWeight: 750, color: "var(--c-text)",
                      }}>
                      {g.name}
                      {onOpenPlant && g.entries[0]?.plantId && (
                        <ChevronRight size={13} strokeWidth={2.2} style={{ color: "var(--c-text-ghost)" }} />
                      )}
                    </button>
                    {g.entries.map(e => {
                      const summary = summarizeEntry(e);
                      return (
                        <div key={e.id} style={{ padding: "7px 0", borderTop: "1px solid var(--c-border-faint)" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                            <span style={{
                              fontFamily: UI, fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
                              color: e.kind === "health" && e.health ? (HEALTH_MAP[e.health]?.color ?? "var(--c-text-muted)") : "var(--c-text-muted)",
                              flexShrink: 0,
                            }}>
                              {kindLabel(e.kind, crop)}
                            </span>
                            {summary && (
                              <span style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-dim)" }}>{summary}</span>
                            )}
                          </div>
                          {e.body && (
                            <div style={{ fontFamily: BOOK, fontSize: 13.5, color: "var(--c-text-dim)", lineHeight: 1.65, marginTop: 3, whiteSpace: "pre-wrap", overflowWrap: "break-word" }}>
                              {e.body}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </Card>
            )}

            {!log && !editingLog && groups.length === 0 && (
              <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-ghost)", textAlign: "center", padding: "2px 0" }}>
                Nothing recorded on this day yet. Swipe to turn the page.
              </div>
            )}
          </>
        )}
      </motion.div>
    </div>
    </>
  );
}
