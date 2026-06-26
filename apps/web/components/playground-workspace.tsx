"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  runSnapshotSchema,
  runtimeEventSchema,
  runtimeEventTypes,
  type ConnectionStatus,
  type KeyStrategy,
  type RunSnapshot,
  type RuntimeEvent,
  type ScenarioDefinition,
} from "@kplay/contracts";
import { PanelRightOpen } from "lucide-react";
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
  const [isTimelineExpanded, setTimelineExpanded] = useState(false);
  const [selectedTopologyNode, setSelectedTopologyNode] =
    useState<TopologySelection | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const actionInFlightRef = useRef(false);
  const {
    selectedMessageId,
    selectedEventSequence,
    setSelectedMessageId,
    setSelectedEventSequence,
    resetSelection,
  } = usePlaygroundUiStore();
  const run = state.snapshot;
  const currentScenario = scenarios.find(
    (scenario) => scenario.id === scenarioId,
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
    void loadActiveRunSnapshot()
      .then((result) => {
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
      })
      .catch(() => {
        if (!cancelled) setActionError("Unable to load the active run.");
      });
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

  async function startRun() {
    await runAction(async () => {
      const snapshot = await api<RunSnapshot>("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({ scenarioId }),
      });
      dispatch({ type: "snapshot", snapshot });
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

  const workspaceRows = isTimelineExpanded
    ? "lg:grid-rows-[minmax(360px,0.85fr)_minmax(260px,0.65fr)]"
    : "lg:grid-rows-[minmax(470px,1fr)_minmax(160px,0.35fr)]";

  return (
    <main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
      <WorkspaceHeader
        scenarioTitle={currentScenario?.title}
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
        className="fixed bottom-5 right-4 z-30 h-10 px-3 shadow-[5px_5px_0_rgba(15,118,110,0.18)]"
      >
        <PanelRightOpen size={16} aria-hidden />
        <span className="hidden sm:inline">Inspector</span>
      </Button>

      <div
        className={`grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-visible rounded-b-[28px] border-b-[16px] border-teal-700 lg:h-[calc(100vh-4rem)] lg:grid-cols-[260px_minmax(680px,1fr)] ${workspaceRows} lg:overflow-hidden`}
      >
        <aside className="max-h-[420px] min-h-0 overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] p-4 lg:row-span-2 lg:max-h-none lg:border-b-0 lg:border-r-[3px]">
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

        <section
          className={`flex flex-col bg-[#fff7ed] lg:min-h-0 lg:border-r-[3px] lg:border-t-[3px] lg:border-teal-700 ${
            isTimelineExpanded ? "min-h-[720px]" : "min-h-[520px]"
          }`}
          data-testid="timeline-region"
        >
          {run && (
            <>
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
                onAddConsumer={() => mutate("/consumers", { method: "POST" })}
                onStopConsumer={(consumerId) =>
                  mutate(`/consumers/${consumerId}`, { method: "DELETE" })
                }
                onCrashConsumer={(consumerId) =>
                  mutate(`/consumers/${consumerId}/crash`, { method: "POST" })
                }
                onUpdateSettings={updateSettings}
              />
              {!isTimelineExpanded && (
                <ScenarioInsightPanel
                  snapshot={run}
                  disabled={isActionPending}
                  onRunAction={runScenarioAction}
                />
              )}
            </>
          )}
          <EventTimeline
            events={state.events ?? []}
            hasSequenceGap={state.hasSequenceGap}
            expanded={isTimelineExpanded}
            onToggleExpanded={() => setTimelineExpanded((current) => !current)}
            onSelect={selectEvent}
          />
        </section>
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
