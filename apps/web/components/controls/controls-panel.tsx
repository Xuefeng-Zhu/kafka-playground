"use client";

import type { KeyStrategy, RunSnapshot } from "@kplay/contracts";
import { Pause, Play, Plus, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";

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
  return (
    <div className="mx-3 mt-3 grid grid-cols-1 gap-3 rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5] p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)] sm:grid-cols-2 lg:grid-cols-[260px_90px_120px_110px_minmax(130px,1fr)]">
      <section className="border-b-[3px] border-teal-700 pb-3 sm:border-b-0 sm:border-r-[3px] sm:pb-0 sm:pr-3">
        <h3 className="mb-2 kplay-section-title">Run controls</h3>
        <div className="flex flex-wrap items-center gap-2">
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
        </div>
        <div className="mt-3 flex items-center gap-2 rounded-2xl border-2 border-emerald-500 bg-emerald-100 px-3 py-2 text-xs">
          <span className={`size-2 rounded-full ${snapshot.producerStatus === "running" ? "bg-emerald-500" : "bg-amber-500"}`} />
          <span className="text-[#466778]">Status:</span>
          <span className="font-extrabold text-emerald-800">{snapshot.producerStatus}</span>
        </div>
      </section>

      <label className="border-b-[3px] border-teal-700 pb-3 text-xs text-[#466778] sm:border-b-0 lg:border-r-[3px] lg:pb-0 lg:pr-3">
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

      <section className="border-b-[3px] border-teal-700 pb-3 sm:border-b-0 sm:border-r-[3px] sm:pb-0 sm:pr-3">
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

      <label className="border-b-[3px] border-teal-700 pb-3 text-xs text-[#466778] sm:border-b-0 lg:border-r-[3px] lg:pb-0 lg:pr-3">
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
          <Button onClick={onAddConsumer} disabled={snapshot.consumers.length >= 3} variant="primary" className="h-9 px-3 text-xs">
            <Plus size={15} aria-hidden /> Consumer
          </Button>
          {snapshot.consumers.map((consumer) => (
            <Button key={consumer.consumerId} onClick={() => onStopConsumer(consumer.consumerId)} variant="ghost" aria-label={`Stop ${consumer.consumerId}`} className="h-9 px-2 text-xs">
              <X size={14} aria-hidden /> {consumer.consumerId.replace("consumer-", "C")}
            </Button>
          ))}
        </div>
        <p className="mt-3 rounded-2xl border-2 border-emerald-500 bg-emerald-100 px-3 py-2 text-xs font-semibold text-emerald-800">Group: {snapshot.consumerGroupId}</p>
      </section>
    </div>
  );
}
