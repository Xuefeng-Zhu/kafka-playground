import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import {
  currentTasksForConsumer,
  formatDurationMs,
  formatTaskDuration,
  taskDurationForMessage,
} from "./current-consumer-task";

describe("currentTasksForConsumer", () => {
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
    expect(tasks[0]).toMatchObject({
      label: "payment-p0-first",
      partitionOffset: "P0@1",
      state: "received",
    });
    expect(formatTaskDuration(tasks[0].duration)).toBe("1.5s");
  });

  it("sorts offsets above Number.MAX_SAFE_INTEGER without precision loss", () => {
    const tasks = currentTasksForConsumer(
      runSnapshot({
        recentMessages: [
          taskMessage("higher", {
            offset: "9007199254740993",
            updatedAt: "2026-06-26T00:00:00.000Z",
          }),
          taskMessage("lower", {
            offset: "9007199254740992",
            updatedAt: "2026-06-26T00:00:01.000Z",
          }),
        ],
      }),
      "consumer-1",
    );

    expect(tasks.map((task) => task.messageId)).toEqual(["lower", "higher"]);
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

  it("derives failed task duration from receipt to commit failure", () => {
    const snapshot = runSnapshot({
      recentEvents: [
        receivedEvent(
          "commit-failed",
          "consumer-1",
          "2026-06-26T00:00:00.000Z",
          1,
        ),
        commitFailedEvent(
          "commit-failed",
          "consumer-1",
          "2026-06-26T00:00:02.400Z",
          2,
        ),
      ],
    });
    const duration = taskDurationForMessage(
      snapshot,
      taskMessage("commit-failed", { state: "failed" }),
    );

    expect(duration).toMatchObject({
      milliseconds: 2400,
      status: "final",
    });
    expect(formatTaskDuration(duration)).toBe("2.4s");
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

function commitFailedEvent(
  messageId: string,
  consumerId: string,
  occurredAt: string,
  sequence: number,
): RuntimeEvent {
  return {
    actor: consumerId,
    attemptedOffset: "1",
    consumerId,
    errorCode: "COMMIT_FAILED",
    eventId: `event-${sequence}`,
    groupId: "kplay.test.workers",
    messageId,
    occurredAt,
    partition: 0,
    runId: "run-1",
    sequence,
    topic: "kplay.test",
    type: "offset.commit_failed",
  };
}
