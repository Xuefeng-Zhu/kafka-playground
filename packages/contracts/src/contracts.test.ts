import { describe, expect, it } from "vitest";
import { runtimeEventSchema, settingsRequestSchema } from "./index";

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
        messageId: "message"
      })
    ).not.toThrow();
  });

  it("rejects excessive producer rates", () => {
    expect(() => settingsRequestSchema.parse({ productionRate: 11 })).toThrow();
  });
});
