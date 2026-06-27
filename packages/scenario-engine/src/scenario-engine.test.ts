import { describe, expect, it } from "vitest";
import {
  KeyStrategyState,
  SCENARIOS,
  createPlaygroundValue,
  createResourceNames,
  evaluateScenarioProcessing,
  sanitizeResourceSegment,
  validateTopicPrefix,
} from "./index";
import { scenarioDefinitionSchema } from "@kplay/contracts";

describe("scenario engine", () => {
  it("generates valid resource names", () => {
    const names = createResourceNames({
      prefix: "kplay",
      scenarioId: "Partitioning!",
      now: new Date("2026-06-24T12:00:00Z"),
    });
    expect(names.topicName).toMatch(
      /^kplay\.partitioning\.20260624\.[a-f0-9]{6}$/,
    );
    expect(names.consumerGroupId).toContain(".workers");
  });

  it("rejects invalid prefixes", () => {
    expect(() => validateTopicPrefix("Bad Prefix")).toThrow();
  });

  it("cycles round-robin keys", () => {
    const keys = new KeyStrategyState();
    expect(keys.next({ type: "round_robin_users" })).toBe("user-1");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-2");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-3");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-1");
  });

  it("uses deterministic pseudo-random user IDs", () => {
    const first = new KeyStrategyState();
    const second = new KeyStrategyState();
    expect([
      first.next({ type: "random_user" }),
      first.next({ type: "random_user" }),
      first.next({ type: "random_user" }),
    ]).toEqual([
      second.next({ type: "random_user" }),
      second.next({ type: "random_user" }),
      second.next({ type: "random_user" }),
    ]);
  });

  it("sanitizes segments", () => {
    expect(sanitizeResourceSegment("Hello World!")).toBe("hello-world");
  });

  it("keeps every catalog scenario valid against the shared contract", () => {
    for (const scenario of SCENARIOS) {
      expect(() => scenarioDefinitionSchema.parse(scenario)).not.toThrow();
    }
  });

  it("keeps every catalog scenario available with a stable route id", () => {
    expect(SCENARIOS).toHaveLength(15);
    expect(SCENARIOS.every((scenario) => !scenario.disabled)).toBe(true);
    expect(new Set(SCENARIOS.map((scenario) => scenario.id)).size).toBe(
      SCENARIOS.length,
    );
    expect(
      SCENARIOS.every((scenario) => scenario.learningObjectives.length > 0),
    ).toBe(true);
  });

  it("describes the load-balancing scenario without promising extra groups", () => {
    const scenario = SCENARIOS.find(
      (item) => item.id === "fan-out-load-balancing",
    );

    expect(scenario).toMatchObject({
      title: "Consumer-group load balancing",
    });
    expect(scenario?.description).toContain("one group");
    expect(scenario?.description).not.toContain("independent consumer groups");
  });

  it("creates distinct scenario payloads for specialized scenarios", () => {
    for (const scenario of SCENARIOS.filter(
      (item) => item.id !== "partitioning",
    )) {
      const value = createPlaygroundValue({
        eventId: `evt-${scenario.id}`,
        runId: "run-1",
        scenarioId: scenario.id,
        sequence: 6,
        userId: "user-1",
      });

      expect(value.type, scenario.id).not.toBe("user.activity");
      expect(Object.keys(value.payload).length, scenario.id).toBeGreaterThan(1);
    }

    expect(
      createPlaygroundValue({
        eventId: "evt-1",
        runId: "run-1",
        scenarioId: "retry-dead-letter-queues",
        sequence: 3,
        userId: "user-1",
      }),
    ).toMatchObject({
      type: "fulfillment.request",
      payload: {
        shouldFail: true,
        retryTopic: "orders.retry.30s",
        deadLetterTopic: "orders.dlq",
      },
    });

    expect(
      createPlaygroundValue({
        eventId: "evt-2",
        runId: "run-1",
        scenarioId: "streams-joins-windows",
        sequence: 6,
        userId: "user-2",
      }),
    ).toMatchObject({
      type: "stream.window.event",
      payload: {
        lateArrival: true,
        streamName: "payments",
      },
    });
  });

  it("evaluates scenario-specific processing failures", () => {
    expect(
      evaluateScenarioProcessing({
        scenarioId: "schema-evolution-karapace",
        sequence: 4,
        value: {},
      }),
    ).toMatchObject({ code: "SCHEMA_INCOMPATIBLE" });
    expect(
      evaluateScenarioProcessing({
        scenarioId: "partitioning",
        sequence: 4,
        value: {},
      }),
    ).toBeNull();
  });
});
