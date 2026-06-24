"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { ConnectionStatus, KeyStrategy, RunSnapshot, RuntimeEvent, ScenarioDefinition } from "@kplay/contracts";
import { BookOpen, Grid3X3, Moon, Network, RotateCcw, Settings, Sun } from "lucide-react";
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
  const [scenarios, setScenarios] = useState<ScenarioDefinition[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
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
    void fetch("/api/v1/scenarios")
      .then((res) => (res.ok ? res.json() : null))
      .then((payload: { scenarios: ScenarioDefinition[] } | null) => {
        if (payload?.scenarios) setScenarios(payload.scenarios);
      });
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
    await runAction(async () => {
      const snapshot = await api<RunSnapshot>("/api/v1/runs", {
        method: "POST",
        body: JSON.stringify({ scenarioId: "partitioning" })
      });
      dispatch({ type: "snapshot", snapshot });
    });
  }

  async function resetRun() {
    if (!run) return;
    await runAction(async () => {
      await api(`/api/v1/runs/${run.runId}/reset`, { method: "POST" });
      resetSelection();
      dispatch({ type: "clear" });
    });
  }

  async function mutate(path: string, init?: RequestInit) {
    if (!run) return;
    await runAction(async () => {
      const snapshot = await api<RunSnapshot>(`/api/v1/runs/${run.runId}${path}`, init);
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
      body: JSON.stringify(settings)
    });
  }

  async function runAction(action: () => Promise<void>) {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
    }
  }

  return (
    <main className={theme === "dark" ? "min-h-screen overflow-auto bg-[#05090d] text-slate-100 lg:h-screen lg:overflow-hidden" : "min-h-screen overflow-auto bg-slate-100 text-slate-950 lg:h-screen lg:overflow-hidden"}>
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-800/90 bg-[#070c11] px-3 py-3 shadow-[0_1px_0_rgba(255,255,255,0.03)] sm:px-5 lg:h-16 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="flex size-8 shrink-0 items-center justify-center text-slate-100 sm:size-9">
            <Network size={28} strokeWidth={2.2} aria-hidden />
          </div>
          <h1 className="max-w-44 truncate text-base font-semibold tracking-tight text-slate-50 sm:max-w-none sm:text-lg">Kafka Visual Playground</h1>
          <StatusPill label={run?.mode === "aiven" ? "Aiven" : "Demo"} tone={run?.mode === "aiven" ? "sky" : "sky"} />
          <div className="hidden h-8 w-px bg-slate-700 lg:block" />
          <div className="hidden items-center gap-2 text-lg font-semibold text-slate-200 sm:flex">
            <span className="text-orange-500">aiven</span>
          </div>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-sm sm:gap-4">
          <div className="hidden min-w-44 border-r border-slate-700 pr-5 md:block">
            <div className="flex items-center gap-2 font-semibold text-slate-100">
              <span className="size-2 rounded-full bg-emerald-400" />
              {connectionLabel(connection)}
            </div>
            <div className="mt-0.5 truncate text-xs text-slate-400">{connection?.maskedBrokerHost ?? "demo.aivencloud.com:9092"}</div>
          </div>
          <div className="hidden items-center gap-3 border-r border-slate-700 pr-5 sm:flex">
            <span className="text-slate-300">Run status</span>
            <StatusPill label={run?.status ?? "No run"} tone={run?.status === "running" ? "green" : "slate"} />
          </div>
          <Button onClick={resetRun} disabled={!run} variant="secondary" aria-label="Reset run" className="h-9 border-slate-600 bg-transparent px-3 sm:px-4">
            <RotateCcw size={15} aria-hidden /> Reset
          </Button>
          <Button
            onClick={toggleTheme}
            variant="ghost"
            aria-label="Toggle light and dark theme"
            className="h-9 rounded-full border border-slate-700 bg-slate-900/70 px-3"
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
            <Moon size={15} className="text-slate-400" aria-hidden />
          </Button>
        </div>
      </header>
      {actionError && (
        <div role="alert" className="border-b border-rose-400/40 bg-rose-950 px-5 py-2 text-sm text-rose-100">
          {actionError}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-visible lg:h-[calc(100vh-4rem)] lg:grid-cols-[60px_260px_minmax(680px,1fr)_360px] lg:grid-rows-[minmax(0,1fr)_340px] lg:overflow-hidden">
        <UtilityRail />
        <aside className="max-h-[420px] min-h-0 overflow-y-auto border-b border-slate-800 bg-[#0b0f16] p-4 lg:row-span-2 lg:max-h-none lg:border-b-0 lg:border-r">
          <ScenarioSidebar scenarios={scenarios} />
          <EducationPanel snapshot={run} selectedMessage={selectedMessage} />
        </aside>

        <section className="relative min-h-[560px] border-b border-slate-800 bg-[#070b10] lg:min-h-0 lg:border-b-0 lg:border-r">
          {!run ? (
            <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
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

        <aside className="min-h-[420px] overflow-y-auto border-b border-slate-800 bg-[#0b1016] lg:row-span-2 lg:min-h-0 lg:border-b-0 lg:border-l">
          <InspectorPanel message={selectedMessage} event={selectedEvent} snapshot={run} />
        </aside>

        <section className="flex min-h-[520px] flex-col bg-[#0b0f16] lg:min-h-0 lg:border-t lg:border-r">
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
    green: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300",
    amber: "border-amber-500/30 bg-amber-500/15 text-amber-200",
    sky: "border-sky-500/40 bg-sky-500/15 text-sky-300",
    slate: "border-slate-700 bg-slate-900 text-slate-300"
  }[tone];
  return <span className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${color}`}>{label}</span>;
}

function ScenarioSidebar({ scenarios }: { scenarios: ScenarioDefinition[] }) {
  const primary = scenarios.find((scenario) => !scenario.disabled);
  const future = scenarios.filter((scenario) => scenario.disabled);
  const shownFuture = future.slice(0, 5);
  return (
    <div className="min-h-0">
      <h2 className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Scenarios</h2>
      <div className="mt-3 rounded-md border border-sky-500 bg-sky-500/10 p-3 shadow-[inset_0_0_24px_rgba(59,130,246,0.08)]">
        <div className="flex items-start gap-3">
          <Grid3X3 className="mt-0.5 shrink-0 text-sky-400" size={24} aria-hidden />
          <div>
            <h3 className="text-sm font-semibold text-sky-100">Partitioning</h3>
            <p className="mt-1 text-xs leading-5 text-sky-100/75">
              {primary?.description ?? "Understand how messages are distributed across partitions."}
            </p>
          </div>
          <span className="ml-auto mt-7 size-2.5 rounded-full bg-sky-400" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {shownFuture.map((scenario) => (
          <div key={scenario.id} className="rounded-md border border-slate-700/80 bg-slate-950/30 p-3 text-xs text-slate-500" aria-disabled>
            <div className="flex gap-3">
              <Network className="mt-0.5 shrink-0 text-slate-500" size={22} aria-hidden />
              <div>
                <div className="font-semibold text-slate-400">{scenario.title}</div>
                <div className="mt-1 leading-5">{scenario.description}</div>
                <div className="mt-2 text-slate-500">Locked</div>
              </div>
            </div>
          </div>
        ))}
        {future.length > shownFuture.length && (
          <div className="rounded-md border border-slate-800 bg-slate-950/30 p-3 text-xs text-slate-500">
            {future.length - shownFuture.length} more planned scenarios in backlog
          </div>
        )}
      </div>
      <a
        href="#how-it-works"
        className="mt-3 flex items-center justify-between rounded-md border border-slate-700 bg-slate-950/40 px-3 py-2 text-xs font-semibold text-slate-200"
      >
        <span className="flex items-center gap-2"><BookOpen size={15} aria-hidden /> How it works</span>
        <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

function UtilityRail() {
  return (
    <nav className="flex items-center gap-2 border-b border-slate-800 bg-[#080d13] px-2 py-2 text-slate-400 lg:row-span-2 lg:flex-col lg:border-b-0 lg:border-r lg:px-1.5 lg:py-4">
      {[
        { label: "Events", icon: Grid3X3, active: true },
        { label: "Topology", icon: Network },
        { label: "Config", icon: Settings }
      ].map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            className={`flex flex-1 items-center justify-center gap-2 rounded-md px-2 py-2 text-[11px] font-medium lg:w-full lg:flex-none lg:flex-col lg:gap-1 lg:px-1 lg:py-3 ${
              item.active ? "bg-sky-500/10 text-sky-300" : "hover:bg-slate-900 hover:text-slate-200"
            }`}
          >
            <Icon size={19} aria-hidden />
            {item.label}
          </button>
        );
      })}
    </nav>
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
