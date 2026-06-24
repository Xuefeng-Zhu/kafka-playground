"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import type { ConnectionStatus, KeyStrategy, RunSnapshot, RuntimeEvent, ScenarioDefinition } from "@kplay/contracts";
import { BookOpen, Grid3X3, Moon, Network, RotateCcw, Settings, Sun, SlidersHorizontal } from "lucide-react";
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
    <main className="min-h-screen overflow-auto bg-[var(--kplay-bg)] text-[var(--kplay-text)] lg:h-screen lg:overflow-hidden">
      <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-[3px] border-teal-700 bg-[#fff7ed] px-3 py-3 shadow-[0_6px_0_rgba(15,118,110,0.12)] sm:px-5 lg:h-16 lg:flex-nowrap lg:py-0">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
            <SlidersHorizontal size={22} strokeWidth={2.6} aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="max-w-44 truncate text-base font-extrabold tracking-tight text-[#123047] sm:max-w-none sm:text-lg">Kafka Visual Playground</h1>
            <p className="hidden text-xs text-[#466778] sm:block">Partitioning · rebalances · manual commits</p>
          </div>
          <StatusPill label={run?.mode === "aiven" ? "Aiven" : "Demo mode"} tone="sky" />
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
            <div className="mt-0.5 truncate text-xs text-[#466778]">{connection?.maskedBrokerHost ?? "demo.aivencloud.com:9092"}</div>
          </div>
          <div className="hidden items-center gap-3 border-r-2 border-teal-700 pr-5 sm:flex">
            <span className="font-semibold text-[#466778]">Run status</span>
            <StatusPill label={run?.status ?? "No run"} tone={run?.status === "running" ? "green" : "slate"} />
          </div>
          <Button onClick={resetRun} disabled={!run} variant="secondary" aria-label="Reset run" className="h-9 px-3 sm:px-4">
            <RotateCcw size={15} aria-hidden /> Reset
          </Button>
          <Button
            onClick={toggleTheme}
            variant="ghost"
            aria-label="Toggle light and dark theme"
            className="h-9 rounded-full px-3"
          >
            {theme === "dark" ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />}
          </Button>
        </div>
      </header>
      {actionError && (
        <div role="alert" className="border-b-[3px] border-rose-700 bg-rose-100 px-5 py-2 text-sm font-semibold text-rose-800">
          {actionError}
        </div>
      )}

      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-1 overflow-visible rounded-b-[28px] border-b-[16px] border-teal-700 lg:h-[calc(100vh-4rem)] lg:grid-cols-[60px_260px_minmax(680px,1fr)_360px] lg:grid-rows-[minmax(0,1fr)_340px] lg:overflow-hidden">
        <UtilityRail />
        <aside className="max-h-[420px] min-h-0 overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] p-4 lg:row-span-2 lg:max-h-none lg:border-b-0 lg:border-r-[3px]">
          <ScenarioSidebar scenarios={scenarios} />
          <EducationPanel snapshot={run} selectedMessage={selectedMessage} />
        </aside>

        <section className="relative min-h-[560px] border-b-[3px] border-teal-700 bg-[#ecfeff] lg:min-h-0 lg:border-b-0 lg:border-r-[3px]">
          {!run ? (
            <div className="kplay-grid-bg flex h-full items-center justify-center p-10">
              <div className="max-w-xl rounded-3xl border-[3px] border-teal-700 bg-[#fffdf5] p-8 text-center shadow-[12px_12px_0_rgba(15,118,110,0.22)]">
                <h2 className="text-2xl font-extrabold text-[#123047]">Start a scenario run</h2>
                <p className="mt-3 text-sm leading-6 text-[#466778]">
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

        <aside className="min-h-[420px] overflow-y-auto border-b-[3px] border-teal-700 bg-[#fff7ed] lg:row-span-2 lg:min-h-0 lg:border-b-0 lg:border-l-[3px]">
          <InspectorPanel message={selectedMessage} event={selectedEvent} snapshot={run} />
        </aside>

        <section className="flex min-h-[520px] flex-col bg-[#fff7ed] lg:min-h-0 lg:border-r-[3px] lg:border-t-[3px] lg:border-teal-700">
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
    <div className="mt-5 rounded-2xl border-[3px] border-amber-500 bg-amber-100 p-3 text-left text-sm text-amber-900 shadow-[7px_7px_0_rgba(245,158,11,0.18)]">
      <div className="font-extrabold">Configuration missing</div>
      <p className="mt-1 text-amber-900/80">
        Set {connection.missingVariables.join(", ")} or switch `KAFKA_MODE=demo`.
      </p>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: "green" | "amber" | "sky" | "slate" }) {
  const color = {
    green: "border-emerald-500 bg-emerald-100 text-emerald-800",
    amber: "border-amber-500 bg-amber-100 text-amber-800",
    sky: "border-teal-700 bg-teal-100 text-teal-800",
    slate: "border-teal-700 bg-[#fffdf5] text-teal-800"
  }[tone];
  return <span className={`rounded-full border-2 px-3 py-1 text-xs font-extrabold ${color}`}>{label}</span>;
}

function ScenarioSidebar({ scenarios }: { scenarios: ScenarioDefinition[] }) {
  const primary = scenarios.find((scenario) => !scenario.disabled);
  const future = scenarios.filter((scenario) => scenario.disabled);
  const shownFuture = future.slice(0, 5);
  return (
    <div className="min-h-0">
      <h2 className="kplay-section-title">Scenario</h2>
      <div className="mt-3 rounded-2xl border-[3px] border-teal-700 bg-teal-100 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
        <div className="flex items-start gap-3">
          <Grid3X3 className="mt-0.5 shrink-0 text-teal-700" size={24} aria-hidden />
          <div>
            <h3 className="text-sm font-extrabold text-[#123047]">Partitioning</h3>
            <p className="mt-1 text-xs leading-5 text-[#31566a]">
              {primary?.description ?? "Understand how messages are distributed across partitions."}
            </p>
          </div>
          <span className="ml-auto mt-7 size-2.5 rounded-full bg-sky-500" />
        </div>
      </div>
      <div className="mt-3 space-y-2">
        {shownFuture.map((scenario) => (
          <div key={scenario.id} className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs text-[#466778] shadow-[7px_7px_0_rgba(15,118,110,0.1)]" aria-disabled>
            <div className="flex gap-3">
              <Network className="mt-0.5 shrink-0 text-teal-700" size={22} aria-hidden />
              <div>
                <div className="font-extrabold text-[#123047]">{scenario.title}</div>
                <div className="mt-1 leading-5">{scenario.description}</div>
                <div className="mt-2 font-extrabold text-[#60798d]">Locked</div>
              </div>
            </div>
          </div>
        ))}
        {future.length > shownFuture.length && (
          <div className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold text-[#466778]">
            {future.length - shownFuture.length} more planned scenarios in backlog
          </div>
        )}
      </div>
      <a
        href="#how-it-works"
        className="mt-3 flex items-center justify-between rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800 shadow-[7px_7px_0_rgba(15,118,110,0.1)]"
      >
        <span className="flex items-center gap-2"><BookOpen size={15} aria-hidden /> How it works</span>
        <span aria-hidden>↗</span>
      </a>
    </div>
  );
}

function UtilityRail() {
  return (
    <nav className="flex items-center gap-2 border-b-[3px] border-teal-700 bg-[#ecfeff] px-2 py-2 text-teal-700 lg:row-span-2 lg:flex-col lg:border-b-0 lg:border-r-[3px] lg:px-1.5 lg:py-4">
      {[
        { label: "Events", icon: Grid3X3, active: true },
        { label: "Topology", icon: Network },
        { label: "Config", icon: Settings }
      ].map((item) => {
        const Icon = item.icon;
        return (
          <button
            key={item.label}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-2 py-2 text-[11px] font-extrabold lg:w-full lg:flex-none lg:flex-col lg:gap-1 lg:px-1 lg:py-3 ${
              item.active ? "bg-teal-100 text-teal-800 shadow-[inset_0_0_0_2px_#0f766e,4px_4px_0_rgba(15,118,110,0.16)]" : "hover:bg-teal-50 hover:text-teal-900"
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
