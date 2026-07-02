import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToday, daysBetween, sameDay } from "./lib/dates.js";
import {
  PHASES,
  getPhase,
  getDetail,
  getThreatsForPhase,
  getNextMilestone,
  buildMilestones,
} from "./lib/growData.js";
import { useAuth } from "./lib/auth.jsx";
import { usePlan } from "./lib/usePlan.jsx";
import { useCheckoffs } from "./lib/useCheckoffs.js";
import { useMonthLog } from "./lib/useMonthLog.js";
import { autoCompleteTasks } from "./lib/autoCompleteTasks.js";
import { useDayNote } from "./lib/useDayNote.js";
import { api, ymd } from "./lib/api.js";
import { buildSuggestions } from "./lib/mjSuggestions.js";
import { useOnlineStatus } from "./lib/useOnlineStatus.js";
import { flushCheckoffQueue } from "./lib/offlineQueue.js";
import { useTheme } from "./lib/useTheme.js";
import { growLocation, strainSummary } from "./lib/growProfile.js";
import { getLifecyclePhase, phaseMeta } from "./lib/lifecycle.js";

import Header from "./components/Header.jsx";
import MilestoneStrip from "./components/MilestoneStrip.jsx";
import Calendar from "./components/Calendar.jsx";
import DayView from "./components/DayView/DayView.jsx";
import TabBar from "./components/TabBar.jsx";
import MoreScreen from "./components/MoreScreen.jsx";
import GrowsListTab from "./components/GrowsListTab.jsx";
import PlantsTab from "./components/PlantsTab/PlantsTab.jsx";
import PhasePrompt from "./components/Lifecycle/PhasePrompt.jsx";
import { AppShellSkeleton, PanelSkeleton } from "./components/LoadingScreens.jsx";

// Heavy, rarely-on-screen panels load on demand so they stay out of the
// initial bundle. The service worker runtime-caches each chunk on first use.
const SetupWizard   = lazy(() => import("./components/SetupWizard/SetupWizard.jsx"));
const ChatPanel     = lazy(() => import("./components/ChatPanel/ChatPanel.jsx"));
const MjReviewPanel = lazy(() => import("./components/MjReviewPanel.jsx"));
const AdminPanel    = lazy(() => import("./components/AdminPanel.jsx"));
const StatsScreen   = lazy(() => import("./components/StatsScreen.jsx"));
const EnvironmentScreen = lazy(() => import("./components/Environment/EnvironmentScreen.jsx"));
const GardenMap     = lazy(() => import("./components/GardenMap.jsx"));
const GrowSettings  = lazy(() => import("./components/GrowSettings.jsx"));
const DryingTracker = lazy(() => import("./components/Lifecycle/DryingTracker.jsx"));
const CuringTracker = lazy(() => import("./components/Lifecycle/CuringTracker.jsx"));
const GrowComplete  = lazy(() => import("./components/Lifecycle/GrowComplete.jsx"));
const ManualTasksSheet = lazy(() => import("./components/ManualTasks/ManualTasksSheet.jsx"));

const SHELL_STYLE = {
  fontFamily: "var(--font-ui)",
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
    <div style={{ padding: 24, fontFamily: "var(--font-ui)", color: "var(--c-text-ghost)", letterSpacing: 4 }}>
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
  const { grows, activeGrowId, setActiveGrowId, config, overrides, generatedPlan, phaseOverrides, eventRules, survey, lifecycle, needsSetup, loading: planLoading, error: planError, reload: reloadPlan } = usePlan();
  const lifecyclePhase = getLifecyclePhase(lifecycle);
  const [month,       setMonth]      = useState(() => today.getMonth());
  const [selected,    setSelected]   = useState(null);
  const [activeTab,   setActiveTab]  = useState("calendar");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [taskEditing,   setTaskEditing]   = useState(false);
  const [pickerActive,  setPickerActive]  = useState(false);
  const [chatContext,   setChatContext]   = useState(null);
  const [showAdmin,     setShowAdmin]     = useState(false);
  const [showStats,     setShowStats]     = useState(false);
  const [showEnv,       setShowEnv]       = useState(false);
  const [showMap,       setShowMap]       = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [settingsGrowId, setSettingsGrowId] = useState(null);
  const [reviewPending, setReviewPending] = useState(false);
  const [wizardGrowId,  setWizardGrowId]  = useState(null); // growId for SetupWizard
  const [manualTasksOpen, setManualTasksOpen] = useState(false);

  const { taskStates, loading: checkoffsLoading, toggle, setTaskState } = useCheckoffs(selected, Boolean(user), activeGrowId);
  const { days: monthLoggedDays } = useMonthLog(today.getFullYear(), month, Boolean(user), activeGrowId);
  const { note, setNote, status: noteStatus, flush: flushNote } =
    useDayNote(selected, Boolean(user), activeGrowId);

  const openDay = useCallback((date) => {
    setSelected(date);
    window.history.pushState({ growDay: ymd(date) }, "", `?d=${ymd(date)}`);
  }, []);

  useEffect(() => {
    function onPop() {
      setSelected(null);
      setActiveTab(prev => prev === "plants" ? "calendar" : prev);
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

  // Tasks are guidance: anything left unchecked quietly completes itself after
  // the day ends. Runs on load and again after the midnight rollover.
  const todayKey = ymd(today);
  useEffect(() => {
    if (planLoading || !config || !activeGrowId || lifecyclePhase !== "growing" || !online) return;
    autoCompleteTasks({ growId: activeGrowId, config, overrides, generatedPlan, phaseOverrides, eventRules, today }).catch(() => {});
  // Reruns per grow and per day; data deps are read fresh on each run.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGrowId, planLoading, todayKey, online]);

  if (planError) {
    return (
      <div style={SHELL_STYLE}>
        <div style={{ padding: 24, fontFamily: "var(--font-ui)", color: "var(--c-danger-soft)" }}>
          Could not load the grow plan. {planError.message}
        </div>
      </div>
    );
  }
  // Only blank to the skeleton on the FIRST load (no config yet). reload() and
  // grow switches also flip planLoading, but we keep the current UI on screen
  // while they refetch so the whole app doesn't flash to a skeleton every time
  // MJ acts, a phase transitions, or a plant is edited.
  if (planLoading && !config) {
    return (
      <div style={SHELL_STYLE}>
        <AppShellSkeleton />
      </div>
    );
  }

  // Show the setup wizard for an explicitly-created new grow (wizardGrowId) OR an
  // existing grow that still needs setup - reuse that grow instead of spawning a
  // duplicate. Only create a brand-new grow (NewGrowInitializer) when there's
  // genuinely nothing to resume.
  const setupGrowId = wizardGrowId
    || (needsSetup && activeGrowId && grows.some(g => g.id === activeGrowId) ? activeGrowId : null);

  if (setupGrowId) {
    // Escapable whenever a configured grow exists to land on - only the literal
    // first-ever grow must be completed. Exiting KEEPS the in-progress grow (it
    // shows as IN SETUP on the Grows tab) and the wizard's autosaved draft, so
    // backing out never loses progress; usePlan prefers configured grows on
    // reload, so the unfinished one can't re-trap the app.
    const canExit = grows.some(g => g.config);
    return (
      <div style={SHELL_STYLE}>
        <Suspense fallback={<PanelSkeleton />}>
        <SetupWizard
          growId={setupGrowId}
          onComplete={(taskMode) => {
            setWizardGrowId(null);
            // Land the user in the grow they just finished setting up.
            setActiveGrowId(setupGrowId);
            // The guided ("first grow") path gets the MJ plan-review onboarding;
            // auto-fill and manual skip it.
            if (taskMode === "guided") {
              setReviewPending(true);
            }
            reloadPlan();
          }}
          onCancel={canExit ? () => {
            setWizardGrowId(null);
            reloadPlan();
          } : undefined}
        />
        </Suspense>
      </div>
    );
  }

  if (needsSetup) {
    // No grow to resume - create the very first one, then open the wizard for it.
    return (
      <div style={SHELL_STYLE}>
        <NewGrowInitializer onReady={(id) => setWizardGrowId(id)} />
      </div>
    );
  }

  if (reviewPending && config) {
    return (
      <div style={SHELL_STYLE}>
        <Suspense fallback={<PanelSkeleton />}>
        <MjReviewPanel
          activeGrowId={activeGrowId}
          onComplete={() => { setReviewPending(false); setActiveTab("plan"); reloadPlan(); }}
          onSkip={() => { setReviewPending(false); setActiveTab("plan"); }}
        />
        </Suspense>
      </div>
    );
  }

  if (!config) {
    return (
      <div style={SHELL_STYLE}>
        <AppShellSkeleton />
      </div>
    );
  }

  const todayPhase = getPhase(today, config);
  const todayStyle = todayPhase ? PHASES[todayPhase] : null;
  const nextMs     = getNextMilestone(today, config);
  const daysToNext = nextMs ? daysBetween(nextMs.date, today) : 0;
  const milestones = buildMilestones(config);

  const selPhase    = selected ? getPhase(selected, config) : null;
  const selStyle    = selPhase ? PHASES[selPhase] : null;
  const detail      = selected ? getDetail(selected, config, overrides, generatedPlan, phaseOverrides, eventRules) : null;
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

  // The rendered task list = generated tasks minus per-day removals, plus
  // per-day additions (see applyDayOverride). Map a rendered index back to its
  // source so edits and removals target the right entry.
  function mapRenderedTask(renderedIdx) {
    const ov = selected ? (overrides?.[ymd(selected)] ?? {}) : {};
    const removed = new Set(ov.removedTasks ?? []);
    const addedCount = (ov.addedTasks ?? []).length;
    const renderedCount = detail?.tasks?.length ?? 0;
    const baseKeptCount = renderedCount - addedCount;
    if (renderedIdx >= baseKeptCount) {
      return { kind: "added", idx: renderedIdx - baseKeptCount };
    }
    let n = -1;
    for (let orig = 0; orig < 500; orig++) {
      if (removed.has(orig)) continue;
      n++;
      if (n === renderedIdx) return { kind: "base", idx: orig };
    }
    return { kind: "base", idx: renderedIdx };
  }

  // Returns { phaseApplicable } so DayView only offers "apply to whole phase"
  // for generated tasks (user-added tasks belong to the day alone).
  async function handleEditTaskForDay(taskIndex, text) {
    const t = mapRenderedTask(taskIndex);
    if (t.kind === "added") {
      await api.patchGrowDay(activeGrowId, ymd(selected), { editAddedTask: { index: t.idx, text } });
    } else {
      await api.patchGrowDay(activeGrowId, ymd(selected), { editedTasks: { [t.idx]: text } });
    }
    reloadPlan();
    return { phaseApplicable: t.kind === "base" };
  }

  async function handleRemoveTaskForDay(taskIndex) {
    const t = mapRenderedTask(taskIndex);
    if (t.kind === "added") {
      await api.patchGrowDay(activeGrowId, ymd(selected), { removeAddedTask: t.idx });
    } else {
      await api.patchGrowDay(activeGrowId, ymd(selected), { removeTask: t.idx });
    }
    reloadPlan();
  }

  async function handleAddTaskForDay(text) {
    await api.patchGrowDay(activeGrowId, ymd(selected), { addTask: text });
    reloadPlan();
  }

  async function handleEditTaskForPhase(taskIndex, text) {
    if (!selPhase) return;
    const t = mapRenderedTask(taskIndex);
    if (t.kind !== "base") return;
    const currentTasks =
      phaseOverrides?.[selPhase]?.tasks ??
      generatedPlan?.phases?.[selPhase]?.tasks ??
      [];
    const newTasks = [...currentTasks];
    newTasks[t.idx] = text;
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
    if (tabId === "plants") {
      setSelected(null);
      setActiveTab("plants");
      if (chatOpen) closeChat();
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

  // Key for the tab content AnimatePresence - drives crossfade between screens.
  const tabKey = activeTab === "plan" ? "plan" : activeTab === "more" ? "more" : activeTab === "plants" ? "plants" : "calendar";

  return (
    <div style={SHELL_STYLE}>
      {/* Offline banner */}
      {!online && (
        <div style={{
          position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
          background: "rgba(160,50,50,0.95)", backdropFilter: "blur(8px)",
          padding: "8px 16px", textAlign: "center",
          fontFamily: "var(--font-ui)", fontSize: 11,
          letterSpacing: 1.5, color: "#fecaca",
        }}>
          OFFLINE - changes will sync when reconnected
        </div>
      )}

      {/* Tab content - crossfades between Calendar, Plan, and More */}
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
                onOpenEnv={() => setShowEnv(true)}
                onOpenSettings={() => { setSettingsGrowId(activeGrowId); setShowSettings(true); }}
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
                onEditGrow={(growId) => { setSettingsGrowId(growId); setShowSettings(true); }}
                onGrowDeleted={reloadPlan}
              />
            </motion.div>
          ) : tabKey === "plants" ? (
            <motion.div
              key="plants"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <PlantsTab />
            </motion.div>
          ) : lifecyclePhase === "drying" ? (
            <motion.div key="drying" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE_DURATION}>
              <Suspense fallback={<PanelSkeleton />}><DryingTracker today={today} /></Suspense>
            </motion.div>
          ) : lifecyclePhase === "curing" ? (
            <motion.div key="curing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE_DURATION}>
              <Suspense fallback={<PanelSkeleton />}><CuringTracker today={today} /></Suspense>
            </motion.div>
          ) : lifecyclePhase === "done" ? (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE_DURATION}>
              <Suspense fallback={<PanelSkeleton />}><GrowComplete onStartNewGrow={() => setActiveTab("plan")} /></Suspense>
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
                growName={grows.find(g => g.id === activeGrowId)?.displayName}
                environment={survey?.environment}
                todayPhase={todayPhase}
                todayStyle={todayStyle}
                nextMs={nextMs}
                daysToNext={daysToNext}
                location={growLocation(survey)}
                strains={strainSummary(survey)}
                config={config}
                today={today}
              />
              {/* Drying entry point - always available, but only prominent once
                  final harvest has passed (`due`). */}
              <PhasePrompt today={today} due={Boolean(config?.hazeHarvest && today >= config.hazeHarvest)} />
              {generatedPlan?.manual && (
                <div style={{ padding: "8px 14px 0" }}>
                  <button
                    type="button"
                    onClick={() => setManualTasksOpen(true)}
                    style={{
                      width: "100%", padding: "12px 14px", borderRadius: 12, minHeight: 46,
                      background: "var(--c-surface-1)", border: "1px solid var(--c-border)",
                      color: "var(--c-text-dim)", fontFamily: "var(--font-ui)",
                      fontSize: 12.5, letterSpacing: 0.5, cursor: "pointer",
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}>
                    ＋ Manage daily tasks
                  </button>
                </div>
              )}
              <MilestoneStrip today={today} milestones={milestones} onPick={pickMilestone} />
              <Calendar
                today={today}
                month={month}
                setMonth={setMonth}
                selected={selected}
                config={config}
                loggedDays={monthLoggedDays}
                onPickDay={pickDay}
                onClearSelection={() => setSelected(null)}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* DayView - slides up as a fixed overlay over everything */}
      <AnimatePresence>
        {activeTab === "calendar" && lifecyclePhase === "growing" && selected && (
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
              onRemoveTaskForDay={handleRemoveTaskForDay}
              onAddTaskForDay={handleAddTaskForDay}
              onTaskEditActiveChange={setTaskEditing}
              onPickerActiveChange={setPickerActive}
              plants={survey?.strains ?? []}
              environment={survey?.environment ?? "outdoor"}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual task manager - slides up over the calendar (manual grows) */}
      <AnimatePresence>
        {manualTasksOpen && (
          <Suspense key="manual-tasks" fallback={null}>
            <ManualTasksSheet onClose={() => setManualTasksOpen(false)} />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Chat panel - slides up as a fixed full-screen overlay */}
      <AnimatePresence>
        {chatOpen && (
          <Suspense key="chat" fallback={null}>
            <ChatPanel
              onClose={closeChat}
              contextDate={chatContext}
              activeGrowId={activeGrowId}
              grows={grows}
              suggestions={suggestions}
              onDataChanged={reloadPlan}
            />
          </Suspense>
        )}
      </AnimatePresence>

      {/* Full-screen panels - slide in from the right */}
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
            <Suspense fallback={null}>
              <AdminPanel onClose={() => setShowAdmin(false)} />
            </Suspense>
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
            <Suspense fallback={null}>
              <StatsScreen config={config} today={today} onClose={() => setShowStats(false)} />
            </Suspense>
          </motion.div>
        )}
        {showEnv && (
          <motion.div
            key="env"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PUSH_SPRING}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-bg)", overflowY: "auto" }}
          >
            <Suspense fallback={null}>
              <EnvironmentScreen onClose={() => setShowEnv(false)} />
            </Suspense>
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
            <Suspense fallback={null}>
              <GardenMap config={config} today={today} onClose={() => setShowMap(false)} />
            </Suspense>
          </motion.div>
        )}
        {showSettings && settingsGrowId && (
          <motion.div
            key="settings"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={PUSH_SPRING}
            style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--c-bg)", overflowY: "auto" }}
          >
            <Suspense fallback={null}>
              <GrowSettings
                growId={settingsGrowId}
                onClose={() => setShowSettings(false)}
                onSaved={reloadPlan}
                onDeleted={() => { setShowSettings(false); reloadPlan(); }}
              />
            </Suspense>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab bar - hidden while chat, task-edit sheet, or state picker is open */}
      {!chatOpen && !taskEditing && !pickerActive && (
        <TabBar
          activeTab={activeTab}
          onTab={handleTab}
          firstTab={phaseMeta(lifecyclePhase)}
        />
      )}
    </div>
  );
}
