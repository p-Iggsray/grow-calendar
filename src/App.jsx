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
    </div>
  );
}
