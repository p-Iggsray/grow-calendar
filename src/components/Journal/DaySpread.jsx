import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, PenLine, Droplets, Sprout, CalendarDays, LayoutGrid } from "lucide-react";
import { ymd } from "../../lib/api.js";
import { sameDay, MONTH_NAMES } from "../../lib/dates.js";
import { getPhase, PHASES, phaseFamily } from "../../lib/growData.js";
import { useJournalDay, useJournalMonth } from "../../lib/useJournal.js";
import { useDayNote } from "../../lib/useDayNote.js";
import { dayOfGrow } from "../../lib/journalStats.js";
import { kindLabel, summarizeEntry, HEALTH_MAP } from "../PlantsTab/constants.js";
import { Skeleton } from "../Skeleton.jsx";
import { tapHaptic } from "../../lib/haptics.js";
import RichEntryEditor from "./RichEntryEditor.jsx";

const UI = "var(--font-ui)";
const NUM = "var(--font-num)";
const BOOK = "var(--font-journal)";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

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

function PlantRow({ name, children }) {
  return (
    <div style={{
      display: "flex", alignItems: "baseline", gap: 8, padding: "7px 0",
      borderTop: "1px solid var(--c-border-faint)",
    }}>
      <span style={{ fontFamily: UI, fontSize: 13, fontWeight: 650, color: "var(--c-text)", flexShrink: 0 }}>
        {name}
      </span>
      <span style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-dim)", lineHeight: 1.55 }}>
        {children}
      </span>
    </div>
  );
}

// A single day's page: the written entry edited in place, the daily log, and
// every plant's entries. Swipe (or use the arrows) to turn the page; the
// LayoutGrid button zooms out to the all-days timeline. `active` goes false
// while the DayView overlay covers this; flipping back refetches.
export default function DaySpread({
  today, date, onChangeDate, config, growId, onOpenDay, onOpenPlant, onZoomOut, focusSignal = 0, active = true,
}) {
  const dateKey = ymd(date);
  const monthKey = dateKey.slice(0, 7);
  const { day, loading } = useJournalDay(dateKey, active, growId);
  const monthDays = useJournalMonth(monthKey, active, growId);
  const { note, setNote, status: noteStatus } = useDayNote(date, active, growId);
  const dateInputRef = useRef(null);
  const [dir, setDir] = useState(0); // -1 back, 1 forward: drives the page-turn slide

  const phase = config ? getPhase(date, config) : null;
  const famColor = phase ? phaseFamily(phase)?.color : null;
  const isToday = sameDay(date, today);
  const growDay = dayOfGrow(date, config);

  // Let the timeline (and this page's own summaries) refresh after a save.
  useEffect(() => {
    if (noteStatus === "saved") window.dispatchEvent(new CustomEvent("journal-mutated"));
  }, [noteStatus]);

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
  const waterPlants = (log?.water_plants ?? []).filter(w => w && (w.plant || w.plantId));
  const trainingRows = (log?.training ?? []).filter(t => t && (t.action ?? "").trim());
  const healthRows = (log?.plant_health ?? []).filter(h => h && (h.plant || h.plantId || h.color || h.trichomes || h.notes));
  const hasStats = log && (log.water_gal != null || log.temp_high != null || log.temp_low != null || log.humidity != null || log.feed);

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
    <div style={{ padding: "4px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Masthead: journal label + zoom out to all days */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: UI, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "var(--c-text-muted)" }}>
          Grow Journal
        </div>
        <button
          type="button"
          className="touch-target"
          onClick={() => { tapHaptic(); onZoomOut(); }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "8px 13px", borderRadius: 18, cursor: "pointer",
            background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
            color: "var(--c-text-dim)", fontFamily: UI, fontSize: 11.5, fontWeight: 600,
          }}>
          <LayoutGrid size={13} strokeWidth={2} />
          All days
        </button>
      </div>

      {/* Date pager */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <NavButton label="Previous day" onClick={() => go(-1)}>
          <ChevronLeft size={19} strokeWidth={2} />
        </NavButton>
        <button
          type="button"
          onClick={openPicker}
          style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            padding: "4px 0", textAlign: "center", color: "var(--c-text)",
          }}>
          <div style={{ fontFamily: UI, fontSize: 10.5, letterSpacing: 2, textTransform: "uppercase", color: isToday ? "var(--c-accent)" : "var(--c-text-muted)" }}>
            {isToday ? "Today" : WEEKDAYS[date.getDay()]}
          </div>
          <div style={{ fontFamily: UI, fontSize: 19, fontWeight: 800, letterSpacing: -0.3, marginTop: 1 }}>
            {MONTH_NAMES[date.getMonth()]} {date.getDate()}, {date.getFullYear()}
          </div>
          <div style={{ fontFamily: UI, fontSize: 10.5, color: "var(--c-text-ghost)", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            {phase && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                {famColor && <span style={{ width: 6, height: 6, borderRadius: 3, background: famColor, display: "inline-block" }} />}
                {PHASES[phase]?.label}
              </span>
            )}
            {growDay && <span style={{ fontFamily: NUM }}>Day {growDay}</span>}
            <span>Tap to jump</span>
          </div>
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
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.16}
        onDragEnd={(e, info) => {
          if (info.offset.x < -70 || info.velocity.x < -600) go(1);
          else if (info.offset.x > 70 || info.velocity.x > 600) go(-1);
        }}
        style={{ display: "flex", flexDirection: "column", gap: 12 }}
      >
        {/* The written entry, edited in place like a real journal page. */}
        <Card
          title="Entry"
          icon={<PenLine size={13} strokeWidth={2} style={{ color: "#60a5fa" }} />}
          action={
            <span style={{ fontFamily: UI, fontSize: 10, letterSpacing: 1, color: noteStatus === "error" ? "var(--c-danger-soft)" : "var(--c-text-ghost)" }}>
              {noteStatus === "saving" ? "Saving…" : noteStatus === "saved" ? "Saved" : noteStatus === "error" ? "Save failed" : ""}
            </span>
          }>
          <RichEntryEditor
            value={note}
            onChange={setNote}
            placeholder={isToday ? "Write about today in the garden…" : "Write about this day…"}
            focusSignal={focusSignal}
            minHeight={88}
          />
        </Card>

        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Skeleton height={92} radius={14} />
            <Skeleton height={64} radius={14} />
          </div>
        ) : (
          <>
            {log && (
              <Card title="Daily log" icon={<Droplets size={13} strokeWidth={2} style={{ color: "var(--c-accent)" }} />}>
                {hasStats && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                    {log.water_gal != null && <Stat label="Water" value={log.water_gal} unit="gal" />}
                    {log.temp_high != null && <Stat label="Temp high" value={log.temp_high} unit="F" />}
                    {log.temp_low != null && <Stat label="Temp low" value={log.temp_low} unit="F" />}
                    {log.humidity != null && <Stat label="Humidity" value={log.humidity} unit="%" />}
                  </div>
                )}
                {log.feed && (
                  <div style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-dim)", marginTop: hasStats ? 10 : 0, lineHeight: 1.6 }}>
                    <span style={{ color: "var(--c-text-muted)", textTransform: "uppercase", fontSize: 10.5, letterSpacing: 1.2, marginRight: 6 }}>Feed</span>
                    {log.feed}
                  </div>
                )}
                {waterPlants.length > 0 && (
                  <div style={{ marginTop: 11 }}>
                    {waterPlants.map((w, i) => (
                      <PlantRow key={i} name={w.plant || "Plant"}>
                        watered{w.gal ? ` ${w.gal} gal` : ""}
                      </PlantRow>
                    ))}
                  </div>
                )}
                {trainingRows.length > 0 && (
                  <div style={{ marginTop: waterPlants.length ? 0 : 11 }}>
                    {trainingRows.map((t, i) => (
                      <PlantRow key={i} name={t.plant || "Plant"}>{t.action}</PlantRow>
                    ))}
                  </div>
                )}
                {healthRows.length > 0 && (
                  <div style={{ marginTop: waterPlants.length || trainingRows.length ? 0 : 11 }}>
                    {healthRows.map((h, i) => (
                      <PlantRow key={i} name={h.plant || "Plant"}>
                        {[h.color, h.trichomes ? `${h.trichomes} trichomes` : null, h.notes].filter(Boolean).join(" · ") || "health check"}
                      </PlantRow>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {groups.length > 0 && (
              <Card title="Plant journal" icon={<Sprout size={13} strokeWidth={2} style={{ color: "#c084fc" }} />}>
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
                              {kindLabel(e.kind)}
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

            {!log && groups.length === 0 && (
              <div style={{ fontFamily: UI, fontSize: 11.5, color: "var(--c-text-ghost)", textAlign: "center", padding: "2px 0" }}>
                No log or plant entries on this day. Swipe to turn the page.
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* One tap into the full day view: tasks, weather, and structured logging. */}
      <button
        type="button"
        className="touch-target"
        onClick={() => { tapHaptic(); onOpenDay(date); }}
        style={{
          width: "100%", padding: "13px 14px", borderRadius: 12,
          background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.35)",
          color: "var(--c-accent)", fontFamily: UI, fontSize: 12.5, fontWeight: 650,
          letterSpacing: 0.5, cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
        }}>
        <CalendarDays size={14} strokeWidth={2} />
        Open day view: log, tasks, and weather
      </button>
    </div>
  );
}
