"use client";

import type { KeyStrategy, RunSnapshot } from "@kplay/contracts";
import {
  Pause,
  Play,
  Plus,
  Send,
  Square,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function ControlsPanel({
  snapshot,
  onStartProducer,
  onPauseProducer,
  onStopProducer,
  onProduceOne,
  onAddConsumer,
  onStopConsumer,
  onCrashConsumer,
  onUpdateSettings,
  disabled = false,
}: {
  snapshot: RunSnapshot;
  disabled?: boolean;
  onStartProducer: () => void;
  onPauseProducer: () => void;
  onStopProducer: () => void;
  onProduceOne: () => void;
  onAddConsumer: () => void;
  onStopConsumer: (consumerId: string) => void;
  onCrashConsumer: (consumerId: string) => void;
  onUpdateSettings: (settings: {
    productionRate?: number;
    keyStrategy?: KeyStrategy;
    processingLatencyMs?: number;
  }) => void;
}) {
  const fixedValue =
    snapshot.keyStrategy.type === "fixed"
      ? snapshot.keyStrategy.value
      : "user-1";
  const activeConsumerCount = snapshot.consumers.filter(
    (consumer) => consumer.status !== "crashed",
  ).length;

  return (
    <div
      className="mx-3 mt-3 rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-2 shadow-[5px_5px_0_rgba(15,118,110,0.12)]"
      data-testid="run-controls-panel"
    >
      <section className="flex flex-wrap items-center gap-2">
        <h3 className="sr-only">Run controls</h3>
        <div className="flex min-w-[150px] items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-100 px-3 py-2 text-xs">
          <span
            className={`size-2 rounded-full ${snapshot.producerStatus === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
          />
          <span className="text-[#466778]">Status:</span>
          <span className="font-extrabold text-emerald-800">
            {snapshot.producerStatus}
          </span>
        </div>
        {snapshot.producerStatus !== "running" && (
          <Button
            onClick={onStartProducer}
            disabled={disabled}
            variant="primary"
            className="h-9 px-3 text-xs"
          >
            <Play size={15} aria-hidden /> Start
          </Button>
        )}
        <Button
          onClick={onPauseProducer}
          disabled={disabled || snapshot.producerStatus !== "running"}
          className="h-9 px-3 text-xs"
        >
          <Pause size={15} aria-hidden /> Pause
        </Button>
        <Button
          onClick={onStopProducer}
          disabled={disabled}
          variant="danger"
          className="h-9 px-3 text-xs"
        >
          <Square size={14} aria-hidden /> Stop
        </Button>
        <Button
          onClick={onProduceOne}
          disabled={disabled}
          variant="primary"
          className="h-9 px-3 text-xs"
        >
          <Send size={14} aria-hidden /> Produce one
        </Button>
        <Button
          onClick={onAddConsumer}
          disabled={disabled || activeConsumerCount >= snapshot.consumerLimit}
          variant="primary"
          className="h-9 px-3 text-xs"
        >
          <Plus size={15} aria-hidden /> Consumer
        </Button>
      </section>

      <div
        className="mt-2 grid grid-cols-1 items-start gap-3 border-t-2 border-teal-700 pt-3 sm:grid-cols-2 xl:grid-cols-4"
        data-testid="run-settings-panel"
        id="run-settings-panel"
      >
        <label className="grid min-h-[76px] grid-rows-[16px_36px_12px] gap-1.5 text-xs text-[#466778]">
          <span className="kplay-section-title">Rate</span>
          <input
            aria-label="Messages per second"
            className="h-9 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 text-sm font-semibold text-[#123047]"
            min={1}
            max={10}
            type="number"
            value={snapshot.productionRate}
            disabled={disabled}
            onChange={(event) => {
              const productionRate = parseNumberInput(event.target.value, {
                min: 1,
                max: 10,
              });
              if (productionRate !== null) {
                onUpdateSettings({ productionRate });
              }
            }}
          />
          <input
            aria-label="Produce rate slider"
            className="h-3 w-full accent-sky-500"
            min={1}
            max={10}
            type="range"
            value={snapshot.productionRate}
            disabled={disabled}
            onChange={(event) => {
              const productionRate = parseNumberInput(event.target.value, {
                min: 1,
                max: 10,
              });
              if (productionRate !== null) {
                onUpdateSettings({ productionRate });
              }
            }}
          />
        </label>

        <label className="grid min-h-[76px] grid-rows-[16px_36px_12px] gap-1.5 text-xs text-[#466778]">
          <span className="kplay-section-title">Latency</span>
          <input
            aria-label="Consumer processing latency"
            className="h-9 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 text-sm font-semibold text-[#123047]"
            min={0}
            max={5000}
            step={100}
            type="number"
            value={snapshot.processingLatencyMs}
            disabled={disabled}
            onChange={(event) => {
              const processingLatencyMs = parseNumberInput(event.target.value, {
                min: 0,
                max: 5000,
              });
              if (processingLatencyMs !== null) {
                onUpdateSettings({ processingLatencyMs });
              }
            }}
          />
          <input
            aria-label="Processing latency slider"
            className="h-3 w-full accent-amber-500"
            min={0}
            max={5000}
            step={100}
            type="range"
            value={snapshot.processingLatencyMs}
            disabled={disabled}
            onChange={(event) => {
              const processingLatencyMs = parseNumberInput(event.target.value, {
                min: 0,
                max: 5000,
              });
              if (processingLatencyMs !== null) {
                onUpdateSettings({ processingLatencyMs });
              }
            }}
          />
        </label>

        <section className="grid min-h-[76px] grid-rows-[16px_36px_12px] gap-1.5">
          <label className="kplay-section-title" htmlFor="key-strategy">
            Key strategy
          </label>
          <select
            id="key-strategy"
            className="h-9 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 text-sm font-semibold text-[#123047]"
            value={snapshot.keyStrategy.type}
            disabled={disabled}
            onChange={(event) => {
              const value = event.target.value;
              onUpdateSettings({
                keyStrategy:
                  value === "fixed"
                    ? { type: "fixed", value: fixedValue }
                    : value === "round_robin_users"
                      ? { type: "round_robin_users" }
                      : value === "random_user"
                        ? { type: "random_user" }
                        : { type: "no_key" },
              });
            }}
          >
            <option value="fixed">Fixed key</option>
            <option value="round_robin_users">Three user IDs</option>
            <option value="random_user">Random user ID</option>
            <option value="no_key">No key</option>
          </select>
          {snapshot.keyStrategy.type === "fixed" && (
            <input
              aria-label="Fixed key"
              className="h-9 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 text-sm font-semibold text-[#123047]"
              value={fixedValue}
              disabled={disabled}
              onChange={(event) =>
                onUpdateSettings({
                  keyStrategy: {
                    type: "fixed",
                    value: event.target.value || "user-1",
                  },
                })
              }
            />
          )}
          {snapshot.keyStrategy.type !== "fixed" && (
            <span className="h-3" aria-hidden />
          )}
        </section>

        <section className="grid min-h-[76px] grid-rows-[16px_minmax(36px,auto)_12px] gap-1.5">
          <h3 className="kplay-section-title">Consumers</h3>
          <div className="flex min-h-9 flex-wrap items-center gap-2">
            {snapshot.consumers.length === 0 ? (
              <span className="rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800">
                0 consumers
              </span>
            ) : (
              snapshot.consumers.map((consumer) => (
                <div
                  key={consumer.consumerId}
                  className="flex items-center gap-1"
                >
                  {consumer.status === "crashed" ? (
                    <span className="inline-flex h-9 items-center gap-1 rounded-xl border-2 border-rose-500 bg-rose-100 px-2 text-xs font-extrabold text-rose-800">
                      <TriangleAlert size={14} aria-hidden />{" "}
                      {consumer.consumerId.replace("consumer-", "C")} crashed
                    </span>
                  ) : (
                    <>
                      <Button
                        onClick={() => onStopConsumer(consumer.consumerId)}
                        disabled={disabled}
                        variant="ghost"
                        aria-label={`Stop ${consumer.consumerId}`}
                        className="h-9 px-2 text-xs"
                      >
                        <X size={14} aria-hidden />{" "}
                        {consumer.consumerId.replace("consumer-", "C")}
                      </Button>
                      <Button
                        onClick={() => onCrashConsumer(consumer.consumerId)}
                        disabled={disabled}
                        variant="danger"
                        aria-label={`Crash ${consumer.consumerId}`}
                        className="h-9 px-2 text-xs"
                      >
                        <TriangleAlert size={14} aria-hidden /> Crash
                      </Button>
                    </>
                  )}
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function parseNumberInput(
  value: string,
  { max, min }: { max: number; min: number },
) {
  if (value.trim() === "") {
    return null;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return null;
  }
  return parsed;
}
