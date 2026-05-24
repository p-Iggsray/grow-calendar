import { useCallback, useEffect, useState } from "react";
import { TODAY, daysBetween } from "./lib/dates.js";
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  getGrowProgress,
} from "./lib/growData.js";
import { useAuth } from "./lib/auth.jsx";
import { useCheckoffs } from "./lib/useCheckoffs.js";
import { useDayNote } from "./lib/useDayNote.js";
import { ymd } from "./lib/api.js";

import Header from "./components/Header.jsx";
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
  const [month,    setMonth]    = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  const todayPhase = getPhase(TODAY);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone();
  const daysToNext = nextMs ? daysBetween(nextMs.date, TODAY) : 0;
  const progress   = getGrowProgress();

  const selPhase = selected ? getPhase(selected) : null;
  const selStyle = selPhase ? PHASES[selPhase]    : null;
  const detail   = selected ? getDetail(selected) : null;
  const threats  = selPhase ? getThreatsForPhase(selPhase) : [];

  const { checked, toggle } = useCheckoffs(selected, Boolean(user));
  const { note, setNote, status: noteStatus, flush: flushNote } =
    useDayNote(selected, Boolean(user));

  // Opening a day pushes a history entry so the device/browser back button
  // returns to the calendar instead of leaving the app.
  const openDay = useCallback((date) => {
    setSelected(date);
    window.history.pushState({ growDay: ymd(date) }, "");
  }, []);

  useEffect(() => {
    function onPop() { setSelected(null); }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goBack = useCallback(() => {
    flushNote();
    window.history.back();
  }, [flushNote]);

  function pickDay(date)       { openDay(date); }
  function pickMilestone(date) { setMonth(date.getMonth()); openDay(date); }
  function jumpToday()         { setMonth(TODAY.getMonth()); openDay(TODAY); }

  const chatOverlay = (
    <>
      {!chatOpen && (
        <button
          type="button"
          aria-label="Ask the grow assistant"
          onClick={() => setChatOpen(true)}
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
          🌿 Ask
        </button>
      )}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
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
            onToggle={toggle}
            note={note}
            onChangeNote={setNote}
            onFlushNote={flushNote}
            noteStatus={noteStatus}
            onBack={goBack}
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
      />
      <MilestoneStrip onPick={pickMilestone} />
      <div className="app-screen">
        <Calendar
          month={month}
          setMonth={setMonth}
          selected={selected}
          onPickDay={pickDay}
          onClearSelection={() => setSelected(null)}
        />
        <PhaseLegend />
        <ThreatsReference />
      </div>
      <AuthFooter />
      {chatOverlay}
    </div>
  );
}
