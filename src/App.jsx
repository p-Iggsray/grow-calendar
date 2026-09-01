import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useToday } from "./lib/dates.js";
import { useAuth } from "./lib/auth.jsx";
import { usePlan } from "./lib/usePlan.jsx";
import { useJournalMonth, useStageTimeline } from "./lib/useJournal.js";
import { api, ymd } from "./lib/api.js";
import { buildSuggestions } from "./lib/mjSuggestions.js";
import { useOnlineStatus } from "./lib/useOnlineStatus.js";
import { useTheme } from "./lib/useTheme.js";
import { hasGrowLocation } from "./lib/growProfile.js";
import { currentStageOf, dayOfGrow, stageLabel } from "./lib/stageTimeline.js";
import { getLifecyclePhase, phaseMeta } from "./lib/lifecycle.js";

import TopBar from "./components/TopBar.jsx";
import Calendar from "./components/Calendar.jsx";
import TabBar from "./components/TabBar.jsx";
import SettingsScreen from "./components/SettingsScreen.jsx";
import EnvironmentsTab from "./components/Environments/EnvironmentsTab.jsx";
import PhasePrompt from "./components/Lifecycle/PhasePrompt.jsx";
import LocationBanner from "./components/LocationBanner.jsx";
import JournalScreen from "./components/Journal/JournalScreen.jsx";
import { AppShellSkeleton, PanelSkeleton } from "./components/LoadingScreens.jsx";

// Heavy, rarely-on-screen panels load on demand so they stay out of the
// initial bundle. The service worker runtime-caches each chunk on first use.
const SetupWizard   = lazy(() => import("./components/SetupWizard/SetupWizard.jsx"));
const ChatPanel     = lazy(() => import("./components/ChatPanel/ChatPanel.jsx"));
const StatsScreen   = lazy(() => import("./components/StatsScreen.jsx"));
const GrowSettings  = lazy(() => import("./components/GrowSettings.jsx"));
const DryingTracker = lazy(() => import("./components/Lifecycle/DryingTracker.jsx"));
const CuringTracker = lazy(() => import("./components/Lifecycle/CuringTracker.jsx"));
const GrowComplete  = lazy(() => import("./components/Lifecycle/GrowComplete.jsx"));

const SHELL_STYLE = {
  fontFamily: "var(--font-ui)",
  background: "var(--c-bg)",
  minHeight: "100vh",
  color: "var(--c-text)",
};

// Creates a blank environment on first render and calls onReady(id) so the
// wizard can open.
function NewGrowInitializer({ onReady }) {
  useEffect(() => {
    api.createGrow({ displayName: "My First Space" })
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
// The full-screen calendar sizes itself to everything above the tab bar.
const CAL_HEIGHT = "calc(100dvh - 66px - env(safe-area-inset-bottom, 0px))";

// Shared transition configs.
const PUSH_SPRING   = { type: "spring", damping: 30, stiffness: 260, restDelta: 0.5 };
const FADE_DURATION = { duration: 0.15 };

export default function App() {
  const { user } = useAuth();
  const today    = useToday();
  const online   = useOnlineStatus();
  const { theme, setTheme } = useTheme();
  const { grows, activeGrowId, setActiveGrowId, survey, lifecycle, needsSetup, loading: planLoading, error: planError, reload: reloadPlan } = usePlan();
  const lifecyclePhase = getLifecyclePhase(lifecycle);
  // The month the calendar shows - real year + month, free to roam.
  const [viewYM, setViewYM] = useState(() => ({ y: today.getFullYear(), m: today.getMonth() }));
  const [activeTab,   setActiveTab]  = useState("calendar");
  const [chatOpen,      setChatOpen]      = useState(false);
  const [chatContext,   setChatContext]   = useState(null);
  const [showStats,     setShowStats]     = useState(false);
  const [showSettings,  setShowSettings]  = useState(false);
  const [settingsGrowId, setSettingsGrowId] = useState(null);
  const [wizardGrowId,  setWizardGrowId]  = useState(null); // growId for SetupWizard
  // Main screen sections: the month grid or the day-by-day journal. Tapping a
  // calendar day flips into the journal on that day's page.
  const [mainView,    setMainView]    = useState("calendar");
  const [journalDate, setJournalDate] = useState(null);
  // Cross-tab handoff: a plant the Spaces tab should open on arrival.
  const [plantsOpenId, setPlantsOpenId] = useState(null);

  const monthKey = `${viewYM.y}-${String(viewYM.m + 1).padStart(2, "0")}`;
  // Which days of the visible month hold journal content (the .note flag
  // drives the calendar's journaled-day dots).
  const journalMonthDays = useJournalMonth(monthKey, Boolean(user) && Boolean(activeGrowId), activeGrowId);
  // The grow's real timeline: every stage switch the grower recorded.
  const { events: stageEvents, firstDate: growStart } = useStageTimeline(activeGrowId, Boolean(user));

  // From anywhere in the app (a calendar day, plant history, MJ, a shared
  // link) straight to a day's journal page. push=false for browser-driven
  // navigation (deep links, popstate) that must not add history entries.
  const openJournalAt = useCallback((date, { push = true } = {}) => {
    setJournalDate(date);
    setViewYM({ y: date.getFullYear(), m: date.getMonth() });
    setMainView("journal");
    setActiveTab("calendar");
    setChatOpen(false);
    setChatContext(null);
    if (push) window.history.pushState({ growDay: ymd(date) }, "", `?d=${ymd(date)}`);
  }, []);

  // Leaving the journal for the month grid, from the journal's own back
  // button. Clears any ?d= deep link so the URL matches what is on screen.
  const exitJournal = useCallback(() => {
    setMainView("calendar");
    const url = new URL(window.location.href);
    if (url.searchParams.has("d")) {
      url.searchParams.delete("d");
      window.history.replaceState(window.history.state, "", url.pathname + url.search);
    }
  }, []);

  // Back button: leave the journal page for the month grid.
  useEffect(() => {
    function onPop() {
      setMainView("calendar");
      setActiveTab(prev => prev === "environments" ? "calendar" : prev);
      const url = new URL(window.location.href);
      if (url.searchParams.has("d")) {
        url.searchParams.delete("d");
        window.history.replaceState(window.history.state, "", url.pathname + url.search);
      }
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // ?d=YYYY-MM-DD deep links (shared URLs, notifications) open that day's
  // journal page directly.
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current || !survey) return;
    const url = new URL(window.location.href);
    const d = url.searchParams.get("d");
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    const [y, m, day] = d.split("-").map(Number);
    const date = new Date(y, m - 1, day);
    // Round-trip check rejects rolled-over impossibles like 2026-02-31.
    if (Number.isNaN(date.getTime()) || ymd(date) !== d) return;
    deepLinkApplied.current = true;
    openJournalAt(date, { push: false });
  }, [survey, openJournalAt]);

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

  if (planError) {
    return (
      <div style={SHELL_STYLE}>
        <div style={{ padding: 24, fontFamily: "var(--font-ui)", color: "var(--c-danger-soft)" }}>
          Could not load the grow plan. {planError.message}
        </div>
      </div>
    );
  }
  // Only blank to the skeleton on the FIRST load (nothing loaded yet). reload() and
  // grow switches also flip planLoading, but we keep the current UI on screen
  // while they refetch so the whole app doesn't flash to a skeleton every time
  // MJ acts, a phase transitions, or a plant is edited.
  if (planLoading && !survey) {
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
    // shows as IN SETUP on the Spaces tab) and the wizard's autosaved draft, so
    // backing out never loses progress; usePlan prefers configured grows on
    // reload, so the unfinished one can't re-trap the app.
    const canExit = grows.some(g => g.survey);
    return (
      <div style={SHELL_STYLE}>
        <Suspense fallback={<PanelSkeleton />}>
        <SetupWizard
          growId={setupGrowId}
          onComplete={() => {
            setWizardGrowId(null);
            // Land the user in the grow they just finished setting up.
            setActiveGrowId(setupGrowId);
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

  if (!survey) {
    return (
      <div style={SHELL_STYLE}>
        <AppShellSkeleton />
      </div>
    );
  }

  const todayStage = currentStageOf(survey?.strains ?? []);
  const todayStyle = todayStage ? { label: stageLabel(todayStage) } : null;
  const todayDayNum = dayOfGrow(growStart, ymd(today));

  const suggestions = buildSuggestions({
    contextDate: chatContext,
    today,
    phaseLabel: todayStyle?.label ?? null,
  });

  function pickDay(date) { openJournalAt(date); }

  // "New space", from the grow switcher or the Spaces tab. A growId means
  // resume that unfinished space; null means make a fresh one first. Either way
  // it lands in the setup wizard.
  async function handleNewEnvironment(growId) {
    if (growId) { setWizardGrowId(growId); return; }
    // Resume an unfinished space instead of stacking another empty one.
    const unfinished = grows.find((g) => !g.survey);
    if (unfinished) { setWizardGrowId(unfinished.id); return; }
    try {
      const { id } = await api.createGrow({ displayName: "New Environment" });
      setWizardGrowId(id);
    } catch { /* user can retry */ }
  }

  // From a journal page's plant entries straight to that plant's detail,
  // inside its environment.
  function openPlantFromJournal(plantId) {
    if (!plantId) return;
    setPlantsOpenId(plantId);
    setActiveTab("environments");
  }

  function openChat() {
    // Attach the viewed journal day only when the user is actually LOOKING at
    // it - mainView stays "journal" while other tabs are open.
    const onJournal = activeTab === "calendar" && mainView === "journal" && journalDate;
    setChatContext(onJournal ? ymd(journalDate) : null);
    setChatOpen(true);
  }
  function closeChat() {
    setChatOpen(false);
    setChatContext(null);
  }

  function handleTab(tabId) {
    if (tabId === "mj") {
      openChat();
      return;
    }
    if (["environments", "calendar", "more"].includes(tabId)) {
      setActiveTab(tabId);
      if (chatOpen) closeChat();
    }
  }

  // Key for the tab content AnimatePresence - drives crossfade between screens.
  const tabKey = activeTab === "more" ? "more" : activeTab === "environments" ? "environments" : "calendar";
  // The month grid claims the whole viewport; every other screen scrolls.
  const fullScreenCalendar = tabKey === "calendar" && lifecyclePhase === "growing" && mainView === "calendar";

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
      <div style={{ paddingBottom: fullScreenCalendar ? 0 : TAB_CLEARANCE }}>
        <AnimatePresence mode="wait">
          {tabKey === "more" ? (
            <motion.div
              key="more"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <SettingsScreen
                today={today}
                onOpenStats={() => setShowStats(true)}
                onOpenGrowSettings={(growId) => { setSettingsGrowId(growId); setShowSettings(true); }}
                onNewEnvironment={handleNewEnvironment}
                theme={theme}
                setTheme={setTheme}
              />
            </motion.div>
          ) : tabKey === "environments" ? (
            <motion.div
              key="environments"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
            >
              <EnvironmentsTab
                openPlantId={plantsOpenId}
                onOpenPlantConsumed={() => setPlantsOpenId(null)}
                onOpenJournalDay={openJournalAt}
                onNewEnvironment={handleNewEnvironment}
                onOpenSettings={(growId) => { setSettingsGrowId(growId); setShowSettings(true); }}
              />
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
              <Suspense fallback={<PanelSkeleton />}><GrowComplete onStartNewGrow={() => setActiveTab("environments")} /></Suspense>
            </motion.div>
          ) : (
            <motion.div
              key="calendar"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={FADE_DURATION}
              style={fullScreenCalendar ? {
                height: CAL_HEIGHT,
                display: "flex", flexDirection: "column",
                overflowY: "auto",
              } : undefined}
            >
              <TopBar
                today={today}
                todayStyle={todayStyle}
                dayNum={todayDayNum}
                view={mainView}
                onNewEnvironment={handleNewEnvironment}
                onChangeView={(v) => {
                  // Like a paper journal, toggling into it opens today's page.
                  if (v === "journal") setJournalDate(today);
                  setMainView(v);
                }}
              />
              {/* Drying entry point - offered once a plant actually reaches
                  harvest. Starting earlier lives behind the environment gear. */}
              {todayStage === "harvest" && (
                <PhasePrompt today={today} due />
              )}
              {/* No location = no auto weather. Nudge once, fix in one tap. */}
              {survey && !hasGrowLocation(survey) && (
                <LocationBanner key={activeGrowId} growId={activeGrowId} onSaved={reloadPlan} />
              )}
              {mainView === "journal" ? (
                <JournalScreen
                  today={today}
                  date={journalDate ?? today}
                  onChangeDate={(d) => { setJournalDate(d); setViewYM({ y: d.getFullYear(), m: d.getMonth() }); }}
                  stageEvents={stageEvents}
                  firstDate={growStart}
                  growId={activeGrowId}
                  onOpenPlant={openPlantFromJournal}
                  onExit={exitJournal}
                  plants={survey?.strains ?? []}
                  environment={survey?.environment ?? "outdoor"}
                />
              ) : (
                <Calendar
                  today={today}
                  year={viewYM.y}
                  month={viewYM.m}
                  onChangeMonth={(y, m) => setViewYM({ y, m })}
                  stageEvents={stageEvents}
                  firstDate={growStart}
                  journalDays={journalMonthDays}
                  onPickDay={pickDay}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

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
              <StatsScreen today={today} onClose={() => setShowStats(false)} />
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

      {/* Tab bar - hidden while chat is open */}
      {!chatOpen && (
        <TabBar
          activeTab={activeTab}
          onTab={handleTab}
          firstTab={phaseMeta(lifecyclePhase)}
        />
      )}
    </div>
  );
}
