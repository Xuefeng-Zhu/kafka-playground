"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type ConnectionStatus,
  type RunSnapshot,
  type ScenarioDefinition,
} from "@kplay/contracts";
import { PanelRightOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScenarioLearningSurface } from "@/components/learning";
import { ExploreTopology } from "@/components/topology/explore-topology";
import { InspectorDrawer } from "@/components/playground/inspector-drawer";
import { StartRunPanel } from "@/components/playground/start-run-panel";
import { useRunAction } from "@/components/playground/use-run-action";
import { useLowerPanelTabs } from "@/components/playground/use-lower-panel-tabs";
import { usePlaygroundBootstrap } from "@/components/playground/use-playground-bootstrap";
import { usePlaygroundRunCommands } from "@/components/playground/use-playground-run-commands";
import { usePlaygroundVisualization } from "@/components/playground/use-playground-visualization";
import { WorkspaceHeader } from "@/components/playground/workspace-header";
import { WorkspaceLowerPanel } from "@/components/playground/workspace-lower-panel";
import { useRunLiveUpdates } from "@/components/playground/use-run-live-updates";
import { useScenarioExperience } from "@/components/playground/use-scenario-experience";
import { useTeachingExperiment } from "@/components/playground/use-teaching-experiment";
import { useWorkspaceView } from "@/components/playground/use-workspace-view";
import { useWorkspaceFocus } from "@/components/playground/use-workspace-focus";
import { useTimelineResize } from "@/components/playground/use-timeline-resize";
import { ScenarioSidebar } from "@/components/scenario/scenario-sidebar";
import { usePlaygroundUiStore } from "@/lib/client/playground-ui-store";
import type { FocusRef } from "@/lib/client/scenario-experience";
import { messageFocus } from "@/lib/client/scenario-experience/helpers";

export function PlaygroundWorkspace({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [state, dispatch] = usePlaygroundVisualization();
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [shouldFrameTopology, setShouldFrameTopology] = useState(false);
  const [selectedCheckpointOptionId, setSelectedCheckpointOptionId] = useState<
    string | null
  >(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const topologySectionRef = useRef<HTMLElement | null>(null);
  const run = state.snapshot;
  const {
    activeLowerPanelTab,
    lowerPanelTabRefs,
    navigateLowerPanelTabs,
    selectLowerPanelTab,
  } = useLowerPanelTabs();
  const {
    adjustTimelineHeightWithKeyboard,
    moveTimelineResize,
    startTimelineResize,
    stopTimelineResize,
    timelineHeight,
    workspaceStyle,
  } = useTimelineResize(workspaceGridRef);
  const { focus, setFocus, resetFocus } = usePlaygroundUiStore();
  const { actionError, isActionPending, runAction, setActionError } =
    useRunAction();
  const applySnapshot = useCallback(
    (snapshot: RunSnapshot) => {
      dispatch({ type: "snapshot", snapshot });
    },
    [dispatch],
  );
  const {
    announcement,
    experimentError,
    pendingExperimentId,
    resetTeachingExperiment,
    runTeachingExperiment,
  } = useTeachingExperiment({
    runId: run?.runId ?? null,
    runAction,
    onSnapshot: applySnapshot,
  });
  const {
    canUseGuidedView,
    experienceResolution,
    experimentTransitions,
    showWorkspaceViewSwitch,
  } = useScenarioExperience({
    run,
    scenarioId,
    events: state.events,
    pendingExperimentId,
  });
  const { workspaceView, setWorkspaceView } = useWorkspaceView(
    canUseGuidedView,
    showWorkspaceViewSwitch,
  );
  const showGuidedView = canUseGuidedView && workspaceView === "guided";
  const showExploreDock = Boolean(run) && !showGuidedView;
  const {
    entityDetail,
    entityDetails,
    evidenceFocus,
    exploreTopologyFocus,
    graphFocus,
    selectedEvent,
    selectedMessage,
  } = useWorkspaceFocus({
    run,
    events: state.events,
    focus,
    experienceResolution,
  });
  const closeLiveUpdates = useRunLiveUpdates({
    dispatch,
    runId: run?.runId ?? null,
    setActionError,
  });
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId) ?? null,
    [scenarioId, scenarios],
  );
  const clearRunSelection = useCallback(() => {
    resetFocus();
    setInspectorOpen(false);
    resetTeachingExperiment();
    setSelectedCheckpointOptionId(null);
    dispatch({ type: "clear" });
  }, [dispatch, resetFocus, resetTeachingExperiment]);
  const replaceRoute = useCallback(
    (path: string) => router.replace(path),
    [router],
  );
  const pushRoute = useCallback((path: string) => router.push(path), [router]);
  usePlaygroundBootstrap({
    scenarioId,
    clearRunSelection,
    onConnection: setConnection,
    onScenarios: setScenarios,
    onSnapshot: applySnapshot,
    replaceRoute,
    setActionError,
  });

  const handleRunStarted = useCallback(
    (snapshot: RunSnapshot) => {
      applySnapshot(snapshot);
      resetFocus();
      resetTeachingExperiment();
      setShouldFrameTopology(true);
      selectLowerPanelTab("controls");
    },
    [applySnapshot, resetFocus, resetTeachingExperiment, selectLowerPanelTab],
  );

  const handleMessageProduced = useCallback(
    (snapshot: RunSnapshot) => {
      applySnapshot(snapshot);
      setShouldFrameTopology(true);
      const message = snapshot.recentMessages.at(-1);
      setFocus(
        message
          ? messageFocus(
              message.messageId,
              message.partition ?? undefined,
              message.offset ?? undefined,
            )
          : null,
      );
      setInspectorOpen(true);
    },
    [applySnapshot, setFocus],
  );

  const {
    mutate,
    navigateToScenario,
    produceOne,
    resetRun,
    startRun,
    testRemoteConnection,
    updateSettings,
  } = usePlaygroundRunCommands({
    scenarioId,
    runId: run?.runId ?? null,
    runAction,
    pushRoute,
    closeLiveUpdates,
    clearRunSelection,
    onSnapshot: applySnapshot,
    onRunStarted: handleRunStarted,
    onMessageProduced: handleMessageProduced,
  });

  useEffect(() => {
    if (!shouldFrameTopology || !run) return;
    if (!showExploreDock) return;
    const frame = requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        topologySectionRef.current?.scrollIntoView({ block: "start" });
      }
      setShouldFrameTopology(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [run, shouldFrameTopology, showExploreDock]);

  const selectedTopologyNode = showGuidedView
    ? null
    : exploreTopologyFocus.selectedCoreNode;

  function selectMessage(messageId: string) {
    const message = run?.recentMessages.find(
      (candidate) => candidate.messageId === messageId,
    );
    setFocus(
      messageFocus(
        messageId,
        message?.partition ?? undefined,
        message?.offset ?? undefined,
      ),
    );
    setInspectorOpen(true);
  }

  function selectAdjacentMessage(direction: -1 | 1) {
    if (!run?.recentMessages.length || !selectedMessage) return;
    const currentIndex = run.recentMessages.findIndex(
      (message) => message.messageId === selectedMessage.messageId,
    );
    if (currentIndex < 0) return;
    const nextIndex = Math.min(
      run.recentMessages.length - 1,
      Math.max(0, currentIndex + direction),
    );
    const nextMessage = run.recentMessages[nextIndex];
    if (nextMessage) selectMessage(nextMessage.messageId);
  }

  function selectFocus(nextFocus: FocusRef) {
    setFocus(nextFocus);
    setInspectorOpen(true);
  }

  const inspectorButtonStyle = {
    "--inspector-desktop-bottom": showExploreDock
      ? `${timelineHeight + 20}px`
      : "1.25rem",
  } as CSSProperties;

  return (
    <main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
      <WorkspaceHeader
        run={run}
        connection={connection}
        disabled={isActionPending || pendingExperimentId !== null}
        workspaceView={workspaceView}
        showWorkspaceViewSwitch={showWorkspaceViewSwitch}
        canSwitchWorkspaceView={canUseGuidedView}
        onWorkspaceViewChange={setWorkspaceView}
        onReset={resetRun}
      />
      {actionError && (
        <div
          role="alert"
          className="border-b-[3px] border-rose-700 bg-rose-100 px-5 py-2 text-sm font-semibold text-rose-800"
        >
          {actionError}
        </div>
      )}

      <Button
        type="button"
        onClick={() => setInspectorOpen(true)}
        variant="secondary"
        aria-controls="message-inspector-drawer"
        aria-expanded={isInspectorOpen}
        aria-label={
          focus?.kind === "entity"
            ? !showGuidedView && selectedTopologyNode
              ? "Open topology inspector"
              : "Open evidence inspector"
            : focus?.kind === "event"
              ? "Open event inspector"
              : "Open message inspector"
        }
        className="fixed bottom-4 right-4 z-30 min-h-11 px-3 shadow-[5px_5px_0_rgba(15,118,110,0.18)] lg:bottom-[var(--inspector-desktop-bottom)]"
        style={inspectorButtonStyle}
      >
        <PanelRightOpen size={16} aria-hidden />
        <span className="hidden sm:inline">Inspector</span>
      </Button>

      <div
        ref={workspaceGridRef}
        className={`grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-visible rounded-b-[28px] border-b-[16px] border-teal-700 lg:h-[calc(100vh-4rem)] lg:grid-cols-[260px_minmax(680px,1fr)] lg:overflow-hidden ${
          showExploreDock
            ? "lg:grid-rows-[minmax(320px,1fr)_var(--timeline-height)]"
            : "lg:grid-rows-[1fr]"
        }`}
        style={workspaceStyle}
      >
        <aside
          className={`max-h-[260px] min-h-0 overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] p-4 sm:max-h-[420px] lg:max-h-none lg:border-b-0 lg:border-r-[3px] ${
            showExploreDock ? "lg:row-span-2" : ""
          }`}
        >
          <ScenarioSidebar
            disabled={isActionPending}
            scenarios={scenarios}
            scenarioId={scenarioId}
            onNavigateScenario={(nextScenarioId) => {
              void navigateToScenario(nextScenarioId);
            }}
          />
        </aside>

        <section
          ref={topologySectionRef}
          className="relative min-h-[560px] border-b-[3px] border-teal-700 bg-[#ecfeff] lg:min-h-0 lg:border-b-0 lg:border-r-[3px]"
        >
          {!run ? (
            <StartRunPanel
              connection={connection}
              disabled={isActionPending}
              onStartRun={startRun}
              onTestRemoteConnection={testRemoteConnection}
              scenario={selectedScenario}
            />
          ) : showGuidedView && experienceResolution?.kind === "experience" ? (
            <div
              className="h-full overflow-y-auto"
              data-testid="teaching-experience-region"
              id="workspace-guided-panel"
              role="tabpanel"
              aria-labelledby="workspace-view-guided-tab"
            >
              <ScenarioLearningSurface
                frame={experienceResolution.frame}
                focus={focus}
                graphFocus={graphFocus}
                evidenceFocus={evidenceFocus}
                runtimeMode={run.mode}
                pendingExperimentId={pendingExperimentId}
                experimentError={experimentError}
                announcement={announcement}
                experimentTransitions={experimentTransitions}
                selectedCheckpointOptionId={selectedCheckpointOptionId}
                onFocus={selectFocus}
                onRunExperiment={(experimentId) => {
                  void runTeachingExperiment(experimentId);
                }}
                onAnswerCheckpoint={setSelectedCheckpointOptionId}
              />
            </div>
          ) : (
            <div
              className="flex h-full min-h-0 flex-col"
              data-testid="explore-workspace-region"
              id="workspace-explore-panel"
              role={canUseGuidedView ? "tabpanel" : undefined}
              aria-labelledby={
                canUseGuidedView ? "workspace-view-explore-tab" : undefined
              }
            >
              <ExploreTopology
                snapshot={run}
                focus={focus}
                selectedEvent={selectedEvent}
                entityDetails={entityDetails}
                scenarioFrame={
                  experienceResolution?.kind === "experience"
                    ? experienceResolution.frame
                    : undefined
                }
                onFocus={selectFocus}
              />
            </div>
          )}
        </section>

        {run && showExploreDock && (
          <WorkspaceLowerPanel
            run={run}
            disabled={isActionPending}
            activeTab={activeLowerPanelTab}
            tabRefs={lowerPanelTabRefs}
            timelineHeight={timelineHeight}
            events={state.events ?? []}
            focus={focus}
            hasSequenceGap={state.hasSequenceGap}
            onFocus={selectFocus}
            onNavigateTabs={navigateLowerPanelTabs}
            onSelectTab={selectLowerPanelTab}
            onMutate={mutate}
            onProduceOne={produceOne}
            onUpdateSettings={updateSettings}
            onResizeKeyDown={adjustTimelineHeightWithKeyboard}
            onResizePointerCancel={stopTimelineResize}
            onResizePointerDown={startTimelineResize}
            onResizePointerMove={moveTimelineResize}
            onResizePointerUp={stopTimelineResize}
          />
        )}
      </div>

      {isInspectorOpen && (
        <InspectorDrawer
          message={selectedMessage}
          event={selectedEvent}
          entityDetail={
            focus?.kind === "entity" &&
            (showGuidedView || selectedTopologyNode === null)
              ? entityDetail
              : null
          }
          snapshot={run}
          selectedNode={
            focus?.kind === "entity" && !showGuidedView
              ? selectedTopologyNode
              : null
          }
          onPreviousMessage={() => selectAdjacentMessage(-1)}
          onNextMessage={() => selectAdjacentMessage(1)}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </main>
  );
}
