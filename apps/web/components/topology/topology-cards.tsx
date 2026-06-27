import type {
  ConsumerSnapshot,
  PlaygroundMessage,
  RunSnapshot,
} from "@kplay/contracts";
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
      <div className="mt-3 rounded-full border-2 border-teal-700 bg-teal-50 px-2 py-1 text-[11px] font-extrabold text-teal-800">
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
  onSelect: () => void;
  onSelectMessage: (messageId: string) => void;
}) {
  const placeholders = messages.length > 0 ? [] : offsetsAround(latestOffset);
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
        >
          Partition {partition}
        </button>
        <span className="rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-0.5 text-[11px] font-extrabold text-teal-800">
          latest {latestOffset ?? "none"}
        </span>
        <span className="rounded-full border-2 border-emerald-500 bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-800">
          committed {committedOffset ?? "-"}
        </span>
        <span
          className="ml-auto rounded-full border-2 border-teal-700 bg-[#fffdf5] px-2 py-0.5 text-[11px] font-extrabold text-teal-800"
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
            onClick={() => onSelectMessage(message.messageId)}
            className={`min-w-9 rounded-xl border-2 px-2 py-1 font-mono text-xs font-extrabold ${
              selectedMessageId === message.messageId
                ? "border-rose-700 bg-rose-400 text-white shadow-[0_0_0_5px_rgba(251,113,133,0.16)]"
                : tone.chip
            }`}
          >
            {message.offset ?? "?"}
          </button>
        ))}
        {placeholders.map((offset) => (
          <span
            key={offset}
            className="min-w-9 rounded-xl border-2 border-teal-700 bg-[#fffdf5] px-2 py-1 text-center font-mono text-xs font-extrabold text-teal-800"
          >
            {offset}
          </span>
        ))}
        <span
          className={`ml-auto size-2.5 rounded-full ${active ? "bg-emerald-500" : partition === 0 ? "bg-sky-500" : "bg-violet-500"}`}
        />
      </div>
      <div className="mt-2 text-[11px] font-semibold text-[#466778]">
        {messageCount} messages observed in this partition
      </div>
    </div>
  );
}

export function ConsumerCard({
  consumer,
  selected,
  active,
  onSelect,
}: {
  consumer: ConsumerSnapshot;
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
          {isCrashed
            ? "crashed"
            : hasAssignments
              ? consumer.assignments
                  .map((item) => `P${item.partition}`)
                  .join(",")
              : "idle"}
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
            className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-extrabold ${toneForPartition(assignment.partition).chip}`}
          >
            P{assignment.partition}
          </span>
        ))}
      </div>
    </button>
  );
}

export function partitionAssignments(consumers: ConsumerSnapshot[]) {
  const assignments = new Map<number, { consumerId: string }>();
  consumers.forEach((consumer) => {
    consumer.assignments.forEach((assignment) => {
      assignments.set(assignment.partition, {
        consumerId: consumer.consumerId,
      });
    });
  });
  return assignments;
}

export function connectorPathForPartition(partition: number) {
  const y = partition === 0 ? 66 : partition === 1 ? 80 : 87;
  const endY = partition === 0 ? 63 : partition === 1 ? 75 : 87;
  return `M64 ${y} C72 ${y}, 76 ${endY}, 84 ${endY}`;
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
  const latest = Number(latestOffset);
  const end = Number.isFinite(latest) ? latest : 104;
  return Array.from({ length: 7 }, (_, index) =>
    String(Math.max(0, end - 6 + index)),
  );
}
