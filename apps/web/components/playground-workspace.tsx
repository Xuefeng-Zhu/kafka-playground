"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import {
  runSnapshotSchema,
  runtimeEventSchema,
  runtimeEventTypes,
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
} from "lucide-react";
import {
  initializeFromSnapshot,
  mergeSnapshot,
  applyRuntimeEvent,
  initialVisualizationState,
} from "@/lib/client/visualization-reducer";
import { Button } from "@/components/ui/button";
import { ControlsPanel } from "@/components/controls/controls-panel";
import { KafkaTopology } from "@/components/topology/kafka-topology";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { EducationPanel } from "@/components/education/education-panel";
import { InspectorDrawer } from "@/components/playground/inspector-drawer";
import { StartRunPanel } from "@/components/playground/start-run-panel";
import { WorkspaceHeader } from "@/components/playground/workspace-header";
import { ScenarioInsightPanel } from "@/components/scenario/scenario-insight-panel";
import { ScenarioSidebar } from "@/components/scenario/scenario-sidebar";
import {
  api,
  fetchRunSnapshot,
  loadActiveRunSnapshot,
  loadConnectionStatus,
  loadScenarioDefinitions,
  produceMessage,
} from "@/lib/client/playground-api";
import { usePlaygroundUiStore } from "@/lib/client/playground-ui-store";
import type { ScenarioAction } from "@/lib/client/scenario-actions";
import type { TopologySelection } from "@/lib/client/topology-selection";

type Action =
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RuntimeEvent }
  | { type: "clear" };

const COLLAPSED_TIMELINE_HEIGHT = 210;
const MIN_TIMELINE_HEIGHT = 160;
const MAX_TIMELINE_HEIGHT = 720;
const MIN_TOPOLOGY_HEIGHT = 220;
const TIMELINE_RESIZE_STEP = 24;
const LOWER_PANEL_TAB_STORAGE_KEY = "kplay.lowerPanel.activeTab";

const lowerPanelTabs = [
  { id: "controls", label: "Controls", Icon: SlidersHorizontal },
  { id: "insights", label: "Insights", Icon: Lightbulb },
  { id: "timeline", label: "Timeline", Icon: List },
] as const;

type LowerPanelTab = (typeof lowerPanelTabs)[number]["id"];

type TimelineResizeState = {
  pointerId: number;
  startHeight: number;
  startY: number;
};

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
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setActionPending] = useState(false);
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [selectedTopologyNode, setSelectedTopologyNode] =
    useState<TopologySelection | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const actionInFlightRef = useRef(false);
  const workspaceGridRef = useRef<HTMLDivElement | null>(null);
  const timelineResizeRef = useRef<TimelineResizeState | null>(null);
  const lowerPanelTabRefs = useRef<
    Partial<Record<LowerPanelTab, HTMLButtonElement | null>>
  >({});
  const [timelineHeight, setTimelineHeight] = useState(
    COLLAPSED_TIMELINE_HEIGHT,
  );
  const [activeLowerPanelTab, setActiveLowerPanelTab] = useState<LowerPanelTab>(
    () => {
      if (typeof window === "undefined") return "controls";
      const savedTab = window.localStorage.getItem(LOWER_PANEL_TAB_STORAGE_KEY);
      return isLowerPanelTab(savedTab) ? savedTab : "controls";
    },
  );
  const {
    selectedMessageId,
    selectedEventSequence,
    setSelectedMessageId,
    setSelectedEventSequence,
    resetSelection,
  } = usePlaygroundUiStore();
  const run = state.snapshot;
  const selectedScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === scenarioId) ?? null,
    [scenarioId, scenarios],
  );

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
  }, []);

  useEffect(() => {
    dispatch({ type: "clear" });

    let cancelled = false;
    void (async () => {
      try {
        const result = await loadActiveRunSnapshot();
        if (cancelled) return;
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        resetSelection();
        setSelectedTopologyNode(null);
        setInspectorOpen(false);
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
  }, [router, scenarioId, resetSelection]);

  useEffect(() => {
    if (!run?.runId) return;
    const source = new EventSource(`/api/v1/runs/${run.runId}/events`);
    eventSourceRef.current = source;
    source.addEventListener("snapshot", (message) => {
      try {
        const payload = JSON.parse(message.data) as { snapshot: unknown };
        dispatch({
          type: "snapshot",
          snapshot: runSnapshotSchema.parse(payload.snapshot),
        });
      } catch {
        setActionError("Live snapshot payload could not be parsed.");
      }
    });
    source.onmessage = () => undefined;
    runtimeEventTypes.forEach((type) => {
      source.addEventListener(type, (message) => {
        try {
          dispatch({
            type: "event",
            event: runtimeEventSchema.parse(JSON.parse(message.data)),
          });
        } catch {
          setActionError("Live event payload could not be parsed.");
          return;
        }
        void refreshSnapshot(run.runId, dispatch).catch(() => {
          setActionError("Unable to refresh the latest run snapshot.");
        });
      });
    });
    source.onerror = () => {
      void refreshSnapshot(run.runId, dispatch).catch(() => {
        setActionError("Live updates disconnected.");
      });
    };
    return () => {
      source.close();
      if (eventSourceRef.current === source) eventSourceRef.current = null;
    };
  }, [run?.runId]);

  const selectedMessage = useMemo(
    () =>
      run?.recentMessages?.find(
        (message) => message.messageId === selectedMessageId,
      ) ??
      run?.recentMessages?.at(-1) ??
      null,
    [run?.recentMessages, selectedMessageId],
  );
  const selectedEvent = useMemo(
    () =>
      (state.events ?? []).find(
        (event) => event.sequence === selectedEventSequence,
      ) ??
      (state.events ?? []).at(-1) ??
      null,
    [state.events, selectedEventSequence],
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
    await runAction(async () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      await api(`/api/v1/runs/${run.runId}/reset`, { method: "POST" });
      resetSelection();
      setSelectedTopologyNode(null);
      setInspectorOpen(false);
      dispatch({ type: "clear" });
    });
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
      resetSelection();
      setSelectedTopologyNode(null);
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

      resetSelection();
      setSelectedTopologyNode(null);
    });
  }

  function selectMessage(messageId: string) {
    setSelectedMessageId(messageId);
    setSelectedEventSequence(null);
    setSelectedTopologyNode(null);
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

  function selectEvent(sequence: number) {
    setSelectedMessageId(null);
    setSelectedEventSequence(sequence);
    setSelectedTopologyNode(null);
    setInspectorOpen(true);
  }

  function selectTopologyNode(selection: TopologySelection) {
    resetSelection();
    setSelectedTopologyNode(selection);
    setInspectorOpen(true);
  }

  function maxTimelineHeight() {
    const workspaceHeight =
      workspaceGridRef.current?.getBoundingClientRect().height ?? 780;
    return Math.min(
      MAX_TIMELINE_HEIGHT,
      Math.max(MIN_TIMELINE_HEIGHT, workspaceHeight - MIN_TOPOLOGY_HEIGHT),
    );
  }

  function clampTimelineHeight(nextHeight: number) {
    return Math.min(
      maxTimelineHeight(),
      Math.max(MIN_TIMELINE_HEIGHT, Math.round(nextHeight)),
    );
  }

  function updateTimelineHeight(nextHeight: number) {
    setTimelineHeight(clampTimelineHeight(nextHeight));
  }

  function startTimelineResize(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineResizeRef.current = {
      pointerId: event.pointerId,
      startHeight: timelineHeight,
      startY: event.clientY,
    };
  }

  function moveTimelineResize(event: PointerEvent<HTMLDivElement>) {
    const resize = timelineResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    updateTimelineHeight(resize.startHeight + resize.startY - event.clientY);
  }

  function stopTimelineResize(event: PointerEvent<HTMLDivElement>) {
    const resize = timelineResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    timelineResizeRef.current = null;
  }

  function adjustTimelineHeightWithKeyboard(
    event: KeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      updateTimelineHeight(timelineHeight + TIMELINE_RESIZE_STEP);
    }
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      updateTimelineHeight(timelineHeight - TIMELINE_RESIZE_STEP);
    }
  }

  function selectLowerPanelTab(tab: LowerPanelTab) {
    setActiveLowerPanelTab(tab);
    window.localStorage.setItem(LOWER_PANEL_TAB_STORAGE_KEY, tab);
  }

  function navigateLowerPanelTabs(
    event: KeyboardEvent<HTMLButtonElement>,
    currentTab: LowerPanelTab,
  ) {
    const currentIndex = lowerPanelTabs.findIndex(
      (tab) => tab.id === currentTab,
    );
    const lastIndex = lowerPanelTabs.length - 1;
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1;
    }
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = lastIndex;
    if (nextIndex === currentIndex) return;

    event.preventDefault();
    const nextTab = lowerPanelTabs[nextIndex].id;
    selectLowerPanelTab(nextTab);
    lowerPanelTabRefs.current[nextTab]?.focus();
  }

  async function runAction(action: () => Promise<void>) {
    if (actionInFlightRef.current) return;
    actionInFlightRef.current = true;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
    } finally {
      actionInFlightRef.current = false;
      setActionPending(false);
    }
  }

  const workspaceStyle = {
    "--timeline-height": `${timelineHeight}px`,
  } as CSSProperties;
  const inspectorButtonStyle = {
    bottom: run ? `${timelineHeight + 20}px` : "1.25rem",
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
        aria-label="Open message inspector"
        className="fixed right-4 z-30 h-10 px-3 shadow-[5px_5px_0_rgba(15,118,110,0.18)]"
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
          className={`max-h-[420px] min-h-0 overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] p-4 lg:max-h-none lg:border-b-0 lg:border-r-[3px] ${
            run ? "lg:row-span-2" : ""
          }`}
        >
          <ScenarioSidebar scenarios={scenarios} scenarioId={scenarioId} />
          <EducationPanel
            scenarioId={scenarioId}
            snapshot={run}
            selectedMessage={selectedMessage}
          />
        </aside>

        <section className="relative min-h-[560px] border-b-[3px] border-teal-700 bg-[#ecfeff] lg:min-h-0 lg:border-b-0 lg:border-r-[3px]">
          {!run ? (
            <StartRunPanel
              connection={connection}
              disabled={isActionPending}
              onStartRun={startRun}
              onTestRemoteConnection={testRemoteConnection}
              scenario={selectedScenario}
            />
          ) : (
            <KafkaTopology
              snapshot={run}
              selectedMessageId={
                selectedTopologyNode || selectedEventSequence
                  ? null
                  : (selectedMessage?.messageId ?? null)
              }
              selectedNode={selectedTopologyNode}
              onSelectMessage={selectMessage}
              onSelectNode={selectTopologyNode}
            />
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
                className="flex w-12 shrink-0 flex-col items-center gap-2 border-r-2 border-teal-700 bg-[#fff7ed] px-1.5 py-2"
                role="tablist"
              >
                {lowerPanelTabs.map((tab) => {
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
                      className={`grid size-9 place-items-center rounded-xl border-2 text-teal-800 transition focus:outline-none focus:ring-4 focus:ring-sky-200 ${
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
                    hasSequenceGap={state.hasSequenceGap}
                    onSelect={selectEvent}
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

async function refreshSnapshot(
  runId: string,
  dispatch: React.Dispatch<Action>,
) {
  const snapshot = await fetchRunSnapshot(runId);
  if (snapshot) dispatch({ type: "snapshot", snapshot });
}

function isLowerPanelTab(value: string | null): value is LowerPanelTab {
  return lowerPanelTabs.some((tab) => tab.id === value);
}
