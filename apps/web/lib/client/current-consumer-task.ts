import type {
  MessageState,
  PlaygroundMessage,
  RunSnapshot,
  RuntimeEvent,
} from "@kplay/contracts";

const currentTaskStates = new Set<MessageState>([
  "received",
  "processing",
  "processed",
  "commit_requested",
]);

export type ConsumerTask = {
  messageId: string;
  label: string;
  state: MessageState;
  partitionOffset: string;
  idempotencyKey: string | null;
  duration: TaskDuration;
};

export type TaskDuration =
  | {
      status: "active" | "final";
      milliseconds: number;
      startedAt: string;
      endedAt: string | null;
    }
  | {
      status: "unknown";
      milliseconds: null;
      startedAt: null;
      endedAt: null;
    };

export function currentTaskForConsumer(
  snapshot: RunSnapshot,
  consumerId: string,
  nowMs = Date.now(),
): ConsumerTask | null {
  const message = activeTaskMessagesForConsumer(snapshot, consumerId)
    .sort(compareMessagesByUpdateTime)
    .at(-1);

  return message ? toConsumerTask(message, snapshot.recentEvents, nowMs) : null;
}

export function currentTasksForConsumer(
  snapshot: RunSnapshot,
  consumerId: string,
  nowMs = Date.now(),
): ConsumerTask[] {
  return activeTaskMessagesForConsumer(snapshot, consumerId)
    .sort(compareMessagesByPartitionOffset)
    .map((message) => toConsumerTask(message, snapshot.recentEvents, nowMs));
}

export function formatConsumerTaskSummary(task: ConsumerTask) {
  return [
    task.label,
    task.partitionOffset,
    task.state,
    formatTaskDuration(task.duration),
  ].join(" | ");
}

export function hasActiveConsumerTaskDuration(snapshot: RunSnapshot) {
  return snapshot.consumers.some((consumer) => {
    const tasks = currentTasksForConsumer(snapshot, consumer.consumerId);
    return tasks.some((task) => task.duration.status === "active");
  });
}

export function taskDurationForMessage(
  snapshot: RunSnapshot,
  message: PlaygroundMessage,
  nowMs = Date.now(),
) {
  if (!message.assignedConsumerId) return unknownDuration();
  return durationForMessage(
    snapshot.recentEvents,
    message.messageId,
    message.assignedConsumerId,
    message.state,
    nowMs,
  );
}

export function taskDurationForEvent(
  events: RuntimeEvent[],
  event: RuntimeEvent,
): TaskDuration | null {
  if (event.type === "offset.committed") {
    return finalDurationForEvent(
      events,
      event.messageId,
      event.consumerId,
      event.occurredAt,
    );
  }
  if (event.type === "offset.commit_failed") {
    return finalDurationForEvent(
      events,
      event.messageId,
      event.consumerId,
      event.occurredAt,
    );
  }
  if (
    event.type === "message.processing_failed" &&
    event.messageId &&
    event.consumerId
  ) {
    return finalDurationForEvent(
      events,
      event.messageId,
      event.consumerId,
      event.occurredAt,
    );
  }
  return null;
}

export function formatTaskDuration(duration: TaskDuration) {
  if (duration.status === "unknown") return "Duration unknown";
  return formatDurationMs(duration.milliseconds);
}

export function formatDurationMs(milliseconds: number) {
  const safeMilliseconds = Math.max(0, milliseconds);
  if (safeMilliseconds < 10_000) {
    return `${(safeMilliseconds / 1000).toFixed(1)}s`;
  }
  if (safeMilliseconds < 60_000) {
    return `${Math.round(safeMilliseconds / 1000)}s`;
  }
  const totalSeconds = Math.round(safeMilliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function toConsumerTask(
  message: PlaygroundMessage,
  events: RuntimeEvent[],
  nowMs: number,
): ConsumerTask {
  const idempotencyKey = payloadString(message, "idempotencyKey");
  return {
    messageId: message.messageId,
    label: idempotencyKey ?? message.messageId,
    state: message.state,
    partitionOffset: partitionOffset(message),
    idempotencyKey,
    duration: message.assignedConsumerId
      ? durationForMessage(
          events,
          message.messageId,
          message.assignedConsumerId,
          message.state,
          nowMs,
        )
      : unknownDuration(),
  };
}

function activeTaskMessagesForConsumer(
  snapshot: RunSnapshot,
  consumerId: string,
) {
  return snapshot.recentMessages.filter(
    (candidate) =>
      candidate.assignedConsumerId === consumerId &&
      currentTaskStates.has(candidate.state),
  );
}

function durationForMessage(
  events: RuntimeEvent[],
  messageId: string,
  consumerId: string,
  state: MessageState,
  nowMs: number,
): TaskDuration {
  if (currentTaskStates.has(state)) {
    const start = receivedEventFor(events, messageId, consumerId);
    return start ? activeDuration(start.occurredAt, nowMs) : unknownDuration();
  }
  if (state === "committed" || state === "failed") {
    const end = endEventFor(events, messageId, consumerId, state);
    return end
      ? finalDurationForEvent(events, messageId, consumerId, end.occurredAt)
      : unknownDuration();
  }
  return unknownDuration();
}

function finalDurationForEvent(
  events: RuntimeEvent[],
  messageId: string,
  consumerId: string,
  endedAt: string,
): TaskDuration {
  const endMs = Date.parse(endedAt);
  if (!Number.isFinite(endMs)) return unknownDuration();
  const start = receivedEventFor(events, messageId, consumerId, endMs);
  if (!start) return unknownDuration();
  const startMs = Date.parse(start.occurredAt);
  if (!Number.isFinite(startMs)) return unknownDuration();
  return {
    status: "final",
    milliseconds: Math.max(0, endMs - startMs),
    startedAt: start.occurredAt,
    endedAt,
  };
}

function activeDuration(startedAt: string, nowMs: number): TaskDuration {
  const startMs = Date.parse(startedAt);
  if (!Number.isFinite(startMs)) return unknownDuration();
  return {
    status: "active",
    milliseconds: Math.max(0, nowMs - startMs),
    startedAt,
    endedAt: null,
  };
}

function receivedEventFor(
  events: RuntimeEvent[],
  messageId: string,
  consumerId: string,
  beforeOrAtMs = Number.POSITIVE_INFINITY,
) {
  return events
    .filter(
      (event) =>
        event.type === "message.received" &&
        event.messageId === messageId &&
        event.consumerId === consumerId &&
        eventTime(event) <= beforeOrAtMs,
    )
    .sort(compareEventsByTime)
    .at(-1);
}

function endEventFor(
  events: RuntimeEvent[],
  messageId: string,
  consumerId: string,
  state: MessageState,
) {
  return events
    .filter((event) => {
      if (state === "committed") {
        return (
          event.type === "offset.committed" &&
          event.messageId === messageId &&
          event.consumerId === consumerId
        );
      }
      return (
        (event.type === "message.processing_failed" &&
          event.messageId === messageId &&
          event.consumerId === consumerId) ||
        (event.type === "offset.commit_failed" &&
          event.messageId === messageId &&
          event.consumerId === consumerId)
      );
    })
    .sort(compareEventsByTime)
    .at(-1);
}

function unknownDuration(): TaskDuration {
  return {
    status: "unknown",
    milliseconds: null,
    startedAt: null,
    endedAt: null,
  };
}

function partitionOffset(message: PlaygroundMessage) {
  const partition =
    typeof message.partition === "number" ? `P${message.partition}` : "P?";
  return `${partition}@${message.offset ?? "?"}`;
}

function payloadString(message: PlaygroundMessage, key: string) {
  const payload = message.value.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }
  const value = (payload as Record<string, unknown>)[key];
  return value === null || value === undefined ? null : String(value);
}

function compareMessagesByUpdateTime(
  left: PlaygroundMessage,
  right: PlaygroundMessage,
) {
  const leftTime = messageTime(left);
  const rightTime = messageTime(right);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.messageId.localeCompare(right.messageId);
}

function compareMessagesByPartitionOffset(
  left: PlaygroundMessage,
  right: PlaygroundMessage,
) {
  const leftPartition = partitionSortValue(left.partition);
  const rightPartition = partitionSortValue(right.partition);
  if (leftPartition !== rightPartition) return leftPartition - rightPartition;
  const leftOffset = offsetSortValue(left.offset);
  const rightOffset = offsetSortValue(right.offset);
  if (leftOffset !== rightOffset) return leftOffset - rightOffset;
  return compareMessagesByUpdateTime(left, right);
}

function partitionSortValue(partition: number | null) {
  return typeof partition === "number" ? partition : Number.POSITIVE_INFINITY;
}

function offsetSortValue(offset: string | null) {
  if (offset === null) return Number.POSITIVE_INFINITY;
  const parsed = Number(offset);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function compareEventsByTime(left: RuntimeEvent, right: RuntimeEvent) {
  const leftTime = eventTime(left);
  const rightTime = eventTime(right);
  if (leftTime !== rightTime) return leftTime - rightTime;
  return left.sequence - right.sequence;
}

function eventTime(event: RuntimeEvent) {
  const occurredAt = Date.parse(event.occurredAt);
  return Number.isFinite(occurredAt) ? occurredAt : 0;
}

function messageTime(message: PlaygroundMessage) {
  const updatedAt = Date.parse(message.updatedAt);
  if (Number.isFinite(updatedAt)) return updatedAt;
  const createdAt = Date.parse(message.createdAt);
  return Number.isFinite(createdAt) ? createdAt : 0;
}
