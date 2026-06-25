import { describe, expect, it } from "vitest";
import {
  consumerSnapshotSchema,
  runtimeEventSchema,
  settingsRequestSchema,
} from "./index";

describe("contracts", () => {
  it("validates committed offset events", () => {
    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "offset.committed",
        consumerId: "consumer-1",
        groupId: "group",
        topic: "topic",
        partition: 0,
        committedOffset: "2",
        messageId: "message",
      }),
    ).not.toThrow();
  });

  it("validates crashed consumers and crash events", () => {
    expect(() =>
      consumerSnapshotSchema.parse({
        consumerId: "consumer-1",
        status: "crashed",
        assignments: [],
        processedCount: 0,
        committedCount: 0,
      }),
    ).not.toThrow();

    expect(() =>
      runtimeEventSchema.parse({
        eventId: "evt",
        runId: "run",
        sequence: 1,
        occurredAt: new Date().toISOString(),
        type: "consumer.crashed",
        consumerId: "consumer-1",
        actor: "consumer-1",
        message: "consumer-1 crashed before a graceful shutdown.",
      }),
    ).not.toThrow();
  });

  it("rejects excessive producer rates", () => {
    expect(() => settingsRequestSchema.parse({ productionRate: 11 })).toThrow();
  });
});
