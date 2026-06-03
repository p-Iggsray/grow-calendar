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
import { api, ymd } from "./lib/api.js";
import { buildSuggestions } from "./lib/mjSuggestions.js";
import { useOnlineStatus } from "./lib/useOnlineStatus.js";
import { flushCheckoffQueue } from "./lib/offlineQueue.js";

import Header from "./components/Header.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import StatsScreen from "./components/StatsScreen.jsx";
import SetupWizard from "./components/SetupWizard.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import DayView from "./components/DayView.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import TabBar from "./components/TabBar.jsx";
import MoreScreen from "./components/MoreScreen.jsx";
import PlanScreen from "./components/PlanScreen.jsx";
import MjReviewPanel from "./components/MjReviewPanel.jsx";

const SHELL_STYLE = {
  fontFamily: "'Georgia', 'Times New Roman', serif",
  background: "var(--c-bg)",
  minHeight: "100vh",
  color: "#f0ebe0",
};

// Bottom padding so scrollable content clears the fixed tab bar.
const TAB_CLEARANCE = "calc(66px + env(safe-area-inset-bottom, 0px))";

export default function App() {
  const { user } = useAuth();
  const today    = useToday();
  const online   = useOnlineStatus();
  const { config, overrides, generatedPlan, phaseOverrides, survey, needsSetup, loading: planLoading, error: planError, reload: reloadPlan } = usePlan();
  const [month,       setMonth]      = useState(() => today.getMonth());
  const [selected,    setSelected]   = useState(null);
  const [activeTab,   setActiveTab]  = useState("calendar");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [chatContext,   setChatContext]   = useState(null); // YYYY-MM-DD of the day open in the app, or null
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [showStats,     setShowStats]     = useState(false);
  // Set to true when SetupWizard completes so MjReviewPanel runs before entering the main app.
  const [reviewPending, setReviewPending] = useState(false);

  const { taskStates, loading: checkoffsLoading, toggle, setTaskState } = useCheckoffs(selected, Boolean(user));
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
      // If the "today" tab was active, revert it to calendar so the tab bar
      // reflects the new state (no day selected = calendar grid).
      setActiveTab(prev => prev === "today" ? "calendar" : prev);
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

  // Replay any offline-queued checkoff writes when connectivity returns.
  useEffect(() => {
    if (!online) return;
    flushCheckoffQueue(api.putCheckoffs).catch(() => {});
  }, [online]);

  if (planError) {
    return (
      <div style={SHELL_STYLE}>
        <div style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "#c98a8a" }}>
          Could not load the grow plan. {planError.message}
        </div>
      </div>
    );
  }
  if (planLoading) {
    return (
      <div style={SHELL_STYLE}>
        <div style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "var(--c-text-ghost)", letterSpacing: 4 }}>
          LOADING PLAN
        </div>
      </div>
    );
  }

  if (needsSetup) {
    return (
      <div style={SHELL_STYLE}>
        <SetupWizard
          onComplete={() => { setReviewPending(true); reloadPlan(); }}
        />
      </div>
    );
  }

  // After setup completes, run MJ's quality review before entering the main app.
  if (reviewPending && config) {
    return (
      <div style={SHELL_STYLE}>
        <MjReviewPanel
          onComplete={() => { setReviewPending(false); setActiveTab("plan"); reloadPlan(); }}
          onSkip={() => { setReviewPending(false); setActiveTab("plan"); }}
        />
      </div>
    );
  }

  if (!config) {
    return (
      <div style={SHELL_STYLE}>
        <div style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "var(--c-text-ghost)", letterSpacing: 4 }}>
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

  const selPhase    = selected ? getPhase(selected, config) : null;
  const selStyle    = selPhase ? PHASES[selPhase] : null;
  const detail      = selected ? getDetail(selected, config, overrides, generatedPlan, phaseOverrides) : null;
  const threats     = selPhase ? getThreatsForPhase(selPhase, generatedPlan) : [];
  // Threats for today used when chat is opened from the calendar (no day selected).
  const todayThreats = todayPhase ? getThreatsForPhase(todayPhase, generatedPlan) : [];

  const resolvedCount = Object.keys(taskStates).length;
  const suggestions = buildSuggestions({
    detail,
    resolvedCount,
    threats: chatContext ? threats : todayThreats,
    contextDate: chatContext,
    today,
  });

  function pickDay(date)       { setActiveTab("calendar"); openDay(date); }
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

  function handleTab(tabId) {
    if (tabId === "today") {
      // Keep "today" highlighted while viewing today's DayView.
      setActiveTab("today");
      jumpToday();
    } else if (tabId === "mj") {
      openChat();
    } else if (tabId === "calendar") {
      // Always return to the calendar grid when tapping this tab.
      setSelected(null);
      setActiveTab("calendar");
      if (chatOpen) closeChat();
    } else if (tabId === "plan") {
      setSelected(null);
      setActiveTab("plan");
      if (chatOpen) closeChat();
    } else if (tabId === "more") {
      setSelected(null);
      setActiveTab("more");
      if (chatOpen) closeChat();
    }
  }

  if (showAdmin) {
    return (
      <div style={SHELL_STYLE}>
        <AdminPanel onClose={() => setShowAdmin(false)} />
      </div>
    );
  }

  if (showStats) {
    return (
      <div style={SHELL_STYLE}>
        <StatsScreen config={config} today={today} onClose={() => setShowStats(false)} />
      </div>
    );
  }

  return (
    <div style={SHELL_STYLE}>
      {/* Offline banner */}
      {!online && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(160,50,50,0.95)", backdropFilter: "blur(8px)",
          padding: "8px 16px", textAlign: "center",
          fontFamily: "'Courier New', monospace", fontSize: 10,
          letterSpacing: 1.5, color: "#fecaca",
        }}>
          OFFLINE — changes will sync when reconnected
        </div>
      )}
      {/* Main content area — padded so nothing hides behind the tab bar */}
      <div style={{ paddingBottom: TAB_CLEARANCE }}>
        {/* DayView: shown when a day is selected via either calendar or today tab */}
        {(activeTab === "calendar" || activeTab === "today") && selected ? (
          <DayView
            selected={selected}
            detail={detail}
            selStyle={selStyle}
            threats={threats}
            taskStates={taskStates}
            checkoffsLoading={checkoffsLoading}
            onToggle={toggle}
            onSetTaskState={setTaskState}
            note={note}
            onChangeNote={setNote}
            onFlushNote={flushNote}
            noteStatus={noteStatus}
            onBack={goBack}
            onJumpToday={sameDay(selected, today) ? null : jumpToday}
          />
        ) : activeTab === "more" ? (
          <MoreScreen
            isAdmin={user?.role === "admin"}
            onOpenAdmin={() => setShowAdmin(true)}
            onOpenStats={() => setShowStats(true)}
            onBeforeSignOut={flushNote}
          />
        ) : activeTab === "plan" ? (
          <PlanScreen
            config={config}
            generatedPlan={generatedPlan}
            phaseOverrides={phaseOverrides}
            survey={survey}
            onReload={reloadPlan}
          />
        ) : (
          // Calendar grid — default for "calendar" and fallback for "today" with no selection
          <>
            <Header
              todayStyle={todayStyle}
              nextMs={nextMs}
              daysToNext={daysToNext}
              progress={progress}
            />
            <MilestoneStrip today={today} milestones={milestones} onPick={pickMilestone} />
            <Calendar
              today={today}
              month={month}
              setMonth={setMonth}
              selected={selected}
              config={config}
              overrides={overrides}
              generatedPlan={generatedPlan}
              phaseOverrides={phaseOverrides}
              checkoffCounts={monthCheckoffCounts}
              onPickDay={pickDay}
              onClearSelection={() => setSelected(null)}
            />
          </>
        )}
      </div>

      {/* Chat full-screen overlay — hides tab bar */}
      {chatOpen && (
        <ChatPanel onClose={closeChat} contextDate={chatContext} suggestions={suggestions} />
      )}

      {/* Tab bar — hidden while chat is open */}
      {!chatOpen && (
        <TabBar
          activeTab={activeTab}
          onTab={handleTab}
        />
      )}
    </div>
  );
}
