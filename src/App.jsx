import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
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
import { useTheme } from "./lib/useTheme.js";
import { growLocation, strainSummary } from "./lib/growProfile.js";

import Header from "./components/Header.jsx";
import AdminPanel from "./components/AdminPanel.jsx";
import StatsScreen from "./components/StatsScreen.jsx";
import GardenMap from "./components/GardenMap.jsx";
import SetupWizard from "./components/SetupWizard.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import DayView from "./components/DayView.jsx";
import ChatPanel from "./components/ChatPanel.jsx";
import TabBar from "./components/TabBar.jsx";
import MoreScreen from "./components/MoreScreen.jsx";
import GrowsListTab from "./components/GrowsListTab.jsx";
import MjReviewPanel from "./components/MjReviewPanel.jsx";

const SHELL_STYLE = {
  fontFamily: "'Georgia', 'Times New Roman', serif",
  background: "var(--c-bg)",
  minHeight: "100vh",
  color: "var(--c-text)",
};

// Creates a blank grow on first render and calls onReady(id) so the wizard can open.
function NewGrowInitializer({ onReady }) {
  useEffect(() => {
    api.createGrow({ displayName: "My First Grow" })
      .then(({ id }) => onReady(id))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ padding: 24, fontFamily: "'Courier New', monospace", color: "var(--c-text-ghost)", letterSpacing: 4 }}>
      SETTING UP…
    </div>
  );
}

// Bottom padding so scrollable content clears the fixed tab bar.
const TAB_CLEARANCE = "calc(66px + env(safe-area-inset-bottom, 0px))";

// Shared transition configs.
const SLIDE_SPRING  = { type: "spring", damping: 26, stiffness: 280, restDelta: 0.5 };
const PUSH_SPRING   = { type: "spring", damping: 30, stiffness: 260, restDelta: 0.5 };
const FADE_DURATION = { duration: 0.15 };

export default function App() {
  const { user } = useAuth();
  const today    = useToday();
  const online   = useOnlineStatus();
  const { theme, setTheme } = useTheme();
  const { grows, activeGrowId, setActiveGrowId, config, overrides, generatedPlan, phaseOverrides, survey, needsSetup, loading: planLoading, error: planError, reload: reloadPlan } = usePlan();
  const [month,       setMonth]      = useState(() => today.getMonth());
  const [selected,    setSelected]   = useState(null);
  const [activeTab,   setActiveTab]  = useState("calendar");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [taskEditing,   setTaskEditing]   = useState(false);
  const [chatContext,   setChatContext]   = useState(null);
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [showStats,     setShowStats]     = useState(false);
  const [showMap,       setShowMap]       = useState(false);
  const [reviewPending, setReviewPending] = useState(false);
  const [wizardGrowId,  setWizardGrowId]  = useState(null); // growId for SetupWizard

  const { taskStates, loading: checkoffsLoading, toggle, setTaskState } = useCheckoffs(selected, Boolean(user));
  const { counts: monthCheckoffCounts } = useMonthCheckoffs(today.getFullYear(), month, Boolean(user));
  const { note, setNote, status: noteStatus, flush: flushNote } =
    useDayNote(selected, Boolean(user));

  const openDay = useCallback((date) => {
    setSelected(date);
    window.history.pushState({ growDay: ymd(date) }, "", `?d=${ymd(date)}`);
  }, []);

  useEffect(() => {
    function onPop() {
      setSelected(null);
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

  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !config) return;
    const url = new URL(window.location.href);
    const d = url.searchParams.get("d");
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const [y, m, day] = d.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    if (Number.isNaN(date.getTime())) return;
    if (!getPhase(date, config)) return;
    deepLinkApplied.current = true;
    setMonth(date.getMonth());
    openDay(date);
  }, [config, openDay]);

  // Lock body scroll while chat is open.
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

  // wizardGrowId is set whenever we want to show SetupWizard (new user or new grow).
  if (wizardGrowId) {
    return (
      <div style={SHELL_STYLE}>
        <SetupWizard
          growId={wizardGrowId}
          onComplete={() => {
            setWizardGrowId(null);
            // For a fresh user (needsSetup), show MJ review after wizard.
            if (needsSetup) {
              setReviewPending(true);
            }
            reloadPlan();
          }}
          onCancel={needsSetup ? undefined : () => {
            setWizardGrowId(null);
          }}
        />
      </div>
    );
  }

  if (needsSetup) {
    // No grows yet — create one and open the wizard.
    // We trigger this by setting wizardGrowId, but we need a grow to exist first.
    // Show a transitional state while we create the grow.
    return (
      <div style={SHELL_STYLE}>
        <NewGrowInitializer onReady={(id) => setWizardGrowId(id)} />
      </div>
    );
  }

  if (reviewPending && config) {
    return (
      <div style={SHELL_STYLE}>
        <MjReviewPanel
          activeGrowId={activeGrowId}
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
  const dayEditedTasks = selected ? (overrides?.[ymd(selected)]?.editedTasks ?? {}) : {};
  const threats     = selPhase ? getThreatsForPhase(selPhase, generatedPlan) : [];
  const todayThreats = todayPhase ? getThreatsForPhase(todayPhase, generatedPlan) : [];

  const resolvedCount = Object.keys(taskStates).length;
  const suggestions = buildSuggestions({
    detail,
    resolvedCount,
    threats: chatContext ? threats : todayThreats,
    contextDate: chatContext,
    today,
  });

  async function handleEditTaskForDay(taskIndex, text) {
    await api.patchGrowDay(activeGrowId, ymd(selected), { editedTasks: { [taskIndex]: text } });
    reloadPlan();
  }

  async function handleEditTaskForPhase(taskIndex, text) {
    if (!selPhase) return;
    const currentTasks =
      phaseOverrides?.[selPhase]?.tasks ??
      generatedPlan?.phases?.[selPhase]?.tasks ??
      [];
    const newTasks = [...currentTasks];
    newTasks[taskIndex] = text;
    await api.saveGrowPhase(activeGrowId, selPhase, { tasks: newTasks });
    reloadPlan();
  }

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
      setActiveTab("today");
      jumpToday();
    } else if (tabId === "mj") {
      openChat();
    } else if (tabId === "calendar") {
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

  // Key for the tab content AnimatePresence — drives crossfade between screens.
  const tabKey = activeTab === "plan" ? "plan" : activeTab === "more" ? "more" : "calendar";

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

      {/* Tab content — crossfades between Calendar, Plan, and More */}
      <div style={{ paddingBottom: TAB_CLEARANCE }}>
        <AnimatePresence mode="wait">
          {tabKey === "more" ? (
            <motion.div
              key="more"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <MoreScreen
                isAdmin={user?.role === "admin"}
                onOpenAdmin={() => setShowAdmin(true)}
                onOpenStats={() => setShowStats(true)}
                onOpenMap={() => setShowMap(true)}
                onBeforeSignOut={flushNote}
                theme={theme}
                setTheme={setTheme}
              />
            </motion.div>
          ) : tabKey === "plan" ? (
            <motion.div
              key="plan"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <GrowsListTab
                grows={grows}
                activeGrowId={activeGrowId}
                setActiveGrowId={setActiveGrowId}
                onNewGrow={(growId) => setWizardGrowId(growId)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <Header
                todayStyle={todayStyle}
                nextMs={nextMs}
                daysToNext={daysToNext}
                progress={progress}
                location={growLocation(survey)}
                strains={strainSummary(survey, generatedPlan)}
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
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DayView — slides up as a fixed overlay over everything */}
      <AnimatePresence>
        {(activeTab === "calendar" || activeTab === "today") && selected && (
          <motion.div
            key="dayview"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={SLIDE_SPRING}
            style={{
              position: "fixed", inset: 0, zIndex: 20,
              background: "var(--c-bg)", overflowY: "auto",
              paddingBottom: TAB_CLEARANCE,
            }}
          >
            <DayView
              activeGrowId={activeGrowId}
              selected={selected}
              detail={detail}
              selStyle={selStyle}
              selPhase={selPhase}
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
              dayEditedTasks={dayEditedTasks}
              onEditTaskForDay={handleEditTaskForDay}
              onEditTaskForPhase={handleEditTaskForPhase}
              onTaskEditActiveChange={setTaskEditing}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat panel — slides up as a fixed full-screen overlay */}
      <AnimatePresence>
        {chatOpen && (
          <ChatPanel
            key="chat"
            onClose={closeChat}
            contextDate={chatContext}
            activeGrowId={activeGrowId}
            grows={grows}
            suggestions={suggestions}
          />
        )}
      </AnimatePresence>

      {/* Full-screen panels — slide in from the right */}
      <AnimatePresence>
        {showAdmin && (
          <motion.div
            key="admin"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PUSH_SPRING}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-bg)", overflowY: "auto" }}
          >
            <AdminPanel onClose={() => setShowAdmin(false)} />
          </motion.div>
        )}
        {showStats && (
          <motion.div
            key="stats"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PUSH_SPRING}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-bg)", overflowY: "auto" }}
          >
            <StatsScreen config={config} today={today} onClose={() => setShowStats(false)} />
          </motion.div>
        )}
        {showMap && (
          <motion.div
            key="map"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PUSH_SPRING}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-bg)", overflowY: "auto" }}
          >
            <GardenMap config={config} today={today} onClose={() => setShowMap(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar — hidden while chat or task-edit sheet is open */}
      {!chatOpen && !taskEditing && (
        <TabBar
          activeTab={activeTab}
          onTab={handleTab}
        />
      )}
    </div>
  );
}
