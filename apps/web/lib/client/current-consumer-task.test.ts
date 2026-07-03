import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import {
  currentTaskForConsumer,
  currentTasksForConsumer,
  formatDurationMs,
  formatConsumerTaskSummary,
  formatTaskDuration,
  taskDurationForMessage,
} from "./current-consumer-task";

describe("currentTaskForConsumer", () => {
  it("returns all active assigned messages for a consumer sorted by partition and offset", () => {
    const tasks = currentTasksForConsumer(
      runSnapshot({
        recentEvents: [
          receivedEvent(
            "p1-offset-1",
            "consumer-1",
            "2026-06-26T00:00:00.000Z",
            1,
          ),
          receivedEvent(
            "p0-offset-2",
            "consumer-1",
            "2026-06-26T00:00:01.000Z",
            2,
          ),
          receivedEvent(
            "p0-offset-1",
            "consumer-1",
            "2026-06-26T00:00:02.000Z",
            3,
          ),
        ],
        recentMessages: [
          taskMessage("p1-offset-1", {
            offset: "1",
            partition: 1,
            state: "processing",
            value: { payload: { idempotencyKey: "payment-p1" } },
          }),
          taskMessage("p0-offset-2", {
            offset: "2",
            partition: 0,
            state: "processed",
            value: { payload: { idempotencyKey: "payment-p0-later" } },
          }),
          taskMessage("p0-offset-1", {
            offset: "1",
            partition: 0,
            state: "received",
            value: { payload: { idempotencyKey: "payment-p0-first" } },
          }),
          taskMessage("committed", {
            offset: "0",
            partition: 0,
            state: "committed",
          }),
          taskMessage("other-consumer", {
            assignedConsumerId: "consumer-2",
            state: "processing",
          }),
        ],
      }),
      "consumer-1",
      Date.parse("2026-06-26T00:00:03.500Z"),
    );

    expect(tasks.map((task) => task.label)).toEqual([
      "payment-p0-first",
      "payment-p0-later",
      "payment-p1",
    ]);
    expect(tasks.map((task) => task.partitionOffset)).toEqual([
      "P0@1",
      "P0@2",
      "P1@1",
    ]);
    expect(formatConsumerTaskSummary(tasks[0])).toBe(
      "payment-p0-first | P0@1 | received | 1.5s",
    );
  });

  it("shows the latest active assigned message for a consumer", () => {
    const task = currentTaskForConsumer(
      runSnapshot({
        recentEvents: [
          receivedEvent("older", "consumer-1", "2026-06-26T00:00:00.000Z", 1),
          receivedEvent("newer", "consumer-1", "2026-06-26T00:00:01.000Z", 2),
        ],
        recentMessages: [
          taskMessage("older", {
            offset: "3",
            state: "processing",
            updatedAt: "2026-06-26T00:00:00.000Z",
            value: { payload: { idempotencyKey: "payment-older" } },
          }),
          taskMessage("newer", {
            offset: "4",
            state: "received",
            updatedAt: "2026-06-26T00:00:01.000Z",
            value: { payload: { idempotencyKey: "payment-newer" } },
          }),
        ],
      }),
      "consumer-1",
      Date.parse("2026-06-26T00:00:02.500Z"),
    );

    expect(task).toMatchObject({
      idempotencyKey: "payment-newer",
      label: "payment-newer",
      messageId: "newer",
      partitionOffset: "P0@4",
      state: "received",
    });
    expect(task ? formatConsumerTaskSummary(task) : "").toBe(
      "payment-newer | P0@4 | received | 1.5s",
    );
  });

  it("ignores terminal and other-consumer messages", () => {
    const task = currentTaskForConsumer(
      runSnapshot({
        recentMessages: [
          taskMessage("committed", {
            state: "committed",
            updatedAt: "2026-06-26T00:00:02.000Z",
          }),
          taskMessage("failed", {
            state: "failed",
            updatedAt: "2026-06-26T00:00:03.000Z",
          }),
          taskMessage("other", {
            assignedConsumerId: "consumer-2",
            state: "processing",
            updatedAt: "2026-06-26T00:00:04.000Z",
          }),
        ],
      }),
      "consumer-1",
    );

    expect(task).toBeNull();
  });

  it("falls back to message ID when there is no idempotency key", () => {
    const task = currentTaskForConsumer(
      runSnapshot({
        recentMessages: [
          taskMessage("message-without-key", {
            value: { payload: { action: "page_view" } },
          }),
        ],
      }),
      "consumer-1",
    );

    expect(task).toMatchObject({
      duration: { status: "unknown" },
      idempotencyKey: null,
      label: "message-without-key",
      messageId: "message-without-key",
    });
  });

  it("derives committed task duration from receipt to commit", () => {
    const snapshot = runSnapshot({
      recentEvents: [
        receivedEvent("committed", "consumer-1", "2026-06-26T00:00:00.000Z", 1),
        committedEvent(
          "committed",
          "consumer-1",
          "2026-06-26T00:00:12.000Z",
          2,
        ),
      ],
    });
    const duration = taskDurationForMessage(
      snapshot,
      taskMessage("committed", { state: "committed" }),
    );

    expect(duration).toMatchObject({
      milliseconds: 12_000,
      status: "final",
    });
    expect(formatTaskDuration(duration)).toBe("12s");
  });

  it("derives failed task duration from receipt to processing failure", () => {
    const snapshot = runSnapshot({
      recentEvents: [
        receivedEvent("failed", "consumer-1", "2026-06-26T00:00:00.000Z", 1),
        failedEvent("failed", "consumer-1", "2026-06-26T00:01:08.000Z", 2),
      ],
    });
    const duration = taskDurationForMessage(
      snapshot,
      taskMessage("failed", { state: "failed" }),
    );

    expect(duration).toMatchObject({
      milliseconds: 68_000,
      status: "final",
    });
    expect(formatTaskDuration(duration)).toBe("1:08");
  });

  it("returns unknown duration when the start event is unavailable", () => {
    const duration = taskDurationForMessage(
      runSnapshot(),
      taskMessage("missing-start", { state: "committed" }),
    );

    expect(duration).toMatchObject({
      milliseconds: null,
      status: "unknown",
    });
    expect(formatTaskDuration(duration)).toBe("Duration unknown");
  });

  it("formats compact duration labels", () => {
    expect(formatDurationMs(2400)).toBe("2.4s");
    expect(formatDurationMs(14_200)).toBe("14s");
    expect(formatDurationMs(68_000)).toBe("1:08");
  });
});

function taskMessage(
  messageId: string,
  overrides: Parameters<typeof playgroundMessage>[0] = {},
) {
  return playgroundMessage({
    messageId,
    assignedConsumerId: "consumer-1",
    partition: 0,
    offset: "0",
    state: "processing",
    updatedAt: "2026-06-26T00:00:00.000Z",
    value: { payload: { idempotencyKey: "payment-1" } },
    ...overrides,
  });
}

function receivedEvent(
  messageId: string,
  consumerId: string,
  occurredAt: string,
  sequence: number,
): RuntimeEvent {
  return {
    actor: consumerId,
    consumerId,
    eventId: `event-${sequence}`,
    messageId,
    occurredAt,
    offset: "0",
    partition: 0,
    runId: "run-1",
    sequence,
    topic: "kplay.test",
    type: "message.received",
  };
}

function committedEvent(
  messageId: string,
  consumerId: string,
  occurredAt: string,
  sequence: number,
): RuntimeEvent {
  return {
    actor: consumerId,
    committedOffset: "1",
    consumerId,
    eventId: `event-${sequence}`,
    groupId: "kplay.test.workers",
    messageId,
    occurredAt,
    partition: 0,
    runId: "run-1",
    sequence,
    topic: "kplay.test",
    type: "offset.committed",
  };
}

function failedEvent(
  messageId: string,
  consumerId: string,
  occurredAt: string,
  sequence: number,
): RuntimeEvent {
  return {
    actor: consumerId,
    consumerId,
    eventId: `event-${sequence}`,
    message: "Processing failed.",
    messageId,
    occurredAt,
    runId: "run-1",
    sequence,
    type: "message.processing_failed",
  };
}
