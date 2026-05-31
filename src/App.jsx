import { useCallback, useEffect, useRef, useState } from "react";
import { useToday, daysBetween, sameDay } from "./lib/dates.js";
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  getGrowProgress,
  buildMilestones,
} from "./lib/growData.js";
import { useAuth } from "./lib/auth.jsx";
import { usePlan } from "./lib/usePlan.jsx";
import { useCheckoffs } from "./lib/useCheckoffs.js";
import { useMonthCheckoffs } from "./lib/useMonthCheckoffs.js";
import { useDayNote } from "./lib/useDayNote.js";
import { ymd } from "./lib/api.js";

import Header from "./components/Header.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import PhaseLegend from "./components/PhaseLegend.jsx";
import DayView from "./components/DayView.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import ThreatsReference from "./components/ThreatsReference.jsx";
import AuthFooter from "./components/AuthFooter.jsx";

const SHELL_STYLE = {
  fontFamily: "'Georgia', 'Times New Roman', serif",
  background: "#0e1a12",
  minHeight: "100vh",
  paddingBottom: 24,
  color: "#f0ebe0",
};

export default function App() {
  const { user } = useAuth();
  const today    = useToday();
  const { config, overrides, loading: planLoading, error: planError } = usePlan();
  const [month,       setMonth]      = useState(() => today.getMonth());
  const [selected,    setSelected]   = useState(null);
  const [chatOpen,    setChatOpen]   = useState(false);
  const [chatContext, setChatContext] = useState(null); // YYYY-MM-DD of the day open in the app, or null
  const [showAdmin,   setShowAdmin]  = useState(false);

  const { checked, loading: checkoffsLoading, toggle } = useCheckoffs(selected, Boolean(user));
  const { counts: monthCheckoffCounts } = useMonthCheckoffs(today.getFullYear(), month, Boolean(user));
  const { note, setNote, status: noteStatus, flush: flushNote } =
    useDayNote(selected, Boolean(user));

  // Opening a day pushes a history entry so the device/browser back button
  // returns to the calendar instead of leaving the app. The URL gets ?d= so
  // the day is shareable via copy-paste (handled by the mount effect below).
  const openDay = useCallback((date) => {
    setSelected(date);
    window.history.pushState({ growDay: ymd(date) }, "", `?d=${ymd(date)}`);
  }, []);

  useEffect(() => {
    // popstate fires on Back; clear selection and strip ?d= from the URL.
    function onPop() {
      setSelected(null);
      const url = new URL(window.location.href);
      if (url.searchParams.has("d")) {
        url.searchParams.delete("d");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Mount: honor `?d=YYYY-MM-DD` so a shared link opens that day directly.
  // Run once after the plan has loaded (so getPhase can validate the date).
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !config) return;
    const url = new URL(window.location.href);
    const d = url.searchParams.get("d");
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const [y, m, day] = d.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    if (Number.isNaN(date.getTime())) return;
    if (!getPhase(date, config)) return; // outside grow season
    deepLinkApplied.current = true;
    setMonth(date.getMonth());
    openDay(date);
  }, [config, openDay]);

  // Lock body scroll while chat is open. iOS Safari ignores overflow:hidden on
  // the body, so position:fixed + restoring scrollY on close is the reliable fix.
  useEffect(() => {
    if (!chatOpen) return;
    const y = window.scrollY;
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${y}px`;
    document.body.style.width = "100%";
    return () => {
      document.body.style.overflow = "";
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      window.scrollTo(0, y);
    };
  }, [chatOpen]);

  const goBack = useCallback(() => {
    flushNote();
    window.history.back();
  }, [flushNote]);

  if (showAdmin) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen">
          <AdminPanel onClose={() => setShowAdmin(false)} />
        </div>
      </div>
    );
  }

  if (planError) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen" style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "#c98a8a" }}>
          Could not load the grow plan. {planError.message}
        </div>
      </div>
    );
  }
  if (planLoading || !config) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen" style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "#3a5a3a", letterSpacing: 4 }}>
          LOADING PLAN
        </div>
      </div>
    );
  }

  const todayPhase = getPhase(today, config);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone(today, config);
  const daysToNext = nextMs ? daysBetween(nextMs.date, today) : 0;
  const progress   = getGrowProgress(today, config);
  const milestones = buildMilestones(config);

  const selPhase = selected ? getPhase(selected, config) : null;
  const selStyle = selPhase ? PHASES[selPhase]    : null;
  const detail   = selected ? getDetail(selected, config, overrides) : null;
  const threats  = selPhase ? getThreatsForPhase(selPhase) : [];

  function pickDay(date)       { openDay(date); }
  function pickMilestone(date) { setMonth(date.getMonth()); openDay(date); }
  function jumpToday()         { setMonth(today.getMonth()); openDay(today); }

  function openChat() {
    setChatContext(selected ? ymd(selected) : null);
    setChatOpen(true);
  }
  function closeChat() {
    setChatOpen(false);
    setChatContext(null);
  }

  const chatOverlay = (
    <>
      {!chatOpen && (
        <button
          type="button"
          aria-label="Ask the grow assistant"
          onClick={openChat}
          style={{
            position: "fixed", zIndex: 40,
            right: "calc(16px + env(safe-area-inset-right, 0px))",
            bottom: "calc(16px + env(safe-area-inset-bottom, 0px))",
            background: "linear-gradient(160deg, #166534, #22c55e)",
            color: "#0e1a12", border: "1px solid rgba(255,255,255,0.25)",
            borderRadius: 999, padding: "12px 18px", fontSize: 14, fontWeight: 800,
            fontFamily: "'Courier New', monospace", letterSpacing: 0.5, cursor: "pointer",
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
          }}>
          🌿 MJ
        </button>
      )}
      {chatOpen && <ChatPanel onClose={closeChat} contextDate={chatContext} />}
    </>
  );

  if (selected) {
    return (
      <div className="app-shell" style={SHELL_STYLE}>
        <div className="app-screen">
          <DayView
            selected={selected}
            detail={detail}
            selStyle={selStyle}
            threats={threats}
            checked={checked}
            checkoffsLoading={checkoffsLoading}
            onToggle={toggle}
            note={note}
            onChangeNote={setNote}
            onFlushNote={flushNote}
            noteStatus={noteStatus}
            onBack={goBack}
            onJumpToday={sameDay(selected, today) ? null : jumpToday}
          />
        </div>
        {chatOverlay}
      </div>
    );
  }

  return (
    <div className="app-shell" style={SHELL_STYLE}>
      <Header
        todayStyle={todayStyle}
        nextMs={nextMs}
        daysToNext={daysToNext}
        progress={progress}
        onJumpToday={jumpToday}
        onOpenAdmin={user?.role === "admin" ? () => setShowAdmin(true) : null}
      />
      <MilestoneStrip today={today} milestones={milestones} onPick={pickMilestone} />
      <div className="app-screen">
        <Calendar
          today={today}
          month={month}
          setMonth={setMonth}
          selected={selected}
          config={config}
          overrides={overrides}
          checkoffCounts={monthCheckoffCounts}
          onPickDay={pickDay}
          onClearSelection={() => setSelected(null)}
        />
        <PhaseLegend />
        <ThreatsReference />
      </div>
      <AuthFooter onBeforeSignOut={flushNote} />
      {chatOverlay}
    </div>
  );
}
