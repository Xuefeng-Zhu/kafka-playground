"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  connectionStatusSchema,
  runSnapshotSchema,
  runtimeEventSchema,
  runtimeEventTypes,
  scenarioDefinitionSchema,
  type ConnectionStatus,
  type KeyStrategy,
  type RunSnapshot,
  type RuntimeEvent,
  type ScenarioDefinition,
} from "@kplay/contracts";
import { PanelRightOpen, RotateCcw, SlidersHorizontal } from "lucide-react";
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
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { EducationPanel } from "@/components/education/education-panel";
import { ScenarioInsightPanel } from "@/components/scenario/scenario-insight-panel";
import { ScenarioSidebar } from "@/components/scenario/scenario-sidebar";
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
  const [isInspectorOpen, setInspectorOpen] = useState(false);
  const [isTimelineExpanded, setTimelineExpanded] = useState(false);
  const [selectedTopologyNode, setSelectedTopologyNode] =
    useState<TopologySelection | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
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
    void fetchJson("/api/v1/connection")
      .then((payload) => {
        if (!cancelled) setConnection(connectionStatusSchema.parse(payload));
      })
      .catch(() => {
        if (!cancelled) setConnection(null);
      });
    void fetchJson("/api/v1/scenarios")
      .then((payload) => {
        const parsed = scenarioDefinitionSchema
          .array()
          .parse((payload as { scenarios?: unknown }).scenarios ?? []);
        if (!cancelled) setScenarios(parsed);
      })
      .catch(() => {
        if (!cancelled) setScenarios([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    dispatch({ type: "clear" });

    let cancelled = false;
    void fetchJson("/api/v1/runs")
      .then((payload) => {
        if (cancelled) return;
        resetSelection();
        setSelectedTopologyNode(null);
        setInspectorOpen(false);
        const runPayload =
          payload && typeof payload === "object" && "run" in payload
            ? payload.run
            : null;
        if (!runPayload) return;
        const snapshot = runSnapshotSchema.parse(runPayload);
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
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
    }
  }

  const workspaceRows = isTimelineExpanded
    ? "lg:grid-rows-[minmax(360px,0.85fr)_minmax(260px,0.65fr)]"
    : "lg:grid-rows-[minmax(470px,1fr)_minmax(160px,0.35fr)]";

  return (
    <main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-[3px] border-teal-700 bg-[#fff7ed] px-3 py-3 shadow-[0_6px_0_rgba(15,118,110,0.12)] sm:px-5 lg:h-16 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
            <SlidersHorizontal size={22} strokeWidth={2.6} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="max-w-44 truncate text-base font-extrabold tracking-tight text-[#123047] sm:max-w-none sm:text-lg">
              Kafka Visual Playground
            </h1>
            <p className="hidden max-w-[34rem] truncate text-xs text-[#466778] sm:block">
              {currentScenario?.title ?? "Scenario workspace"}
            </p>
          </div>
          <StatusPill
            label={run?.mode === "aiven" ? "Aiven" : "Demo mode"}
            tone="sky"
          />
          <div className="hidden h-8 w-px bg-teal-700 lg:block" />
          <div className="hidden items-center gap-2 text-sm font-extrabold text-orange-700 sm:flex">
            Aiven-compatible
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
          <div className="hidden min-w-44 border-r-2 border-teal-700 pr-5 md:block">
            <div className="flex items-center gap-2 font-extrabold text-[#123047]">
              <span className="size-2.5 rounded-full bg-emerald-500" />
              {connectionLabel(connection)}
            </div>
            <div className="mt-0.5 truncate text-xs text-[#466778]">
              {connection?.maskedBrokerHost ?? "demo.aivencloud.com:9092"}
            </div>
          </div>
          <div className="hidden items-center gap-3 border-r-2 border-teal-700 pr-5 sm:flex">
            <span className="font-semibold text-[#466778]">Run status</span>
            <StatusPill
              label={run?.status ?? "No run"}
              tone={run?.status === "running" ? "green" : "slate"}
            />
          </div>
          <Button
            onClick={resetRun}
            disabled={!run}
            variant="secondary"
            aria-label="Reset run"
            className="h-9 px-3 sm:px-4"
          >
            <RotateCcw size={15} aria-hidden /> Reset
          </Button>
        </div>
      </header>
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
            <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
              <div className="max-w-xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 text-center shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
                <h2 className="text-2xl font-extrabold text-[#123047]">
                  Start a scenario run
                </h2>
                <p className="mt-3 text-sm leading-6 text-[#466778]">
                  Demo mode creates a scenario-specific topic model and uses
                  simulated Kafka behavior. Aiven mode creates real resources
                  and only displays observed delivery reports and assignments.
                </p>
                <ConnectionNotice connection={connection} />
                <Button className="mt-6" variant="primary" onClick={startRun}>
                  Start scenario run
                </Button>
              </div>
            </div>
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
        <>
          <div
            className="fixed inset-0 z-40 bg-[#123047]/25"
            aria-hidden="true"
            onClick={() => setInspectorOpen(false)}
          />
          <aside
            id="message-inspector-drawer"
            className="fixed bottom-0 right-0 top-0 z-50 w-[min(100vw,390px)] overflow-y-auto border-l-[3px] border-teal-700 bg-[#fff7ed] shadow-[-14px_0_0_rgba(15,118,110,0.16)]"
          >
            <InspectorPanel
              message={selectedMessage}
              event={selectedEvent}
              snapshot={run}
              selectedNode={selectedTopologyNode}
              onPreviousMessage={() => selectAdjacentMessage(-1)}
              onNextMessage={() => selectAdjacentMessage(1)}
              onClose={() => setInspectorOpen(false)}
            />
          </aside>
        </>
      )}
    </main>
  );
}

function ConnectionNotice({
  connection,
}: {
  connection: ConnectionStatus | null;
}) {
  if (!connection || connection.status !== "configuration_missing") return null;
  return (
    <div className="mt-5 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
      <div className="font-extrabold">Configuration missing</div>
      <p className="mt-1 text-amber-900/80">
        Set {connection.missingVariables.join(", ")} or switch
        `KAFKA_MODE=demo`.
      </p>
    </div>
  );
}

function StatusPill({
  label,
  tone,
}: {
  label: string;
  tone: "green" | "amber" | "sky" | "slate";
}) {
  const color = {
    green: "border-emerald-500 bg-emerald-100 text-emerald-800",
    amber: "border-amber-500 bg-amber-100 text-amber-800",
    sky: "border-teal-700 bg-teal-100 text-teal-800",
    slate: "border-teal-700 bg-[#fffdf5] text-teal-800",
  }[tone];
  return (
    <span
      className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${color}`}
    >
      {label}
    </span>
  );
}

function connectionLabel(connection: ConnectionStatus | null) {
  if (!connection) return "Checking";
  if (connection.status === "demo_mode") return "Demo mode";
  if (connection.status === "connected") return "Connected";
  if (connection.status === "configuration_missing")
    return "Configuration missing";
  if (connection.status === "connection_failed") return "Connection failed";
  return "Disconnected";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

async function fetchJson(path: string) {
  const response = await fetch(path);
  if (!response.ok) return null;
  return response.json() as Promise<unknown>;
}

async function produceMessage(runId: string, keyStrategy?: KeyStrategy) {
  return api<RunSnapshot>(`/api/v1/runs/${runId}/messages`, {
    method: "POST",
    body: JSON.stringify(keyStrategy ? { keyStrategy } : {}),
  });
}

async function refreshSnapshot(
  runId: string,
  dispatch: React.Dispatch<Action>,
) {
  const response = await fetch(`/api/v1/runs/${runId}`);
  if (!response.ok) return;
  const snapshot = runSnapshotSchema.parse(await response.json());
  dispatch({ type: "snapshot", snapshot });
}
