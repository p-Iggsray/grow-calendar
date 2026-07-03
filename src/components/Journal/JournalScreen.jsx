import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import Timeline from "./Timeline.jsx";
import DaySpread from "./DaySpread.jsx";
import ComposerSheet from "./ComposerSheet.jsx";

// The Journal section of the main screen. Two levels, like dedicated journal
// apps: a timeline home (every journaled day, newest first, with stats and
// search) and a single-day spread you can flip through. A full-screen
// composer writes the day's entry from either level.
export default function JournalScreen({ today, date, onChangeDate, config, growId, onOpenDay, active = true }) {
  const [mode, setMode] = useState("timeline"); // "timeline" | "day"
  const [composerDate, setComposerDate] = useState(null); // Date | null

  return (
    <>
      {mode === "timeline" ? (
        <Timeline
          today={today}
          config={config}
          growId={growId}
          active={active && !composerDate}
          onOpenDate={(d) => { onChangeDate(d); setMode("day"); }}
          onWrite={(d) => setComposerDate(d)}
        />
      ) : (
        <DaySpread
          today={today}
          date={date}
          onChangeDate={onChangeDate}
          config={config}
          growId={growId}
          onOpenDay={onOpenDay}
          onBack={() => setMode("timeline")}
          onWrite={(d) => setComposerDate(d)}
          active={active && !composerDate}
        />
      )}

      <AnimatePresence>
        {composerDate && (
          <ComposerSheet
            date={composerDate}
            growId={growId}
            onClose={() => setComposerDate(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
