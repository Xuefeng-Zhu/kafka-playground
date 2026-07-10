"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  type ConnectionStatus,
  type KeyStrategy,
  type RemoteKafkaConfig,
  type RunSnapshot,
  type RuntimeEvent,
  type ScenarioDefinition,
  type UserSelectableKafkaMode,
} from "@kplay/contracts";
import {
  Lightbulb,
  List,
  PanelRightOpen,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import {
  initializeFromSnapshot,
  mergeSnapshot,
  applyRuntimeEvent,
  initialVisualizationState,
} from "@/lib/client/visualization-reducer";
import { Button } from "@/components/ui/button";
import { ControlsPanel } from "@/components/controls/controls-panel";
import { ScenarioLearningSurface } from "@/components/learning";
import { KafkaTopology } from "@/components/topology/kafka-topology";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { EducationPanel } from "@/components/education/education-panel";
import { InspectorDrawer } from "@/components/playground/inspector-drawer";
import { StartRunPanel } from "@/components/playground/start-run-panel";
import { useRunAction } from "@/components/playground/use-run-action";
import {
  useLowerPanelTabs,
  type LowerPanelTab,
} from "@/components/playground/use-lower-panel-tabs";
import { WorkspaceHeader } from "@/components/playground/workspace-header";
import { useRunLiveUpdates } from "@/components/playground/use-run-live-updates";
import {
  MAX_TIMELINE_HEIGHT,
  MIN_TIMELINE_HEIGHT,
  useTimelineResize,
} from "@/components/playground/use-timeline-resize";
import { ScenarioInsightPanel } from "@/components/scenario/scenario-insight-panel";
import { ScenarioSidebar } from "@/components/scenario/scenario-sidebar";
import {
  api,
  loadActiveRunSnapshot,
  loadConnectionStatus,
  loadScenarioDefinitions,
  produceMessage,
  retireRun,
  runScenarioExperiment,
} from "@/lib/client/playground-api";
import { usePlaygroundUiStore } from "@/lib/client/playground-ui-store";
import {
  resolveScenarioExperience,
  type FocusRef,
  type ScenarioExperienceSnapshot,
} from "@/lib/client/scenario-experience";
import {
  evidenceFocusForRuntimeEvent,
  experimentTransitionTrail,
  relatedGraphFocus,
} from "@/lib/client/scenario-experience/definition-helpers";
import type { ScenarioAction } from "@/lib/client/scenario-actions";
import type { TopologySelection } from "@/lib/client/topology-selection";

type Action =
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RuntimeEvent }
  | { type: "clear" };

const lowerPanelTabs = [
  { id: "controls", label: "Controls", Icon: SlidersHorizontal },
  { id: "insights", label: "Insights", Icon: Lightbulb },
  { id: "timeline", label: "Timeline", Icon: List },
] as const satisfies ReadonlyArray<{
  id: LowerPanelTab;
  label: string;
  Icon: LucideIcon;
}>;

function reducer(state: typeof initialVisualizationState, action: Action) {
  if (action.type === "snapshot") {
    return state.snapshot
      ? mergeSnapshot(state, action.snapshot)
      : initializeFromSnapshot(action.snapshot);
  }
  if (action.type === "event") return applyRuntimeEvent(state, action.event);
  return initialVisualizationState;
}

export function PlaygroundWorkspace({ scenarioId }: { scenarioId: string }) {
  const router = useRouter();
  const [state, dispatch] = useReducer(reducer, initialVisualizationState);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [shouldFrameTopology, setShouldFrameTopology] = useState(false);
  const [pendingExperimentId, setPendingExperimentId] = useState<string | null>(
    null,
  );
  const [experimentError, setExperimentError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [selectedCheckpointOptionId, setSelectedCheckpointOptionId] = useState<
    string | null
  >(null);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const topologySectionRef = useRef<HTMLElement | null>(null);
  const run = state.snapshot;
  const experienceScenarioId = run?.scenarioId ?? null;
  const experienceScenarioState = run?.scenarioState;
  const experienceMode = run?.mode ?? null;
  const experiencePartitionCount = run?.partitionCount ?? null;
  const experienceTopicName = run?.topicName ?? null;
  const experienceRecentMessages = run?.recentMessages ?? null;
  const experienceSnapshot = useMemo<ScenarioExperienceSnapshot | null>(() => {
    if (
      experienceScenarioId === null ||
      experienceMode === null ||
      experiencePartitionCount === null ||
      experienceTopicName === null ||
      experienceRecentMessages === null
    ) {
      return null;
    }
    return {
      scenarioId: experienceScenarioId,
      scenarioState: experienceScenarioState,
      mode: experienceMode,
      partitionCount: experiencePartitionCount,
      topicName: experienceTopicName,
      recentMessages: experienceRecentMessages,
    };
  }, [
    experienceMode,
    experiencePartitionCount,
    experienceRecentMessages,
    experienceScenarioId,
    experienceScenarioState,
    experienceTopicName,
  ]);
  const experienceResolution = useMemo(
    () =>
      experienceSnapshot ? resolveScenarioExperience(experienceSnapshot) : null,
    [experienceSnapshot],
  );
  const activeExperienceExperimentId =
    pendingExperimentId ??
    (experienceResolution?.kind === "experience"
      ? experienceResolution.frame.experiment.experimentId
      : null);
  const experimentTransitions = useMemo(
    () =>
      experimentTransitionTrail(
        state.events ?? [],
        scenarioId,
        activeExperienceExperimentId,
      ),
    [activeExperienceExperimentId, scenarioId, state.events],
  );
  const isTeachingExperience = experienceResolution?.kind === "experience";
  const showLegacyEducation = !isTeachingExperience && run?.mode !== "remote";
  const {
    activeLowerPanelTab,
    availableTabIds,
    lowerPanelTabRefs,
    navigateLowerPanelTabs,
    selectLowerPanelTab,
  } = useLowerPanelTabs({ includeInsights: showLegacyEducation });
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
    setPendingExperimentId(null);
    setExperimentError(null);
    setAnnouncement("");
    setSelectedCheckpointOptionId(null);
    dispatch({ type: "clear" });
  }, [resetFocus]);

  useEffect(() => {
    let cancelled = false;
    void loadConnectionStatus().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setConnection(result.data);
        return;
      }
      setConnection(null);
      setActionError(result.message);
    });
    void loadScenarioDefinitions().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setScenarios(result.data);
        return;
      }
      setScenarios([]);
      setActionError(result.message);
    });
    return () => {
      cancelled = true;
    };
  }, [setActionError]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) clearRunSelection();
    });

    void (async () => {
      try {
        const result = await loadActiveRunSnapshot();
        if (cancelled) return;
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        const snapshot = result.data;
        if (!snapshot) return;
        if (snapshot.scenarioId === scenarioId) {
          dispatch({ type: "snapshot", snapshot });
          return;
        }
        router.replace(`/scenarios/${snapshot.scenarioId}`);
      } catch {
        if (!cancelled) setActionError("Unable to load the active run.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, scenarioId, clearRunSelection, setActionError]);

  useEffect(() => {
    if (!shouldFrameTopology || !run) return;
    const frame = requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 767px)").matches) {
        topologySectionRef.current?.scrollIntoView({ block: "start" });
      }
      setShouldFrameTopology(false);
    });
    return () => cancelAnimationFrame(frame);
  }, [run, shouldFrameTopology]);

  const selectedEvent = useMemo(() => {
    if (focus?.kind !== "event") return null;
    return (
      (state.events ?? []).find((event) => event.eventId === focus.id) ?? null
    );
  }, [focus, state.events]);
  const selectedMessage = useMemo(() => {
    const messages = run?.recentMessages ?? [];
    if (focus?.kind === "message") {
      return messages.find((message) => message.messageId === focus.id) ?? null;
    }
    const eventMessageId =
      selectedEvent && "messageId" in selectedEvent
        ? selectedEvent.messageId
        : null;
    if (eventMessageId) {
      return (
        messages.find((message) => message.messageId === eventMessageId) ?? null
      );
    }
    if (focus !== null) return null;
    return messages.at(-1) ?? null;
  }, [focus, run?.recentMessages, selectedEvent]);
  const selectedTopologyNode = useMemo(
    () =>
      experienceResolution?.kind === "legacy"
        ? topologySelectionForFocus(focus)
        : null,
    [experienceResolution, focus],
  );
  const entityDetail = useMemo(() => {
    if (
      focus?.kind !== "entity" ||
      experienceResolution?.kind !== "experience"
    ) {
      return null;
    }
    return experienceResolution.frame.entityDetails[focus.id] ?? null;
  }, [experienceResolution, focus]);
  const evidenceFocus = useMemo(
    () =>
      evidenceFocusForRuntimeEvent(
        focus,
        selectedEvent,
        experienceResolution?.kind === "experience"
          ? experienceResolution.frame.entityDetails
          : {},
      ),
    [experienceResolution, focus, selectedEvent],
  );
  const graphFocus = useMemo(
    () =>
      experienceResolution?.kind === "experience"
        ? relatedGraphFocus(
            evidenceFocus,
            selectedEvent,
            experienceResolution.frame.causalGraph.nodes.map((node) => node.id),
          )
        : focus,
    [evidenceFocus, experienceResolution, focus, selectedEvent],
  );

  async function startRun(input: {
    mode: UserSelectableKafkaMode;
    remoteKafkaConfig?: RemoteKafkaConfig;
  }) {
    await runAction(async () => {
      const snapshot = await api<RunSnapshot>("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({
          scenarioId,
          mode: input.mode,
          remoteKafkaConfig: input.remoteKafkaConfig,
        }),
      });
      dispatch({ type: "snapshot", snapshot });
      resetFocus();
      setExperimentError(null);
      setAnnouncement("");
      setShouldFrameTopology(true);
      selectLowerPanelTab("controls");
    });
  }

  async function testRemoteConnection(remoteKafkaConfig: RemoteKafkaConfig) {
    return api<ConnectionStatus>("/api/v1/connection/test", {
      method: "POST",
      body: JSON.stringify({
        mode: "remote",
        remoteKafkaConfig,
      }),
    });
  }

  async function resetRun() {
    if (!run) return;
    await runAction(() => retireActiveRun(run.runId));
  }

  async function navigateToScenario(nextScenarioId: string) {
    if (nextScenarioId === scenarioId) return;
    if (!run) {
      router.push(`/scenarios/${nextScenarioId}`);
      return;
    }
    await runAction(async () => {
      await retireActiveRun(run.runId);
      router.push(`/scenarios/${nextScenarioId}`);
    });
  }

  async function retireActiveRun(runId: string) {
    closeLiveUpdates();
    await retireRun(runId);
    clearRunSelection();
  }

  async function mutate(path: string, init?: RequestInit) {
    if (!run) return;
    await runAction(async () => {
      const snapshot = await api<RunSnapshot>(
        `/api/v1/runs/${run.runId}${path}`,
        init,
      );
      dispatch({ type: "snapshot", snapshot });
    });
  }

  async function updateSettings(settings: {
    productionRate?: number;
    keyStrategy?: KeyStrategy;
    processingLatencyMs?: number;
  }) {
    await mutate("/settings", {
      method: "PATCH",
      body: JSON.stringify(settings),
    });
  }

  async function produceOne() {
    if (!run) return;
    await runAction(async () => {
      const snapshot = await produceMessage(run.runId);
      dispatch({ type: "snapshot", snapshot });
      setShouldFrameTopology(true);
      const message = snapshot.recentMessages.at(-1);
      setFocus(
        message
          ? {
              kind: "message",
              id: message.messageId,
              ...(message.partition == null
                ? {}
                : { partition: message.partition }),
              ...(message.offset == null ? {} : { offset: message.offset }),
            }
          : null,
      );
      setInspectorOpen(true);
    });
  }

  async function runScenarioAction(action: ScenarioAction) {
    if (!run) return;
    await runAction(async () => {
      if (action.settings) {
        const snapshot = await api<RunSnapshot>(
          `/api/v1/runs/${run.runId}/settings`,
          {
            method: "PATCH",
            body: JSON.stringify(action.settings),
          },
        );
        dispatch({ type: "snapshot", snapshot });
      }

      for (let index = 0; index < (action.produceCount ?? 0); index += 1) {
        const snapshot = await produceMessage(run.runId, action.keyStrategy);
        dispatch({ type: "snapshot", snapshot });
      }

      resetFocus();
    });
  }

  async function runTeachingExperiment(experimentId: string) {
    if (!run) return;
    setPendingExperimentId(experimentId);
    setExperimentError(null);
    setAnnouncement(`Running experiment ${experimentId}.`);
    let failureMessage: string | null = null;
    const completed = await runAction(async () => {
      try {
        const snapshot = await runScenarioExperiment(run.runId, experimentId);
        dispatch({ type: "snapshot", snapshot });
        setAnnouncement(
          `${experimentId} completed with authoritative scenario evidence.`,
        );
        setShouldFrameTopology(true);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Experiment failed.";
        failureMessage = message;
        setExperimentError(message);
        setAnnouncement(`${experimentId} failed: ${message}`);
        throw error;
      }
    });
    if (!completed && failureMessage === null) {
      setExperimentError("The experiment could not start.");
    }
    setPendingExperimentId(null);
  }

  function selectMessage(messageId: string) {
    const message = run?.recentMessages.find(
      (candidate) => candidate.messageId === messageId,
    );
    setFocus({
      kind: "message",
      id: messageId,
      ...(message?.partition == null ? {} : { partition: message.partition }),
      ...(message?.offset == null ? {} : { offset: message.offset }),
    });
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

  function selectTopologyNode(selection: TopologySelection) {
    selectFocus(focusForTopologySelection(selection));
  }

  const inspectorButtonStyle = {
    "--inspector-desktop-bottom": run ? `${timelineHeight + 20}px` : "1.25rem",
  } as CSSProperties;

  return (
    <main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
      <WorkspaceHeader
        run={run}
        connection={connection}
        disabled={isActionPending}
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
            ? "Open evidence inspector"
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
          run
            ? "lg:grid-rows-[minmax(320px,1fr)_var(--timeline-height)]"
            : "lg:grid-rows-[1fr]"
        }`}
        style={workspaceStyle}
      >
        <aside
          className={`max-h-[260px] min-h-0 overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] p-4 sm:max-h-[420px] lg:max-h-none lg:border-b-0 lg:border-r-[3px] ${
            run ? "lg:row-span-2" : ""
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
          {showLegacyEducation && (
            <EducationPanel
              scenarioId={scenarioId}
              snapshot={run}
              selectedMessage={selectedMessage}
            />
          )}
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
          ) : experienceResolution?.kind === "experience" ? (
            <div
              className="h-full overflow-y-auto"
              data-testid="teaching-experience-region"
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
            <div className="flex h-full min-h-0 flex-col">
              {run.mode === "remote" ? (
                <div
                  className="m-3 mb-0 shrink-0 rounded-xl border-2 border-sky-700 bg-sky-50 px-3 py-2 text-sm font-bold leading-6 text-sky-950 shadow-[4px_4px_0_rgba(3,105,161,0.14)]"
                  data-testid="remote-observed-only-notice"
                  role="status"
                >
                  Observed broker view. Deterministic teaching experiments are
                  disabled in Remote Kafka mode until this scenario has a
                  matching remote integration.
                </div>
              ) : null}
              <div className="min-h-0 flex-1">
                <KafkaTopology
                  snapshot={run}
                  showScenarioVisual={run.mode !== "remote"}
                  selectedMessageId={
                    focus?.kind === "message" ? focus.id : null
                  }
                  selectedNode={selectedTopologyNode}
                  onSelectMessage={selectMessage}
                  onSelectNode={selectTopologyNode}
                />
              </div>
            </div>
          )}
        </section>

        {run && (
          <section
            className="flex min-h-[520px] flex-col bg-[#fff7ed] lg:min-h-0 lg:border-r-[3px] lg:border-t-[3px] lg:border-teal-700"
            data-testid="timeline-region"
          >
            <div
              aria-label="Resize lower panel"
              aria-orientation="horizontal"
              aria-valuemax={MAX_TIMELINE_HEIGHT}
              aria-valuemin={MIN_TIMELINE_HEIGHT}
              aria-valuenow={timelineHeight}
              className="hidden h-3 shrink-0 cursor-row-resize items-center justify-center border-b-2 border-teal-700 bg-[#fff7ed] focus:outline-none focus:ring-4 focus:ring-sky-200 lg:flex"
              data-testid="timeline-resize-handle"
              onKeyDown={adjustTimelineHeightWithKeyboard}
              onPointerCancel={stopTimelineResize}
              onPointerDown={startTimelineResize}
              onPointerMove={moveTimelineResize}
              onPointerUp={stopTimelineResize}
              role="separator"
              tabIndex={0}
            >
              <span className="h-1 w-12 rounded-full bg-teal-700/55" />
            </div>
            <div className="flex min-h-0 flex-1" data-testid="lower-panel-tabs">
              <div
                aria-label="Run workspace panels"
                className="flex w-14 shrink-0 flex-col items-center gap-2 border-r-2 border-teal-700 bg-[#fff7ed] px-1.5 py-2 lg:w-12"
                role="tablist"
              >
                {lowerPanelTabs
                  .filter((tab) => availableTabIds.includes(tab.id))
                  .map((tab) => {
                    const Icon = tab.Icon;
                    const isActive = activeLowerPanelTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        ref={(element) => {
                          lowerPanelTabRefs.current[tab.id] = element;
                        }}
                        aria-controls={`lower-panel-${tab.id}`}
                        aria-label={tab.label}
                        aria-selected={isActive}
                        className={`grid size-11 place-items-center rounded-xl border-2 text-teal-800 transition focus:outline-none focus:ring-4 focus:ring-sky-200 lg:size-9 ${
                          isActive
                            ? "border-sky-500 bg-sky-100 shadow-[3px_3px_0_rgba(14,165,233,0.18)]"
                            : "border-teal-700 bg-[#fffdf5] hover:bg-teal-50"
                        }`}
                        data-testid={`lower-panel-tab-${tab.id}`}
                        id={`lower-panel-tab-${tab.id}`}
                        onClick={() => selectLowerPanelTab(tab.id)}
                        onKeyDown={(event) =>
                          navigateLowerPanelTabs(event, tab.id)
                        }
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        title={tab.label}
                        type="button"
                      >
                        <Icon size={17} aria-hidden />
                      </button>
                    );
                  })}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <div
                  aria-labelledby="lower-panel-tab-controls"
                  className="min-h-0 flex-1 overflow-auto"
                  data-testid="lower-panel-controls"
                  hidden={activeLowerPanelTab !== "controls"}
                  id="lower-panel-controls"
                  role="tabpanel"
                >
                  <ControlsPanel
                    snapshot={run}
                    disabled={isActionPending}
                    onStartProducer={() =>
                      mutate("/producer/start", { method: "POST" })
                    }
                    onPauseProducer={() =>
                      mutate("/producer/pause", { method: "POST" })
                    }
                    onStopProducer={() =>
                      mutate("/producer/stop", { method: "POST" })
                    }
                    onProduceOne={produceOne}
                    onAddConsumer={() =>
                      mutate("/consumers", { method: "POST" })
                    }
                    onStopConsumer={(consumerId) =>
                      mutate(`/consumers/${consumerId}`, { method: "DELETE" })
                    }
                    onCrashConsumer={(consumerId) =>
                      mutate(`/consumers/${consumerId}/crash`, {
                        method: "POST",
                      })
                    }
                    onUpdateSettings={updateSettings}
                  />
                </div>
                {showLegacyEducation && (
                  <div
                    aria-labelledby="lower-panel-tab-insights"
                    className="min-h-0 flex-1 overflow-auto"
                    data-testid="lower-panel-insights"
                    hidden={activeLowerPanelTab !== "insights"}
                    id="lower-panel-insights"
                    role="tabpanel"
                  >
                    <ScenarioInsightPanel
                      snapshot={run}
                      disabled={isActionPending}
                      onRunAction={runScenarioAction}
                    />
                  </div>
                )}
                <div
                  aria-labelledby="lower-panel-tab-timeline"
                  className="flex min-h-0 flex-1 flex-col overflow-hidden pt-3"
                  data-testid="lower-panel-timeline"
                  hidden={activeLowerPanelTab !== "timeline"}
                  id="lower-panel-timeline"
                  role="tabpanel"
                >
                  <EventTimeline
                    events={state.events ?? []}
                    focus={focus}
                    hasSequenceGap={state.hasSequenceGap}
                    onFocus={selectFocus}
                  />
                </div>
              </div>
            </div>
          </section>
        )}
      </div>

      {isInspectorOpen && (
        <InspectorDrawer
          message={selectedMessage}
          event={selectedEvent}
          entityDetail={entityDetail}
          snapshot={run}
          selectedNode={selectedTopologyNode}
          onPreviousMessage={() => selectAdjacentMessage(-1)}
          onNextMessage={() => selectAdjacentMessage(1)}
          onClose={() => setInspectorOpen(false)}
        />
      )}
    </main>
  );
}

function focusForTopologySelection(selection: TopologySelection): FocusRef {
  if (selection.type === "producer" || selection.type === "topic") {
    return { kind: "entity", id: selection.type };
  }
  if (selection.type === "partition") {
    return { kind: "entity", id: `partition-${selection.partition}` };
  }
  if (selection.type === "consumer") {
    return { kind: "entity", id: `consumer:${selection.consumerId}` };
  }
  return { kind: "entity", id: selection.nodeId };
}

function topologySelectionForFocus(
  focus: FocusRef | null,
): TopologySelection | null {
  if (focus?.kind !== "entity") return null;
  if (focus.id === "producer" || focus.id === "topic") {
    return { type: focus.id };
  }
  if (focus.id.startsWith("partition-")) {
    const partition = Number(focus.id.slice("partition-".length));
    if (Number.isInteger(partition) && partition >= 0) {
      return { type: "partition", partition };
    }
  }
  if (focus.id.startsWith("consumer:")) {
    return { type: "consumer", consumerId: focus.id.slice("consumer:".length) };
  }
  return { type: "scenarioNode", nodeId: focus.id };
}
