"use client";

import { useState } from "react";
import type { KeyStrategy, RunSnapshot } from "@kplay/contracts";
import { Pause, Play, Plus, Send, Settings2, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const RUN_CONTROLS_STORAGE_KEY = "kplay.runControls.expanded";

export function ControlsPanel({
  snapshot,
  onStartProducer,
  onPauseProducer,
  onStopProducer,
  onProduceOne,
  onAddConsumer,
  onStopConsumer,
  onUpdateSettings
}: {
  snapshot: RunSnapshot;
  onStartProducer: () => void;
  onPauseProducer: () => void;
  onStopProducer: () => void;
  onProduceOne: () => void;
  onAddConsumer: () => void;
  onStopConsumer: (consumerId: string) => void;
  onUpdateSettings: (settings: {
    productionRate?: number;
    keyStrategy?: KeyStrategy;
    processingLatencyMs?: number;
  }) => void;
}) {
  const fixedValue = snapshot.keyStrategy.type === "fixed" ? snapshot.keyStrategy.value : "user-1";
  const [isExpanded, setExpanded] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem(RUN_CONTROLS_STORAGE_KEY) === "true"
  );

  function toggleExpanded() {
    setExpanded((current) => {
      const next = !current;
      window.localStorage.setItem(RUN_CONTROLS_STORAGE_KEY, String(next));
      return next;
    });
  }

  return (
    <div className="mx-3 mt-3 rounded-2xl border-2 border-teal-700 bg-[#fffdf5] p-2 shadow-[5px_5px_0_rgba(15,118,110,0.12)]" data-testid="run-controls-panel">
      <section className="flex flex-wrap items-center gap-2">
        <h3 className="sr-only">Run controls</h3>
        <div className="flex min-w-[150px] items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-100 px-3 py-2 text-xs">
          <span className={`size-2 rounded-full ${snapshot.producerStatus === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="text-[#466778]">Status:</span>
          <span className="font-extrabold text-emerald-800">{snapshot.producerStatus}</span>
        </div>
        {snapshot.producerStatus !== "running" && (
          <Button onClick={onStartProducer} variant="primary" className="h-9 px-3 text-xs">
            <Play size={15} aria-hidden /> Start
          </Button>
        )}
        <Button onClick={onPauseProducer} disabled={snapshot.producerStatus !== "running"} className="h-9 px-3 text-xs">
          <Pause size={15} aria-hidden /> Pause
        </Button>
        <Button onClick={onStopProducer} variant="danger" className="h-9 px-3 text-xs">
          <Square size={14} aria-hidden /> Stop
        </Button>
        <Button onClick={onProduceOne} variant="primary" className="h-9 px-3 text-xs">
          <Send size={14} aria-hidden /> Produce one
        </Button>
        <Button onClick={onAddConsumer} disabled={snapshot.consumers.length >= 3} variant="primary" className="h-9 px-3 text-xs">
          <Plus size={15} aria-hidden /> Consumer
        </Button>
        <Button
          aria-controls="run-settings-panel"
          aria-expanded={isExpanded}
          className="ml-auto h-9 px-3 text-xs"
          data-testid="run-settings-toggle"
          onClick={toggleExpanded}
          variant="secondary"
        >
          <Settings2 size={15} aria-hidden /> Settings
        </Button>
      </section>

      {isExpanded && (
        <div
          className="mt-2 grid grid-cols-1 gap-3 border-t-2 border-teal-700 pt-3 sm:grid-cols-2 lg:grid-cols-[110px_140px_120px_minmax(180px,1fr)]"
          data-testid="run-settings-panel"
          id="run-settings-panel"
        >
          <label className="text-xs text-[#466778]">
            <span className="mb-2 block kplay-section-title">Rate</span>
            <input
              aria-label="Messages per second"
              className="mb-2 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 text-sm font-semibold text-[#123047]"
              min={1}
              max={10}
              type="number"
              value={snapshot.productionRate}
              onChange={(event) => onUpdateSettings({ productionRate: Number(event.target.value) })}
            />
            <input
              aria-label="Produce rate slider"
              className="w-full accent-sky-500"
              min={1}
              max={10}
              type="range"
              value={snapshot.productionRate}
              onChange={(event) => onUpdateSettings({ productionRate: Number(event.target.value) })}
            />
          </label>

          <section>
            <label className="mb-2 block kplay-section-title" htmlFor="key-strategy">Key strategy</label>
            <select
              id="key-strategy"
              className="w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 text-sm font-semibold text-[#123047]"
              value={snapshot.keyStrategy.type}
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
                          : { type: "no_key" }
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
                className="mt-2 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 text-sm font-semibold text-[#123047]"
                value={fixedValue}
                onChange={(event) => onUpdateSettings({ keyStrategy: { type: "fixed", value: event.target.value || "user-1" } })}
              />
            )}
          </section>

          <label className="text-xs text-[#466778]">
            <span className="mb-2 block kplay-section-title">Latency</span>
            <input
              aria-label="Consumer processing latency"
              className="mb-2 w-full rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1.5 text-sm font-semibold text-[#123047]"
              min={0}
              max={3000}
              step={100}
              type="number"
              value={snapshot.processingLatencyMs}
              onChange={(event) => onUpdateSettings({ processingLatencyMs: Number(event.target.value) })}
            />
            <input
              aria-label="Processing latency slider"
              className="w-full accent-amber-500"
              min={0}
              max={3000}
              step={100}
              type="range"
              value={snapshot.processingLatencyMs}
              onChange={(event) => onUpdateSettings({ processingLatencyMs: Number(event.target.value) })}
            />
          </label>

          <section>
            <h3 className="mb-2 kplay-section-title">Consumers</h3>
            <div className="flex flex-wrap items-center gap-2">
              {snapshot.consumers.length === 0 ? (
                <span className="rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-3 py-2 text-xs font-extrabold text-teal-800">0 consumers</span>
              ) : (
                snapshot.consumers.map((consumer) => (
                  <Button key={consumer.consumerId} onClick={() => onStopConsumer(consumer.consumerId)} variant="ghost" aria-label={`Stop ${consumer.consumerId}`} className="h-9 px-2 text-xs">
                    <X size={14} aria-hidden /> {consumer.consumerId.replace("consumer-", "C")}
                  </Button>
                ))
              )}
            </div>
            <p className="mt-3 rounded-2xl border-2 border-emerald-500 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Group: {snapshot.consumerGroupId}</p>
          </section>
        </div>
      )}
    </div>
  );
}
