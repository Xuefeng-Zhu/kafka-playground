"use client";

import type { ConnectionStatus, RunSnapshot } from "@kplay/contracts";
import { RotateCcw } from "lucide-react";
import { useId, useRef, type KeyboardEvent, type Ref } from "react";
import { Button } from "@/components/ui/button";
import { connectionStatusLabel } from "@/lib/client/connection-labels";
import type { WorkspaceView } from "./use-workspace-view";

export function WorkspaceHeader({
  run,
  connection,
  disabled,
  onReset,
  workspaceView,
  showWorkspaceViewSwitch,
  canSwitchWorkspaceView = false,
  onWorkspaceViewChange,
}: {
  run: RunSnapshot | null;
  connection: ConnectionStatus | null;
  disabled: boolean;
  onReset: () => void;
  workspaceView?: WorkspaceView;
  showWorkspaceViewSwitch?: boolean;
  canSwitchWorkspaceView?: boolean;
  onWorkspaceViewChange?: (view: WorkspaceView) => void;
}) {
  const shouldShowWorkspaceViewSwitch =
    (showWorkspaceViewSwitch ?? canSwitchWorkspaceView) &&
    workspaceView &&
    onWorkspaceViewChange;
  const workspaceSwitchDisabled = disabled || !canSwitchWorkspaceView;
  const workspaceSwitchDisabledReason = !canSwitchWorkspaceView
    ? "Start a run to use Guided or Explore."
    : disabled
      ? "Wait for the current action to finish before switching views."
      : undefined;

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b-[3px] border-teal-700 bg-[#fff7ed] px-3 py-3 shadow-[0_6px_0_rgba(15,118,110,0.12)] sm:px-5 lg:h-16 lg:flex-nowrap lg:py-0">
      <div className="order-1 flex min-w-0 items-center gap-3 sm:gap-4 lg:order-none">
        <div className="relative grid size-10 shrink-0 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
          <KafkaMarkIcon />
          <span className="absolute -right-1 -top-1 size-3 rounded-full border-2 border-[#fff7ed] bg-sky-500" />
        </div>
        <div className="min-w-0">
          <h1 className="max-w-32 truncate text-base font-extrabold tracking-tight text-[#123047] sm:max-w-none sm:text-lg">
            Kafka Visual Playground
          </h1>
        </div>
      </div>
      {shouldShowWorkspaceViewSwitch ? (
        <div className="order-3 flex w-full basis-full lg:order-none lg:w-auto lg:basis-auto">
          <WorkspaceViewTabs
            workspaceView={workspaceView}
            disabled={workspaceSwitchDisabled}
            disabledReason={workspaceSwitchDisabledReason}
            controlsAvailable={canSwitchWorkspaceView}
            onWorkspaceViewChange={onWorkspaceViewChange}
          />
        </div>
      ) : null}
      <div className="order-2 flex min-w-0 items-center gap-2 text-sm sm:gap-4 lg:order-none">
        <div className="hidden min-w-44 border-r-2 border-teal-700 pr-5 md:block">
          <div className="flex items-center gap-2 font-extrabold text-[#123047]">
            <span className="size-2.5 rounded-full bg-emerald-500" />
            {connectionLabel(run, connection)}
          </div>
          <div className="mt-0.5 truncate text-xs text-[#466778]">
            {connectionHostLabel(run, connection)}
          </div>
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

function WorkspaceViewTabs({
  workspaceView,
  disabled,
  disabledReason,
  controlsAvailable,
  onWorkspaceViewChange,
}: {
  workspaceView: WorkspaceView;
  disabled: boolean;
  disabledReason?: string;
  controlsAvailable: boolean;
  onWorkspaceViewChange: (view: WorkspaceView) => void;
}) {
  const disabledReasonId = useId();
  const guidedTabRef = useRef<HTMLButtonElement>(null);
  const exploreTabRef = useRef<HTMLButtonElement>(null);

  function selectAndFocus(nextView: WorkspaceView) {
    onWorkspaceViewChange(nextView);
    const nextTab =
      nextView === "guided" ? guidedTabRef.current : exploreTabRef.current;
    nextTab?.focus();
  }

  function handleTabKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    currentView: WorkspaceView,
  ) {
    let nextView: WorkspaceView | null = null;

    if (event.key === "Home") nextView = "guided";
    if (event.key === "End") nextView = "explore";
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextView = currentView === "guided" ? "explore" : "guided";
    }
    if (!nextView) return;

    event.preventDefault();
    selectAndFocus(nextView);
  }

  return (
    <>
      <div
        role="tablist"
        aria-label="Workspace view"
        aria-describedby={disabledReason ? disabledReasonId : undefined}
        title={disabledReason}
        className="flex w-full rounded-xl border-2 border-teal-700 bg-teal-50 p-0.5 shadow-[2px_2px_0_rgba(15,118,110,0.14)] md:h-9 md:w-auto"
      >
        <WorkspaceViewTab
          ref={guidedTabRef}
          view="guided"
          label="Guided"
          selected={workspaceView === "guided"}
          disabled={disabled}
          controlsAvailable={controlsAvailable}
          onClick={() => onWorkspaceViewChange("guided")}
          onKeyDown={(event) => handleTabKeyDown(event, "guided")}
        />
        <WorkspaceViewTab
          ref={exploreTabRef}
          view="explore"
          label="Explore"
          selected={workspaceView === "explore"}
          disabled={disabled}
          controlsAvailable={controlsAvailable}
          onClick={() => onWorkspaceViewChange("explore")}
          onKeyDown={(event) => handleTabKeyDown(event, "explore")}
        />
      </div>
      {disabledReason ? (
        <span className="sr-only" id={disabledReasonId}>
          {disabledReason}
        </span>
      ) : null}
    </>
  );
}

function WorkspaceViewTab({
  ref,
  view,
  label,
  selected,
  disabled,
  controlsAvailable,
  onClick,
  onKeyDown,
}: {
  ref: Ref<HTMLButtonElement>;
  view: WorkspaceView;
  label: string;
  selected: boolean;
  disabled: boolean;
  controlsAvailable: boolean;
  onClick: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={`workspace-view-${view}-tab`}
      data-testid={`workspace-view-${view}`}
      aria-controls={controlsAvailable ? `workspace-${view}-panel` : undefined}
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      disabled={disabled}
      onClick={onClick}
      onKeyDown={onKeyDown}
      className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-lg border-2 px-3 py-2 text-center text-sm font-extrabold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:min-h-7 md:flex-none md:px-3 md:py-1 md:text-xs ${
        selected
          ? "border-teal-700 bg-teal-700 text-white"
          : "border-transparent bg-transparent text-teal-800 hover:border-teal-300 hover:bg-white"
      }`}
    >
      {label}
    </button>
  );
}

function KafkaMarkIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="size-6" fill="none">
      <path
        d="M16 7.8v16.4M16 16h7.4M16 16l-5.4-5.4M16 16l-5.4 5.4"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle
        cx="16"
        cy="5.4"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="16"
        cy="16"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="16"
        cy="26.6"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="25.8"
        cy="16"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="8.4"
        cy="8.4"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
      <circle
        cx="8.4"
        cy="23.6"
        r="3.1"
        fill="#fff7ed"
        stroke="currentColor"
        strokeWidth="2.6"
      />
    </svg>
  );
}

function connectionLabel(
  run: RunSnapshot | null,
  connection: ConnectionStatus | null,
) {
  if (run?.mode === "remote" || run?.mode === "aiven") return "Remote Kafka";
  if (run?.mode === "demo") return "Demo mode";
  return connectionStatusLabel(connection);
}

function connectionHostLabel(
  run: RunSnapshot | null,
  connection: ConnectionStatus | null,
) {
  if (run?.mode === "remote") {
    if (connection?.mode === "remote" && connection.maskedBrokerHost) {
      return connection.maskedBrokerHost;
    }
    return "User-configured Kafka";
  }
  if (run?.mode === "aiven") {
    if (connection?.maskedBrokerHost) return connection.maskedBrokerHost;
    return "Server-configured Kafka";
  }
  if (connection?.maskedBrokerHost) return connection.maskedBrokerHost;
  if (connection?.mode === "aiven") return "No broker configured";
  if (connection?.mode === "remote") return "User-configured Kafka";
  return "Local demo runtime";
}
