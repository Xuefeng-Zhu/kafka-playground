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
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-800 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onStartProducer} disabled={snapshot.producerStatus === "running"} variant="primary">
          <Play size={15} aria-hidden /> Start
        </Button>
        <Button onClick={onPauseProducer} disabled={snapshot.producerStatus !== "running"}>
          <Pause size={15} aria-hidden /> Pause
        </Button>
        <Button onClick={onStopProducer}>
          <Square size={14} aria-hidden /> Stop
        </Button>
        <Button onClick={onProduceOne}>
          <Send size={14} aria-hidden /> Produce one
        </Button>
      </div>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        Rate
        <input
          aria-label="Messages per second"
          className="w-16 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
          min={1}
          max={10}
          type="number"
          value={snapshot.productionRate}
          onChange={(event) => onUpdateSettings({ productionRate: Number(event.target.value) })}
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-slate-400" htmlFor="key-strategy">Key strategy</label>
        <select
          id="key-strategy"
          className="rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
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
            className="w-28 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            value={fixedValue}
            onChange={(event) => onUpdateSettings({ keyStrategy: { type: "fixed", value: event.target.value || "user-1" } })}
          />
        )}
        <label className="flex items-center gap-2 text-xs text-slate-400">
          Latency
          <input
            aria-label="Consumer processing latency"
            className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-sm text-slate-100"
            min={0}
            max={3000}
            step={100}
            type="number"
            value={snapshot.processingLatencyMs}
            onChange={(event) => onUpdateSettings({ processingLatencyMs: Number(event.target.value) })}
          />
          ms
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onAddConsumer} disabled={snapshot.consumers.length >= 3}>
          <Plus size={15} aria-hidden /> Consumer
        </Button>
        {snapshot.consumers.map((consumer) => (
          <Button key={consumer.consumerId} onClick={() => onStopConsumer(consumer.consumerId)} variant="ghost" aria-label={`Stop ${consumer.consumerId}`}>
            <X size={14} aria-hidden /> {consumer.consumerId.replace("consumer-", "C")}
          </Button>
        ))}
      </div>
    </div>
  );
}
