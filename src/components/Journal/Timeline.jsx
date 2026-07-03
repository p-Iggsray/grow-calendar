import { useEffect, useRef, useState } from "react";
import { PenLine, Search, X, BookOpen, Droplets, Thermometer, Sprout, Flame, FlaskConical } from "lucide-react";
import { api, ymd } from "../../lib/api.js";
import { MONTH_NAMES } from "../../lib/dates.js";
import { getPhase, PHASES, phaseFamily } from "../../lib/growData.js";
import { useJournalTimeline } from "../../lib/useJournal.js";
import { journalStreak, dayOfGrow } from "../../lib/journalStats.js";
import { Skeleton } from "../Skeleton.jsx";
import { tapHaptic } from "../../lib/haptics.js";

const UI = "var(--font-ui)";
const NUM = "var(--font-num)";
const BOOK = "var(--font-journal)";
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function keyToDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function StatChip({ icon, children }) {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      padding: "4px 9px", borderRadius: 9,
      background: "var(--c-surface-2)", border: "1px solid var(--c-border-faint)",
      fontFamily: NUM, fontSize: 11, color: "var(--c-text-dim)",
    }}>
      {icon}
      {children}
    </span>
  );
}

// One day in the feed: date block on the left, entry preview on the right,
// phase color as the spine accent. Tap opens the full day spread.
function DayCard({ dayInfo, config, onOpen }) {
  const date = keyToDate(dayInfo.date);
  const phase = config ? getPhase(date, config) : null;
  const famColor = phase ? phaseFamily(phase)?.color : null;
  const log = dayInfo.log;

  return (
    <button
      type="button"
      className="card"
      onClick={() => { tapHaptic(); onOpen(date); }}
      style={{
        display: "flex", gap: 13, width: "100%", textAlign: "left",
        padding: "13px 13px 13px 12px", cursor: "pointer",
        color: "var(--c-text)",
        borderLeft: `3px solid ${famColor ?? "var(--c-border)"}`,
      }}>
      <div style={{ width: 40, flexShrink: 0, textAlign: "center", paddingTop: 1 }}>
        <div style={{ fontFamily: NUM, fontSize: 21, lineHeight: 1.1, color: "var(--c-text)" }}>
          {date.getDate()}
        </div>
        <div style={{ fontFamily: UI, fontSize: 9.5, letterSpacing: 1.4, textTransform: "uppercase", color: "var(--c-text-ghost)", marginTop: 2 }}>
          {WEEKDAYS_SHORT[date.getDay()]}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {dayInfo.noteExcerpt ? (
          <div style={{
            fontFamily: BOOK, fontSize: 14.5, lineHeight: 1.6, color: "var(--c-text)",
            display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical",
            overflow: "hidden", marginBottom: log || dayInfo.plants ? 8 : 0,
          }}>
            {dayInfo.noteExcerpt}
          </div>
        ) : (
          <div style={{ fontFamily: UI, fontSize: 12, color: "var(--c-text-muted)", marginBottom: 8 }}>
            {phase ? PHASES[phase]?.label : "Logged day"}
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {log?.water_gal != null && (
            <StatChip icon={<Droplets size={10.5} strokeWidth={2} style={{ color: "#60a5fa" }} />}>{log.water_gal} gal</StatChip>
          )}
          {(log?.temp_high != null || log?.temp_low != null) && (
            <StatChip icon={<Thermometer size={10.5} strokeWidth={2} style={{ color: "var(--c-warn)" }} />}>
              {log.temp_high ?? "?"}/{log.temp_low ?? "?"}F
            </StatChip>
          )}
          {log?.humidity != null && <StatChip icon={null}>{log.humidity}% RH</StatChip>}
          {log?.feed && (
            <StatChip icon={<FlaskConical size={10.5} strokeWidth={2} style={{ color: "#c084fc" }} />}>fed</StatChip>
          )}
          {(log?.waterings > 0 || log?.trainings > 0 || log?.healthChecks > 0) && (
            <StatChip icon={null}>
              {[
                log.waterings > 0 ? `${log.waterings} watered` : null,
                log.trainings > 0 ? `${log.trainings} trained` : null,
                log.healthChecks > 0 ? `${log.healthChecks} checked` : null,
              ].filter(Boolean).join(" · ")}
            </StatChip>
          )}
          {dayInfo.plants > 0 && (
            <StatChip icon={<Sprout size={10.5} strokeWidth={2} style={{ color: "var(--c-accent)" }} />}>
              {dayInfo.plants} plant {dayInfo.plants === 1 ? "entry" : "entries"}
            </StatChip>
          )}
        </div>
      </div>
    </button>
  );
}

// The journal's home: masthead with stats, a write-today prompt, search, and
// the month-grouped feed of every journaled day.
export default function Timeline({ today, config, growId, active, onOpenDate, onWrite }) {
  const { days, totalDays, hasMore, loading, loadingMore, loadMore } = useJournalTimeline(active, growId);
  const [searchOpen, setSearchOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null); // null = not searching
  const [searching, setSearching] = useState(false);
  const searchRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!searchOpen) { setResults(null); setQ(""); return; }
    searchRef.current?.focus();
  }, [searchOpen]);

  function runSearch(text) {
    setQ(text);
    clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length < 2) { setResults(null); setSearching(false); return; }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      api.searchJournal(trimmed, growId)
        .then((d) => { setResults(d.results || []); })
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 350);
  }

  const todayKey = ymd(today);
  const todayJournaled = days.some((d) => d.date === todayKey);
  const streak = journalStreak(days.map((d) => d.date), today);
  const growDay = dayOfGrow(today, config);

  // Group the feed by month for date-book style section headers.
  const sections = [];
  for (const d of days) {
    const mk = d.date.slice(0, 7);
    if (!sections.length || sections[sections.length - 1].key !== mk) {
      const dt = keyToDate(d.date);
      sections.push({ key: mk, label: `${MONTH_NAMES[dt.getMonth()]} ${dt.getFullYear()}`, items: [] });
    }
    sections[sections.length - 1].items.push(d);
  }

  return (
    <div style={{ padding: "6px 14px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Masthead */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: UI, fontSize: 11, letterSpacing: 3, textTransform: "uppercase", color: "var(--c-text-muted)" }}>
          Grow Journal
        </div>
        <button
          type="button"
          className="touch-target"
          aria-label={searchOpen ? "Close search" : "Search the journal"}
          onClick={() => { tapHaptic(); setSearchOpen(o => !o); }}
          style={{
            width: 36, height: 36, borderRadius: 18, cursor: "pointer",
            background: searchOpen ? "var(--c-surface-2)" : "var(--c-surface-1)",
            border: "1px solid var(--c-border-faint)", color: "var(--c-text-dim)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          {searchOpen ? <X size={15} strokeWidth={2} /> : <Search size={15} strokeWidth={2} />}
        </button>
      </div>

      {/* Search */}
      {searchOpen && (
        <div>
          <input
            ref={searchRef}
            type="search"
            value={q}
            onChange={(e) => runSearch(e.target.value)}
            placeholder="Search notes, feeds, and plant entries…"
            style={{
              width: "100%", boxSizing: "border-box", padding: "12px 14px",
              borderRadius: 12, background: "var(--c-surface-1)",
              border: "1px solid var(--c-border)", outline: "none",
              fontFamily: UI, fontSize: 15, color: "var(--c-text)",
            }}
          />
          {results !== null && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
              {searching && <Skeleton height={54} radius={12} />}
              {!searching && results.length === 0 && (
                <div style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-muted)", textAlign: "center", padding: "14px 0" }}>
                  No entries mention &quot;{q.trim()}&quot;
                </div>
              )}
              {results.map((r) => {
                const dt = keyToDate(r.date);
                return (
                  <button
                    key={r.date}
                    type="button"
                    className="card"
                    onClick={() => { tapHaptic(); onOpenDate(dt); }}
                    style={{ padding: "11px 13px", textAlign: "left", cursor: "pointer", color: "var(--c-text)", width: "100%" }}>
                    <div style={{ fontFamily: NUM, fontSize: 11, color: "var(--c-text-muted)", marginBottom: 4 }}>
                      {MONTH_NAMES[dt.getMonth()].slice(0, 3)} {dt.getDate()}, {dt.getFullYear()}
                    </div>
                    {r.snippets.map((s, i) => (
                      <div key={i} style={{ fontFamily: BOOK, fontSize: 13.5, lineHeight: 1.55, color: "var(--c-text-dim)", marginTop: i ? 3 : 0 }}>
                        {s.source === "plant" && (
                          <span style={{ fontFamily: UI, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: "var(--c-accent)", marginRight: 6 }}>
                            {s.plant}
                          </span>
                        )}
                        {s.source === "feed" && (
                          <span style={{ fontFamily: UI, fontSize: 10.5, letterSpacing: 0.8, textTransform: "uppercase", color: "#c084fc", marginRight: 6 }}>
                            Feed
                          </span>
                        )}
                        {s.text}
                      </div>
                    ))}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!searchOpen && (
        <>
          {/* Stats row */}
          <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
            {growDay && (
              <StatChip icon={<Sprout size={11} strokeWidth={2} style={{ color: "var(--c-accent)" }} />}>
                Day {growDay}
              </StatChip>
            )}
            <StatChip icon={<BookOpen size={11} strokeWidth={2} style={{ color: "#60a5fa" }} />}>
              {totalDays} {totalDays === 1 ? "day" : "days"} journaled
            </StatChip>
            {streak > 1 && (
              <StatChip icon={<Flame size={11} strokeWidth={2} style={{ color: "var(--c-warn)" }} />}>
                {streak} day streak
              </StatChip>
            )}
          </div>

          {/* Write-today prompt, like a journal's open page */}
          <button
            type="button"
            className="card"
            onClick={() => { tapHaptic(); onWrite(today); }}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "15px 15px", width: "100%", textAlign: "left", cursor: "pointer",
              border: "1px dashed var(--c-border-strong)",
            }}>
            <div style={{
              width: 36, height: 36, borderRadius: 18, flexShrink: 0,
              background: "rgba(34,197,94,0.14)", border: "1px solid rgba(34,197,94,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <PenLine size={15} strokeWidth={2} style={{ color: "var(--c-accent)" }} />
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: UI, fontSize: 13.5, fontWeight: 700, color: "var(--c-text)" }}>
                {todayJournaled ? "Keep writing today's entry" : "Write today's entry"}
              </div>
              <div style={{ fontFamily: BOOK, fontSize: 13, fontStyle: "italic", color: "var(--c-text-muted)", marginTop: 2 }}>
                What happened in the garden today?
              </div>
            </div>
          </button>

          {/* Feed */}
          {loading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <Skeleton height={86} radius={14} />
              <Skeleton height={86} radius={14} />
              <Skeleton height={86} radius={14} />
            </div>
          ) : days.length === 0 ? (
            <div className="card" style={{ padding: "36px 20px", textAlign: "center" }}>
              <BookOpen size={26} strokeWidth={1.5} style={{ color: "var(--c-text-ghost)" }} />
              <div style={{ fontFamily: UI, fontSize: 14.5, fontWeight: 700, color: "var(--c-text)", marginTop: 10 }}>
                Your grow journal starts here
              </div>
              <div style={{ fontFamily: UI, fontSize: 12.5, color: "var(--c-text-muted)", marginTop: 6, lineHeight: 1.6 }}>
                Every day you log, note, or record a plant entry becomes a page. Write your first one above.
              </div>
            </div>
          ) : (
            <>
              {sections.map((sec) => (
                <div key={sec.key} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{
                    fontFamily: UI, fontSize: 10.5, letterSpacing: 2.4, textTransform: "uppercase",
                    color: "var(--c-text-ghost)", padding: "6px 2px 0",
                  }}>
                    {sec.label}
                  </div>
                  {sec.items.map((d) => (
                    <DayCard key={d.date} dayInfo={d} config={config} onOpen={onOpenDate} />
                  ))}
                </div>
              ))}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => { tapHaptic(); loadMore(); }}
                  disabled={loadingMore}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 12,
                    background: "var(--c-surface-1)", border: "1px solid var(--c-border-faint)",
                    color: "var(--c-text-dim)", fontFamily: UI, fontSize: 12.5,
                    letterSpacing: 0.5, cursor: loadingMore ? "default" : "pointer",
                    opacity: loadingMore ? 0.6 : 1,
                  }}>
                  {loadingMore ? "Loading…" : "Load earlier days"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
