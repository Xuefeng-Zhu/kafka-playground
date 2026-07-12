import {
  kafkaOffsetWindow,
  type ConsumerSnapshot,
  type PlaygroundMessage,
  type RunSnapshot,
} from "@kplay/contracts";
import type { ConsumerTask } from "@/lib/client/current-consumer-task";
import type { RuntimeTopologyProvenance } from "@/lib/client/topology-provenance";
import { Code2, Users } from "lucide-react";

const partitionTones = [
  {
    bg: "bg-sky-50",
    border: "border-sky-500",
    text: "text-sky-800",
    chip: "border-sky-500 bg-sky-100 text-sky-800",
    stroke: "#0ea5e9",
  },
  {
    bg: "bg-violet-50",
    border: "border-violet-500",
    text: "text-violet-800",
    chip: "border-violet-500 bg-violet-100 text-violet-800",
    stroke: "#8b5cf6",
  },
  {
    bg: "bg-emerald-50",
    border: "border-emerald-500",
    text: "text-emerald-800",
    chip: "border-emerald-500 bg-emerald-100 text-emerald-800",
    stroke: "#10b981",
  },
] as const;

export function ProducerCard({
  status,
  selected,
  onSelect,
}: {
  status: RunSnapshot["producerStatus"];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label="Inspect producer"
      aria-pressed={selected}
      className={`w-full rounded-2xl border-[3px] bg-[#fffdf5]/95 p-5 text-center shadow-[7px_7px_0_rgba(15,118,110,0.14)] focus:outline-none focus:ring-4 focus:ring-sky-200 ${
        selected
          ? "border-teal-700 ring-4 ring-sky-200"
          : "border-teal-700 hover:bg-teal-50"
      }`}
    >
      <div className="mx-auto grid size-14 place-items-center rounded-2xl border-[3px] border-teal-700 bg-amber-200 text-teal-700 shadow-[5px_5px_0_rgba(15,118,110,0.18)]">
        <Code2 size={28} aria-hidden />
      </div>
      <div className="mt-4 text-sm font-extrabold text-[#123047]">Producer</div>
      <div className="mt-2 flex items-center justify-center gap-2 text-xs font-extrabold text-emerald-700">
        <span
          className={`size-2 rounded-full ${status === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        {status}
      </div>
      <div className="mt-3 rounded-full border-2 border-teal-700 bg-teal-50 px-2 py-1 text-xs font-extrabold text-teal-800">
        Source
      </div>
    </button>
  );
}

export function PartitionLane({
  partition,
  messages,
  selectedMessageId,
  selected,
  active,
  latestOffset,
  committedOffset,
  owner,
  messageCount,
  provenance,
  onSelect,
  onSelectMessage,
}: {
  partition: number;
  messages: PlaygroundMessage[];
  selectedMessageId: string | null;
  selected: boolean;
  active: boolean;
  latestOffset?: string;
  committedOffset?: string;
  owner?: { consumerId: string };
  messageCount: number;
  provenance: RuntimeTopologyProvenance;
  onSelect: () => void;
  onSelectMessage: (messageId: string) => void;
}) {
  const placeholders = messages.length > 0 ? [] : offsetsAround(latestOffset);
  const showEmptyState = messages.length === 0 && placeholders.length === 0;
  const tone = toneForPartition(partition);
  return (
    <div
      className={`rounded-2xl border-[3px] p-2 ${tone.border} ${tone.bg} ${
        selected
          ? "shadow-[0_0_0_5px_rgba(14,165,233,0.18)]"
          : active
            ? "shadow-[0_0_0_4px_rgba(16,185,129,0.12)]"
            : ""
      }`}
      data-testid={`partition-lane-${partition}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={onSelect}
          className={`rounded-xl border-2 px-2 py-1 text-sm font-extrabold focus:outline-none focus:ring-4 focus:ring-sky-200 ${tone.chip}`}
          aria-label={`Inspect partition ${partition}`}
          aria-pressed={selected}
        >
          Partition {partition}
        </button>
        <span className="rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-0.5 text-xs font-extrabold text-teal-800">
          latest {latestOffset ?? "none"}
        </span>
        <span className="rounded-full border-2 border-emerald-500 bg-emerald-100 px-2 py-0.5 text-xs font-extrabold text-emerald-800">
          committed {committedOffset ?? "-"}
        </span>
        <span
          className="ml-auto rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-0.5 text-xs font-extrabold text-teal-800"
          data-testid={`partition-owner-${partition}`}
        >
          {owner
            ? `owned by ${owner.consumerId.replace("consumer-", "C")}`
            : "unassigned"}
        </span>
      </div>
      <div className="flex items-center gap-1 overflow-hidden">
        {messages.map((message) => (
          <button
            key={message.messageId}
            title={messageChipTitle(message)}
            aria-label={messageChipTitle(message)}
            aria-pressed={selectedMessageId === message.messageId}
            data-testid={`partition-message-${message.messageId}`}
            onClick={() => onSelectMessage(message.messageId)}
            className={`min-w-9 shrink-0 whitespace-nowrap rounded-xl border-2 px-2 py-1 font-mono text-xs font-extrabold ${
              selectedMessageId === message.messageId
                ? "border-rose-900 bg-rose-700 text-white shadow-[0_0_0_5px_rgba(190,18,60,0.18)]"
                : tone.chip
            }`}
          >
            {messageChipLabel(message)}
          </button>
        ))}
        {placeholders.map((offset) => (
          <span
            key={offset}
            data-testid={`partition-placeholder-offset-${partition}`}
            className="min-w-9 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-center font-mono text-xs font-extrabold text-teal-800"
          >
            {offset}
          </span>
        ))}
        {showEmptyState ? (
          <span
            data-testid={`partition-empty-state-${partition}`}
            className="rounded-xl border-2 border-dashed border-teal-700 bg-[#fffdf5] px-2 py-1 text-xs font-extrabold text-[#466778]"
          >
            No messages yet
          </span>
        ) : null}
        <span
          className={`ml-auto size-2.5 rounded-full ${active ? "bg-emerald-500" : partition === 0 ? "bg-sky-500" : "bg-violet-500"}`}
        />
      </div>
      <div className="mt-2 text-xs font-semibold text-[#466778]">
        {messageCount} {provenance}{" "}
        {messageCount === 1 ? "message" : "messages"} in this partition
      </div>
    </div>
  );
}

export function ConsumerCard({
  consumer,
  currentTasks,
  selected,
  active,
  onSelect,
}: {
  consumer: ConsumerSnapshot;
  currentTasks: ConsumerTask[];
  selected: boolean;
  active: boolean;
  onSelect: () => void;
}) {
  const hasAssignments = consumer.assignments.length > 0;
  const isCrashed = consumer.status === "crashed";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Inspect ${consumer.consumerId}`}
      aria-pressed={selected}
      className={`w-full rounded-2xl border-[3px] p-3 text-left focus:outline-none focus:ring-4 focus:ring-sky-200 ${
        isCrashed
          ? "border-rose-500 bg-rose-100"
          : !hasAssignments
            ? "border-amber-500 bg-amber-100"
            : active
              ? "border-emerald-500 bg-emerald-100 shadow-[0_0_0_4px_rgba(16,185,129,0.16)]"
              : "border-teal-700 bg-teal-50"
      } ${selected ? "ring-4 ring-sky-200" : ""}`}
      data-testid={`consumer-node-${consumer.consumerId}`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`grid size-8 place-items-center rounded-full border-2 ${isCrashed ? "border-rose-600 bg-white text-rose-700" : hasAssignments ? "border-teal-700 bg-white text-teal-700" : "border-amber-600 bg-white text-amber-700"}`}
        >
          <Users size={16} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-[#123047]">
            {consumer.consumerId.replace("consumer-", "C")}
          </div>
          <div className="text-xs text-[#466778]">{consumer.consumerId}</div>
        </div>
        <span className="rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 font-mono text-xs font-extrabold text-teal-800">
          {isCrashed ? "crashed" : hasAssignments ? "active" : "idle"}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
        <span
          className={`size-2 rounded-full ${isCrashed ? "bg-rose-500" : consumer.status === "running" ? "bg-emerald-500" : "bg-amber-500"}`}
        />
        <span className="font-semibold text-[#31566a]">
          {isCrashed
            ? "crashed - partitions revoked"
            : hasAssignments
              ? "Active assignment"
              : "idle - no partition available"}
        </span>
        {consumer.assignments.map((assignment) => (
          <span
            key={assignment.partition}
            className={`rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${toneForPartition(assignment.partition).chip}`}
          >
            P{assignment.partition}
          </span>
        ))}
      </div>
      {currentTasks.length > 0 ? (
        <div className="mt-2 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-xs font-extrabold text-[#31566a]">
          <span className="text-teal-800">Working: </span>
          {currentTasks.length === 1
            ? "1 task"
            : `${currentTasks.length} tasks`}
        </div>
      ) : null}
    </button>
  );
}

export function toneForPartition(partition: number) {
  return partitionTones[partition % partitionTones.length];
}

export function messagesForPartition(
  messages: PlaygroundMessage[],
  partition: number,
) {
  return messages
    .filter((message) => message.partition === partition)
    .slice(-7);
}

function offsetsAround(latestOffset?: string) {
  return latestOffset === undefined ? [] : kafkaOffsetWindow(latestOffset, 7);
}

function messageChipLabel(message: PlaygroundMessage) {
  const sequence = sequenceForMessage(message);
  if (sequence) {
    return message.offset === null
      ? `m${sequence}`
      : `m${sequence}@${message.offset}`;
  }
  return shortMessageId(message.messageId);
}

function messageChipTitle(message: PlaygroundMessage) {
  const location =
    message.partition === null
      ? "pending delivery"
      : `P${message.partition}@${message.offset ?? "?"}`;
  return `${messageChipLabel(message)} | ${location} | ${message.messageId}`;
}

function sequenceForMessage(message: PlaygroundMessage) {
  const valueSequence = message.value.sequence;
  if (typeof valueSequence === "number" && Number.isFinite(valueSequence)) {
    return String(valueSequence);
  }
  if (typeof valueSequence === "string" && valueSequence.trim()) {
    return valueSequence.trim();
  }
  const headerSequence = message.headers["x-playground-sequence"];
  return headerSequence?.trim() || null;
}

function shortMessageId(messageId: string) {
  return messageId.length > 6 ? messageId.slice(0, 6) : messageId;
}
