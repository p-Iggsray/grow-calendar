import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, CalendarDays, BookOpen, Images } from "lucide-react";
import CatMark from "../CatMark.jsx";
import { AppShellSkeleton } from "../LoadingScreens.jsx";
import { useToday } from "../../lib/dates.js";
import { ymd } from "../../lib/api.js";
import { shareApi } from "../../lib/shareApi.js";
import { parseRoute, routeSearch, SHARE_TABS } from "../../lib/shareRoute.js";
import { dayOfGrow, stageGroup, stageLabel, stageOnDate } from "../../lib/stageTimeline.js";
import { UI, NUM, SpaceSwitcher, BuddyPhaseLegend, SectionLabel, Empty } from "./chrome.jsx";
import BuddyCalendar, { useMonthFor } from "./BuddyCalendar.jsx";
import BuddyDay from "./BuddyDay.jsx";
import BuddyTimeline from "./BuddyTimeline.jsx";
import BuddyGallery from "./BuddyGallery.jsx";

const TAB_CHROME = {
  calendar: { label: "Calendar", Icon: CalendarDays },
  journal:  { label: "Journal",  Icon: BookOpen },
  photos:   { label: "Photos",   Icon: Images },
};
const TABS = SHARE_TABS.map((key) => ({ key, ...TAB_CHROME[key] }));

// The view's whole state lives in the URL; see src/lib/shareRoute.js for the
// encoding and why.
function readRoute() {
  return parseRoute(window.location.search);
}

function writeRoute(next, replace) {
  const url = `${window.location.pathname}${routeSearch(next)}`;
  window.history[replace ? "replaceState" : "pushState"](next, "", url);
}

function monthOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default function BuddyView({ token }) {
  const api = useMemo(() => shareApi(token), [token]);
  const today = useToday();
  const todayKey = ymd(today);
  const reduceMotion = useReducedMotion();

  const [spaces, setSpaces] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const [route, setRoute] = useState(readRoute);

  // ── Routing ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onPop = () => setRoute(readRoute());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = useCallback((patch, replace = false) => {
    setRoute((cur) => {
      const next = { ...cur, ...patch };
      writeRoute(next, replace);
      return next;
    });
  }, []);

  // ── The spaces this link opens ────────────────────────────────────────────
  useEffect(() => {
    let live = true;
    api.spaces()
      .then((d) => {
        if (!live) return;
        setSpaces(d.spaces ?? []);
        // A link with no space in its URL, or one naming a space that has since
        // been archived, lands on whichever space the server leads with.
        setRoute((cur) => {
          if (cur.spaceId && (d.spaces ?? []).some((s) => s.id === cur.spaceId)) return cur;
          const next = { ...cur, spaceId: d.defaultSpaceId };
          writeRoute(next, true);
          return next;
        });
      })
      .catch((e) => { if (live) setLoadErr(e.message || "This share link is invalid or has been revoked."); });
    return () => { live = false; };
  }, [api]);

  const space = useMemo(
    () => (spaces ?? []).find((s) => s.id === route.spaceId) ?? null,
    [spaces, route.spaceId],
  );
  const spaceId = space?.id ?? null;

  // ── Calendar ──────────────────────────────────────────────────────────────
  const [month, setMonth] = useMonthFor({ date: route.date, lastDate: space?.lastDate ?? null, today });
  const [monthData, setMonthData] = useState({ key: null, days: {}, loading: false });
  const monthKey = spaceId ? `${spaceId}:${monthOf(month)}` : null;

  useEffect(() => {
    if (!spaceId || route.tab !== "calendar") return;
    let live = true;
    const key = `${spaceId}:${monthOf(month)}`;
    setMonthData((cur) => ({ ...cur, loading: true }));
    api.month(spaceId, monthOf(month))
      .then((d) => { if (live) setMonthData({ key, days: d.days ?? {}, loading: false }); })
      .catch(() => { if (live) setMonthData({ key, days: {}, loading: false }); });
    return () => { live = false; };
  }, [api, spaceId, month, route.tab]);

  // ── Journal scroll ────────────────────────────────────────────────────────
  const [tl, setTl] = useState({ key: null, days: [], hasMore: false, next: null, loading: false });

  const loadTimeline = useCallback((before) => {
    if (!spaceId) return;
    const key = spaceId;
    setTl((cur) => ({ ...cur, loading: true }));
    api.timeline(spaceId, before)
      .then((d) => setTl((cur) => ({
        key,
        // A page that arrives after the reader switched space belongs to the
        // space it was asked for, not to the one now on screen.
        days: before && cur.key === key ? [...cur.days, ...(d.days ?? [])] : (d.days ?? []),
        hasMore: Boolean(d.hasMore),
        next: d.nextBefore ?? null,
        loading: false,
      })))
      .catch(() => setTl((cur) => ({ ...cur, loading: false })));
  }, [api, spaceId]);

  useEffect(() => {
    if (!spaceId || route.tab !== "journal" || tl.key === spaceId) return;
    loadTimeline(null);
  }, [spaceId, route.tab, tl.key, loadTimeline]);

  // ── Gallery ───────────────────────────────────────────────────────────────
  const [gal, setGal] = useState({ key: null, photos: [], hasMore: false, next: null, loading: false });

  const loadPhotos = useCallback((offset) => {
    if (!spaceId) return;
    const key = spaceId;
    setGal((cur) => ({ ...cur, loading: true }));
    api.photos(spaceId, offset)
      .then((d) => setGal((cur) => ({
        key,
        photos: offset && cur.key === key ? [...cur.photos, ...(d.photos ?? [])] : (d.photos ?? []),
        hasMore: Boolean(d.hasMore),
        next: d.nextOffset ?? null,
        loading: false,
      })))
      .catch(() => setGal((cur) => ({ ...cur, loading: false })));
  }, [api, spaceId]);

  useEffect(() => {
    if (!spaceId || route.tab !== "photos" || gal.key === spaceId) return;
    loadPhotos(0);
  }, [spaceId, route.tab, gal.key, loadPhotos]);

  // ── One open day ──────────────────────────────────────────────────────────
  const [day, setDay] = useState(null);
  const [dayErr, setDayErr] = useState("");

  useEffect(() => {
    if (!spaceId || !route.date) { setDay(null); setDayErr(""); return; }
    let live = true;
    setDay(null); setDayErr("");
    api.day(spaceId, route.date)
      .then((d) => { if (live) setDay(d); })
      .catch((e) => { if (live) setDayErr(e.message || "That day could not be loaded."); });
    return () => { live = false; };
  }, [api, spaceId, route.date]);

  // Switching space drops what was loaded for the last one, including any day
  // open on top of it: the same date in another space is another day.
  const pickSpace = useCallback((id) => {
    setMonthData({ key: null, days: {}, loading: false });
    setTl({ key: null, days: [], hasMore: false, next: null, loading: false });
    setGal({ key: null, photos: [], hasMore: false, next: null, loading: false });
    go({ spaceId: id, date: null });
  }, [go]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loadErr) return <Broken message={loadErr} />;
  if (!spaces) return <div style={{ minHeight: "100vh", background: "var(--c-bg)" }}><AppShellSkeleton /></div>;
  if (!space) return <Broken message="Nothing has been shared on this link yet." />;

  // As of the last day anything was written, which is today for a space still
  // being tended and the end of the record for one that is finished.
  const asOf = space.lastDate && space.lastDate < todayKey ? space.lastDate : todayKey;
  const stage = stageOnDate(space.stageEvents, asOf);
  const growDay = dayOfGrow(space.firstDate, asOf);
  const strainNames = (space.survey?.strains ?? []).map((s) => s.name).filter(Boolean);

  return (
    <div style={{
      background: "var(--c-bg)", minHeight: "100vh", paddingBottom: 48,
      fontFamily: UI, color: "var(--c-text)",
    }}>
      <header style={{ background: "var(--c-header-bg)" }}>
        <div className="app-shell" style={{ padding: "calc(16px + env(safe-area-inset-top, 0px)) 18px 14px" }}>
        <div style={{
          fontFamily: UI, fontSize: 11, letterSpacing: 3, color: "var(--c-text-muted)",
          textTransform: "uppercase", marginBottom: 5,
        }}>
          Buddy view · read only
        </div>
        <SpaceSwitcher spaces={spaces} spaceId={space.id} onPick={pickSpace} />
        <div style={{
          display: "flex", flexWrap: "wrap", alignItems: "center", gap: "2px 10px",
          marginTop: 5, fontSize: 11, color: "var(--c-text-muted)",
        }}>
          {stage && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: stageGroup(stage)?.color }}>
              <span aria-hidden="true" style={{
                width: 6, height: 6, borderRadius: 3, background: stageGroup(stage)?.color,
              }} />
              {stageLabel(stage)}
            </span>
          )}
          {growDay != null && <span style={{ fontFamily: NUM }}>Day {growDay}</span>}
          {space.survey?.environment && <span>{space.survey.environment}</span>}
          {asOf !== todayKey && (
            <span style={{ color: "var(--c-text-ghost)" }}>last written {fmtDay(asOf)}</span>
          )}
        </div>
        {strainNames.length > 0 && (
          <div style={{ fontSize: 11, color: "var(--c-text-faint)", marginTop: 3, letterSpacing: 0.3 }}>
            {strainNames.join(" · ")}
          </div>
        )}
        </div>
      </header>

      <nav aria-label="Views" className="app-shell" style={{
        display: "flex", gap: 4, padding: "10px 14px 0",
        position: "sticky", top: 0, zIndex: 10, background: "var(--c-bg)",
      }}>
        {TABS.map(({ key, label, Icon }) => {
          const on = route.tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => go({ tab: key, date: null })}
              aria-current={on ? "page" : undefined}
              style={{
                flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: "9px 6px", borderRadius: 10, cursor: "pointer",
                fontFamily: UI, fontSize: 12.5, fontWeight: on ? 750 : 600,
                color: on ? "var(--c-accent)" : "var(--c-text-muted)",
                background: on ? "rgba(var(--c-accent-rgb), 0.11)" : "none",
                border: `1px solid ${on ? "rgba(var(--c-accent-rgb), 0.28)" : "transparent"}`,
              }}>
              <Icon size={14} strokeWidth={2.1} aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </nav>

      <main className="app-shell" style={{ padding: "14px 14px 0" }}>
        {route.tab === "calendar" && (
          <>
            <BuddyCalendar
              today={today}
              month={month}
              onMonth={setMonth}
              stageEvents={space.stageEvents}
              firstDate={space.firstDate}
              days={monthData.key === monthKey ? monthData.days : {}}
              loading={monthData.loading}
              onOpenDay={(date) => go({ date })}
            />
            {/* A space with nothing in it would otherwise be a grid of grey
                squares and no explanation, which is the same dead end the
                whole calendar used to be. */}
            {!space.lastDate && (
              <Empty>
                Nothing has been written in this space yet. Days fill in here as
                the grower logs them.
              </Empty>
            )}
            <div style={{ marginTop: 14 }}>
              <BuddyPhaseLegend survey={space.survey} />
            </div>
            <StageHistory space={space} todayKey={todayKey} />
          </>
        )}

        {route.tab === "journal" && (
          <BuddyTimeline
            space={space}
            days={tl.key === spaceId ? tl.days : []}
            hasMore={tl.hasMore}
            loading={tl.loading}
            onMore={() => loadTimeline(tl.next)}
            onOpenDay={(date) => go({ date })}
          />
        )}

        {route.tab === "photos" && (
          <BuddyGallery
            photos={gal.key === spaceId ? gal.photos : []}
            hasMore={gal.hasMore}
            loading={gal.loading}
            onMore={() => loadPhotos(gal.next)}
            api={api}
          />
        )}
      </main>

      <footer style={{
        textAlign: "center", marginTop: 26, padding: "0 24px",
        fontFamily: UI, fontSize: 11, color: "var(--c-text-ghost)", letterSpacing: 1,
      }}>
        Read-only buddy view · no account required
      </footer>

      <AnimatePresence>
        {route.date && (
          <motion.div
            key={route.date}
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 26 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "fixed", inset: 0, zIndex: 40, overflowY: "auto",
              background: "var(--c-bg)",
              paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))",
            }}>
            <div style={{
              position: "sticky", top: 0, zIndex: 1, background: "var(--c-bg)",
              borderBottom: "1px solid var(--c-border-faint)",
            }}>
              <div className="app-shell" style={{ padding: "calc(10px + env(safe-area-inset-top, 0px)) 14px 10px" }}>
              <button
                type="button"
                onClick={() => (window.history.length > 1 ? window.history.back() : go({ date: null }))}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 4px",
                  background: "none", border: "none", cursor: "pointer",
                  fontFamily: UI, fontSize: 13, fontWeight: 650, color: "var(--c-accent)",
                }}>
                <ArrowLeft size={16} strokeWidth={2.3} aria-hidden="true" />
                {space.name}
              </button>
              </div>
            </div>
            <div className="app-shell" style={{ padding: "14px" }}>
              {dayErr ? <Empty>{dayErr}</Empty>
                : day ? <BuddyDay space={space} day={day} api={api} today={todayKey} />
                : <Empty>Loading…</Empty>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// "June 20", or "June 20, 2025" once it is not this year.
function fmtDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  const now = new Date();
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long", day: "numeric",
    ...(y === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

// Every stage this space has actually moved through, newest last.
function StageHistory({ space, todayKey }) {
  const events = space.stageEvents ?? [];
  if (!events.length) return null;
  return (
    <section style={{
      marginTop: 16, background: "var(--c-surface-1)", borderRadius: 14,
      border: "1px solid var(--c-border-soft)", padding: "12px 16px 6px",
    }}>
      <SectionLabel style={{ marginBottom: 4, letterSpacing: 2, fontSize: 11 }}>Stage history</SectionLabel>
      {events.map((e) => {
        const day = dayOfGrow(space.firstDate, e.date);
        const [y, m, d] = e.date.split("-").map(Number);
        return (
          <div key={e.date + e.stage} style={{
            display: "flex", alignItems: "center", gap: 9, padding: "8px 0",
            borderTop: "1px solid var(--c-border-faint)",
          }}>
            <span aria-hidden="true" style={{
              width: 8, height: 8, borderRadius: 4, flexShrink: 0,
              background: stageGroup(e.stage)?.color,
            }} />
            <span style={{ fontSize: 13, fontWeight: 650, color: "var(--c-text)", flex: 1 }}>
              {stageLabel(e.stage)}
            </span>
            <span style={{ fontFamily: NUM, fontSize: 11, color: "var(--c-text-muted)", flexShrink: 0 }}>
              {new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "long", day: "numeric" })}
              {e.date === todayKey ? " · today" : day != null ? ` · day ${day}` : ""}
            </span>
          </div>
        );
      })}
    </section>
  );
}

function Broken({ message }) {
  return (
    <div style={{
      minHeight: "100vh", display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      background: "var(--c-bg)", padding: 24, textAlign: "center",
    }}>
      <div style={{ marginBottom: 16 }}><CatMark size={68} lit /></div>
      <div style={{ fontSize: 15, color: "var(--c-text-dim)", fontFamily: UI, lineHeight: 1.7, maxWidth: 320 }}>
        {message}
      </div>
      <div style={{ marginTop: 12, fontSize: 11, color: "var(--c-text-ghost)", fontFamily: NUM, letterSpacing: 1 }}>
        Ask the grower for a fresh link.
      </div>
    </div>
  );
}
