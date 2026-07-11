"use client";

import type { PlaygroundMessage, RunSnapshot } from "@kplay/contracts";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDot,
} from "lucide-react";
import {
  formatTaskDuration,
  hasActiveConsumerTaskDuration,
  taskDurationForMessage,
  type TaskDuration,
} from "@/lib/client/current-consumer-task";
import { useLiveTaskClock } from "@/lib/client/use-live-task-clock";

export function MessageDetails({
  snapshot,
  message,
  onPreviousMessage,
  onNextMessage,
}: {
  snapshot: RunSnapshot;
  message: PlaygroundMessage | null;
  onPreviousMessage(): void;
  onNextMessage(): void;
}) {
  const messageIndex = message
    ? snapshot.recentMessages.findIndex(
        (item) => item.messageId === message.messageId,
      )
    : -1;
  const hasPreviousMessage = messageIndex > 0;
  const hasNextMessage =
    messageIndex >= 0 && messageIndex < snapshot.recentMessages.length - 1;

  return (
    <>
      <section className="border-b-[3px] border-teal-700 p-5">
        <div className="text-sm font-semibold text-[#466778]">
          Selected message
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="rounded-2xl border-[3px] border-sky-500 bg-sky-50 px-3 py-2 text-sm font-extrabold text-[#123047] shadow-[7px_7px_0_rgba(15,118,110,0.14)]">
            {message
              ? `Partition ${message.partition ?? "?"} / Offset ${message.offset ?? "pending"}`
              : "No message selected"}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPreviousMessage}
              disabled={!hasPreviousMessage}
              className="grid size-11 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800 disabled:opacity-45 lg:size-8"
              aria-label="Previous message"
            >
              <ChevronLeft size={16} aria-hidden />
            </button>
            <button
              type="button"
              onClick={onNextMessage}
              disabled={!hasNextMessage}
              className="grid size-11 place-items-center rounded-xl border-2 border-teal-700 bg-[#fffdf5] text-teal-800 disabled:opacity-45 lg:size-8"
              aria-label="Next message"
            >
              <ChevronRight size={16} aria-hidden />
            </button>
          </div>
        </div>
      </section>
      <MessageBody snapshot={snapshot} message={message} />
    </>
  );
}

export function MessageBody({
  snapshot,
  message,
}: {
  snapshot: RunSnapshot;
  message: PlaygroundMessage | null;
}) {
  const taskNowMs = useLiveTaskClock(
    message !== null && hasActiveConsumerTaskDuration(snapshot),
  );
  const taskDuration = message
    ? taskDurationForMessage(snapshot, message, taskNowMs)
    : null;

  if (!message) {
    return (
      <div className="p-5 text-sm text-[#466778]">
        Produce a message to populate overview, processing, and commit details.
      </div>
    );
  }

  return (
    <>
      <section className="border-b-[3px] border-teal-700 p-5">
        <h3 className="mb-3 kplay-section-title">Overview</h3>
        <dl className="grid grid-cols-[110px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[#466778]">Topic</dt>
          <dd className="min-w-0 break-all font-semibold text-[#123047]">
            {message.topic}
          </dd>
          <dt className="text-[#466778]">Partition</dt>
          <dd className="font-extrabold text-sky-700">
            {message.partition ?? "Pending delivery"}
          </dd>
          <dt className="text-[#466778]">Offset</dt>
          <dd className="font-semibold text-[#123047]">
            {message.offset ?? "Pending delivery"}
          </dd>
          <dt className="text-[#466778]">Timestamp</dt>
          <dd className="font-semibold text-[#123047]">
            {message.timestamp ?? "Pending"}
          </dd>
          <dt className="text-[#466778]">Key</dt>
          <dd className="font-semibold text-[#123047]">
            {message.key ?? "No key"}
          </dd>
          <dt className="text-[#466778]">Value</dt>
          <dd className="font-semibold text-[#123047]">
            {JSON.stringify(message.value).length} bytes
          </dd>
          <dt className="text-[#466778]">Headers</dt>
          <dd className="font-semibold text-[#123047]">
            {Object.keys(message.headers).length}
          </dd>
          <dt className="text-[#466778]">State</dt>
          <dd className="font-extrabold text-emerald-700">{message.state}</dd>
        </dl>
      </section>

      <section className="border-b-[3px] border-teal-700 p-5">
        <h3 className="mb-3 kplay-section-title">Processing State</h3>
        <ol className="space-y-3 text-sm">
          <StateStep
            done
            label="Received by"
            detail={message.assignedConsumerId ?? "Waiting for consumer"}
          />
          <StateStep
            active={message.state === "processing"}
            done={["processed", "commit_requested", "committed"].includes(
              message.state,
            )}
            label="Processing"
            detail={processingDetail(message, snapshot, taskDuration)}
          />
          <StateStep
            done={message.state === "committed"}
            label="Committed"
            detail={
              message.committedOffset
                ? `Offset ${message.committedOffset}`
                : "Not committed"
            }
          />
        </ol>
      </section>

      <section className="p-5">
        <h3 className="mb-3 kplay-section-title">Commit Details</h3>
        <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="text-[#466778]">Committer</dt>
          <dd className="font-semibold text-[#123047]">
            {message.assignedConsumerId ?? "None"}
          </dd>
          <dt className="text-[#466778]">Commit latency</dt>
          <dd className="font-semibold text-[#123047]">
            {snapshot.processingLatencyMs + 2} ms
          </dd>
          <dt className="text-[#466778]">Commit strategy</dt>
          <dd className="font-semibold text-[#123047]">
            Enable.auto.commit = false
          </dd>
          <dt className="text-[#466778]">Isolation level</dt>
          <dd className="font-semibold text-[#123047]">read_committed</dd>
        </dl>
      </section>
    </>
  );
}

function processingDetail(
  message: PlaygroundMessage,
  snapshot: RunSnapshot,
  duration: TaskDuration | null,
) {
  if (duration) {
    if (duration.status === "active") {
      return `In progress | ${formatTaskDuration(duration)}`;
    }
    if (duration.status === "final") {
      return `Duration ${formatTaskDuration(duration)}`;
    }
    if (
      [
        "received",
        "processing",
        "processed",
        "commit_requested",
        "committed",
        "failed",
      ].includes(message.state)
    ) {
      return formatTaskDuration(duration);
    }
  }
  return message.state === "processing"
    ? "In progress"
    : `${snapshot.processingLatencyMs} ms`;
}

function StateStep({
  label,
  detail,
  active = false,
  done = false,
}: {
  label: string;
  detail: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      {done ? (
        <CheckCircle2
          className="mt-0.5 text-emerald-600"
          size={16}
          aria-hidden
        />
      ) : (
        <CircleDot
          className={active ? "mt-0.5 text-amber-500" : "mt-0.5 text-slate-500"}
          size={16}
          aria-hidden
        />
      )}
      <div className="flex-1">
        <div
          className={
            done
              ? "font-extrabold text-emerald-700"
              : active
                ? "font-extrabold text-amber-700"
                : "font-extrabold text-[#123047]"
          }
        >
          {label}
        </div>
        <div className="mt-0.5 text-xs text-[#466778]">{detail}</div>
      </div>
    </li>
  );
}
