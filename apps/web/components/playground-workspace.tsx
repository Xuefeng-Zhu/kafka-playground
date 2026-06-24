"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { ConnectionStatus, KeyStrategy, RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { Activity, Moon, RotateCcw, Sun } from "lucide-react";
import { initializeFromSnapshot, mergeSnapshot, applyRuntimeEvent, initialVisualizationState } from "@/lib/client/visualization-reducer";
import { Button } from "@/components/ui/button";
import { ControlsPanel } from "@/components/controls/controls-panel";
import { KafkaTopology } from "@/components/topology/kafka-topology";
import { EventTimeline } from "@/components/timeline/event-timeline";
import { InspectorPanel } from "@/components/inspector/inspector-panel";
import { EducationPanel } from "@/components/education/education-panel";
import { usePlaygroundUiStore } from "@/lib/client/playground-ui-store";

type Action =
  | { type: "snapshot"; snapshot: RunSnapshot }
  | { type: "event"; event: RuntimeEvent }
  | { type: "clear" };

function reducer(state: typeof initialVisualizationState, action: Action) {
  if (action.type === "snapshot") {
    return state.snapshot ? mergeSnapshot(state, action.snapshot) : initializeFromSnapshot(action.snapshot);
  }
  if (action.type === "event") return applyRuntimeEvent(state, action.event);
  return initialVisualizationState;
}

export function PlaygroundWorkspace() {
  const [state, dispatch] = useReducer(reducer, initialVisualizationState);
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const {
    selectedMessageId,
    selectedEventSequence,
    theme,
    setSelectedMessageId,
    setSelectedEventSequence,
    toggleTheme,
    resetSelection
  } = usePlaygroundUiStore();
  const run = state.snapshot;

  useEffect(() => {
    void fetch("/api/v1/connection").then((res) => res.json()).then(setConnection);
  }, []);

  useEffect(() => {
    void fetch("/api/v1/runs")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { run: RunSnapshot | null } | null) => {
        if (payload?.run) dispatch({ type: "snapshot", snapshot: payload.run });
      });
  }, []);

  useEffect(() => {
    if (!run?.runId) return;
    const source = new EventSource(`/api/v1/runs/${run.runId}/events`);
    source.addEventListener("snapshot", (message) => {
      const payload = JSON.parse(message.data) as { snapshot: RunSnapshot };
      dispatch({ type: "snapshot", snapshot: payload.snapshot });
    });
    source.onmessage = () => undefined;
    const eventTypes = [
      "run.started",
      "run.stopping",
      "run.stopped",
      "run.error",
      "topic.creating",
      "topic.created",
      "producer.starting",
      "producer.started",
      "producer.paused",
      "producer.stopped",
      "message.producing",
      "message.produced",
      "message.received",
      "message.processing_started",
      "message.processing_completed",
      "message.processing_failed",
      "consumer.starting",
      "consumer.started",
      "consumer.partitions_assigned",
      "consumer.partitions_revoked",
      "consumer.idle",
      "consumer.stopping",
      "consumer.stopped",
      "offset.commit_requested",
      "offset.committed",
      "offset.commit_failed",
      "resource.cleanup_started",
      "resource.cleanup_completed",
      "resource.cleanup_failed"
    ];
    eventTypes.forEach((type) => {
      source.addEventListener(type, (message) => {
        dispatch({ type: "event", event: JSON.parse(message.data) as RuntimeEvent });
        void refreshSnapshot(run.runId, dispatch);
      });
    });
    return () => source.close();
  }, [run?.runId]);

  const selectedMessage = useMemo(
    () => run?.recentMessages?.find((message) => message.messageId === selectedMessageId) ?? run?.recentMessages?.at(-1) ?? null,
    [run?.recentMessages, selectedMessageId]
  );
  const selectedEvent = useMemo(
    () => (state.events ?? []).find((event) => event.sequence === selectedEventSequence) ?? (state.events ?? []).at(-1) ?? null,
    [state.events, selectedEventSequence]
  );

  async function startRun() {
    const snapshot = await api<RunSnapshot>("/api/v1/runs", {
      method: "POST",
      body: JSON.stringify({ scenarioId: "partitioning" })
    });
    dispatch({ type: "snapshot", snapshot });
  }

  async function resetRun() {
    if (!run) return;
    await api(`/api/v1/runs/${run.runId}/reset`, { method: "POST" });
    resetSelection();
    dispatch({ type: "clear" });
  }

  async function mutate(path: string, init?: RequestInit) {
    if (!run) return;
    const snapshot = await api<RunSnapshot>(`/api/v1/runs/${run.runId}${path}`, init);
    dispatch({ type: "snapshot", snapshot });
  }

  async function updateSettings(settings: {
    productionRate?: number;
    keyStrategy?: KeyStrategy;
    processingLatencyMs?: number;
  }) {
    await mutate("/settings", {
      method: "PATCH",
      body: JSON.stringify(settings)
    });
  }

  return (
    <main className={theme === "dark" ? "min-h-screen bg-[#080b10] text-slate-100" : "min-h-screen bg-slate-100 text-slate-950"}>
      <header className="flex h-16 items-center justify-between border-b border-slate-800 bg-[#0b0f16] px-5">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-md border border-sky-400/40 bg-sky-400/10 text-sky-300">
            <Activity size={18} aria-hidden />
          </div>
          <div>
            <h1 className="text-base font-semibold">Kafka Visual Playground</h1>
            <p className="text-xs text-slate-400">Partitioning, ordering, and rebalancing</p>
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <StatusPill label={connectionLabel(connection)} tone={connection?.status === "demo_mode" || connection?.status === "connected" ? "green" : "amber"} />
          <StatusPill label={run?.mode === "aiven" ? "Aiven" : "Demo mode"} tone={run?.mode === "aiven" ? "sky" : "amber"} />
          <StatusPill label={run?.status ?? "No run"} tone={run?.status === "running" ? "green" : "slate"} />
          <Button onClick={resetRun} disabled={!run} variant="danger" aria-label="Reset run">
            <RotateCcw size={15} aria-hidden /> Reset
          </Button>
          <Button
            onClick={toggleTheme}
            variant="ghost"
            aria-label="Toggle light and dark theme"
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </Button>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[280px_minmax(680px,1fr)_360px] grid-rows-[1fr_270px]">
        <aside className="row-span-2 border-r border-slate-800 bg-[#0b0f16] p-4">
          <ScenarioSidebar />
          <EducationPanel snapshot={run} selectedMessage={selectedMessage} />
        </aside>

        <section className="relative border-r border-slate-800 bg-[#080b10]">
          {!run ? (
            <div className="flex h-full items-center justify-center p-10">
              <div className="max-w-xl text-center">
                <h2 className="text-2xl font-semibold">Start a scenario run</h2>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  Demo mode creates a two-partition topic model and uses simulated Kafka behavior. Aiven mode
                  creates real resources and only displays observed delivery reports and assignments.
                </p>
                <ConnectionNotice connection={connection} />
                <Button className="mt-6" variant="primary" onClick={startRun}>Start scenario run</Button>
              </div>
            </div>
          ) : (
            <KafkaTopology
              snapshot={run}
              selectedMessageId={selectedMessage?.messageId ?? null}
              onSelectMessage={setSelectedMessageId}
            />
          )}
        </section>

        <aside className="row-span-2 bg-[#0e131b] p-4">
          <InspectorPanel message={selectedMessage} event={selectedEvent} snapshot={run} />
        </aside>

        <section className="border-t border-r border-slate-800 bg-[#0b0f16]">
          {run && (
            <ControlsPanel
              snapshot={run}
              onStartProducer={() => mutate("/producer/start", { method: "POST" })}
              onPauseProducer={() => mutate("/producer/pause", { method: "POST" })}
              onStopProducer={() => mutate("/producer/stop", { method: "POST" })}
              onProduceOne={() => mutate("/messages", { method: "POST", body: "{}" })}
              onAddConsumer={() => mutate("/consumers", { method: "POST" })}
              onStopConsumer={(consumerId) => mutate(`/consumers/${consumerId}`, { method: "DELETE" })}
              onUpdateSettings={updateSettings}
            />
          )}
          <EventTimeline
            events={state.events ?? []}
            hasSequenceGap={state.hasSequenceGap}
            onSelect={setSelectedEventSequence}
          />
        </section>
      </div>
    </main>
  );
}

function ConnectionNotice({ connection }: { connection: ConnectionStatus | null }) {
  if (!connection || connection.status !== "configuration_missing") return null;
  return (
    <div className="mt-5 rounded-lg border border-amber-400/40 bg-amber-400/10 p-3 text-left text-sm text-amber-100">
      <div className="font-semibold">Configuration missing</div>
      <p className="mt-1 text-amber-100/80">
        Set {connection.missingVariables.join(", ")} or switch `KAFKA_MODE=demo`.
      </p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "sky" | "slate" }) {
  const color = {
    green: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
    amber: "border-amber-400/40 bg-amber-400/10 text-amber-200",
    sky: "border-sky-400/40 bg-sky-400/10 text-sky-200",
    slate: "border-slate-700 bg-slate-900 text-slate-300"
  }[tone];
  return <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

function ScenarioSidebar() {
  const future = [
    "Fan-out versus load balancing",
    "At-least-once delivery and duplicate processing",
    "Retry topics and dead-letter queues",
    "Schema evolution using Karapace",
    "Idempotent and transactional producers",
    "Event replay and event sourcing"
  ];
  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Scenarios</h2>
      <div className="mt-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
        <h3 className="text-sm font-semibold text-sky-100">Partitioning and rebalancing</h3>
        <p className="mt-2 text-xs leading-5 text-sky-100/75">One topic, two partitions, one producer, and up to three consumers.</p>
      </div>
      <div className="mt-3 space-y-2">
        {future.map((item) => (
          <div key={item} className="rounded-md border border-slate-800 p-3 text-xs text-slate-500" aria-disabled>
            <div className="font-semibold text-slate-400">{item}</div>
            <div className="mt-1">Coming soon</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function connectionLabel(connection: ConnectionStatus | null) {
  if (!connection) return "Checking";
  if (connection.status === "demo_mode") return "Demo mode";
  if (connection.status === "connected") return "Connected";
  if (connection.status === "configuration_missing") return "Configuration missing";
  if (connection.status === "connection_failed") return "Connection failed";
  return "Disconnected";
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? response.statusText);
  }
  return response.json() as Promise<T>;
}

async function refreshSnapshot(runId: string, dispatch: React.Dispatch<Action>) {
  const response = await fetch(`/api/v1/runs/${runId}`);
  if (!response.ok) return;
  const snapshot = (await response.json()) as RunSnapshot;
  if (!snapshot.runId || !Array.isArray(snapshot.consumers)) return;
  dispatch({ type: "snapshot", snapshot });
}
