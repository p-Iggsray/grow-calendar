import { useState } from "react";
import Timeline from "./Timeline.jsx";
import DaySpread from "./DaySpread.jsx";

// The Journal section of the main screen - and the app's day surface: tapping
// a calendar day lands on its page here. Like a paper journal it opens edited
// in place and swiped through day by day; zooming out shows the timeline of
// every journaled day (with stats and search), and tapping any day dives back
// into its page.
export default function JournalScreen({
  today, date, onChangeDate, config, growId, onOpenPlant,
  plants = [], environment = "outdoor", active = true,
}) {
  const [mode, setMode] = useState("day");
  const [focusSignal, setFocusSignal] = useState(0);

  return mode === "timeline" ? (
    <Timeline
      today={today}
      config={config}
      growId={growId}
      active={active}
      onOpenDate={(d) => { setFocusSignal(0); onChangeDate(d); setMode("day"); }}
      onWrite={(d) => { onChangeDate(d); setMode("day"); setFocusSignal(s => s + 1); }}
    />
  ) : (
    <DaySpread
      today={today}
      date={date}
      onChangeDate={onChangeDate}
      config={config}
      growId={growId}
      onOpenPlant={onOpenPlant}
      plants={plants}
      environment={environment}
      onZoomOut={() => setMode("timeline")}
      focusSignal={focusSignal}
      active={active}
    />
  );
}
