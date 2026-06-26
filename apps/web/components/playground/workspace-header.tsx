"use client";

import type { ConnectionStatus, RunSnapshot } from "@kplay/contracts";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";

export function WorkspaceHeader({
  scenarioTitle,
  run,
  connection,
  disabled,
  onReset,
}: {
  scenarioTitle: string | undefined;
  run: RunSnapshot | null;
  connection: ConnectionStatus | null;
  disabled: boolean;
  onReset: () => void;
}) {
  const mode = run?.mode ?? connection?.mode ?? "demo";

  return (
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
            {scenarioTitle ?? "Scenario workspace"}
          </p>
        </div>
        <StatusPill
          label={mode === "aiven" ? "Aiven" : "Demo mode"}
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
            {connectionHostLabel(connection)}
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
          onClick={onReset}
          disabled={!run || disabled}
          variant="secondary"
          aria-label="Reset run"
          className="h-9 px-3 sm:px-4"
        >
          <RotateCcw size={15} aria-hidden /> Reset
        </Button>
      </div>
    </header>
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

function connectionHostLabel(connection: ConnectionStatus | null) {
  if (connection?.maskedBrokerHost) return connection.maskedBrokerHost;
  if (connection?.mode === "aiven") return "No broker configured";
  return "Local demo runtime";
}
