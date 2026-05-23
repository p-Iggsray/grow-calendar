import { useState } from "react";
import { TODAY, daysBetween } from "./lib/dates.js";
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  getGrowProgress,
} from "./lib/growData.js";

import Header from "./components/Header.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import PhaseLegend from "./components/PhaseLegend.jsx";
import DetailPanel from "./components/DetailPanel.jsx";
import ThreatsReference from "./components/ThreatsReference.jsx";

export default function App() {
  const [month,    setMonth]    = useState(TODAY.getMonth());
  const [selected, setSelected] = useState(null);
  const [tab,      setTab]      = useState("tasks");

  const todayPhase = getPhase(TODAY);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone();
  const daysToNext = nextMs ? daysBetween(nextMs.date, TODAY) : 0;
  const progress   = getGrowProgress();

  const selPhase = selected ? getPhase(selected) : null;
  const selStyle = selPhase ? PHASES[selPhase]    : null;
  const detail   = selected ? getDetail(selected) : null;
  const threats  = selPhase ? getThreatsForPhase(selPhase) : [];

  function pickDay(date) {
    setSelected(date);
    setTab("tasks");
  }

  function pickMilestone(date) {
    setMonth(date.getMonth());
    setSelected(date);
    setTab("tasks");
  }

  function jumpToday() {
    setMonth(TODAY.getMonth());
    setSelected(TODAY);
    setTab("tasks");
  }

  return (
    <div style={{
      fontFamily: "'Georgia', 'Times New Roman', serif",
      background: "#0e1a12",
      minHeight: "100vh",
      padding: "0 0 48px",
      color: "#f0ebe0",
    }}>
      <Header
        todayStyle={todayStyle}
        nextMs={nextMs}
        daysToNext={daysToNext}
        progress={progress}
        onJumpToday={jumpToday}
      />
      <MilestoneStrip onPick={pickMilestone} />
      <Calendar
        month={month}
        setMonth={setMonth}
        selected={selected}
        onPickDay={pickDay}
        onClearSelection={() => setSelected(null)}
      />
      <PhaseLegend />
      <DetailPanel
        selected={selected}
        detail={detail}
        selStyle={selStyle}
        threats={threats}
        tab={tab}
        setTab={setTab}
      />
      <ThreatsReference />
    </div>
  );
}
