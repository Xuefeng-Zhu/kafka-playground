import { describe, expect, it } from "vitest";
import { scenarioStateSchema, type ScenarioDefinition } from "@kplay/contracts";
import { DemoKafkaRuntimeAdapter } from "@kplay/kafka-runtime";
import { SCENARIOS } from "@kplay/scenario-engine";
import {
  createInternalRun,
  createRunSnapshot,
} from "./playground-runtime-state";

describe("playground runtime state", () => {
  it("creates scenario-specific run defaults", () => {
    const run = createInternalRun({
      runId: "run-1",
      adapter: new DemoKafkaRuntimeAdapter(),
      mode: "demo",
      scenario: scenario({
        id: "consumer-lag-backpressure",
        topic: { partitions: 4 },
      }),
      names: {
        topicName: "kplay.consumer-lag",
        consumerGroupId: "kplay.consumer-lag.workers",
      },
    });

    expect(run.scenarioId).toBe("consumer-lag-backpressure");
    expect(run.partitionCount).toBe(4);
    expect(run.keyStrategy).toEqual({ type: "no_key" });
    expect(run.processingLatencyMs).toBe(1200);
    expect(run.messageCounts).toMatchObject({
      produced: 0,
      received: 0,
      processed: 0,
      committed: 0,
      failed: 0,
    });
    expect(run.scenarioState).toMatchObject({
      scenarioId: "consumer-lag-backpressure",
      partitions: [
        { partition: 0 },
        { partition: 1 },
        { partition: 2 },
        { partition: 3 },
      ],
    });
  });

  it("creates schema-valid initial state for every canonical scenario", () => {
    for (const definition of SCENARIOS) {
      const run = createInternalRun({
        runId: `run-${definition.id}`,
        adapter: new DemoKafkaRuntimeAdapter(),
        mode: "demo",
        scenario: definition,
        names: {
          topicName: `kplay.${definition.id}`,
          consumerGroupId: `kplay.${definition.id}.workers`,
        },
      });

      expect(run.scenarioId).toBe(definition.id);
      expect(run.scenarioState?.scenarioId).toBe(definition.id);
      expect(
        scenarioStateSchema.safeParse(run.scenarioState).success,
        definition.id,
      ).toBe(true);
    }
  });

  it("derives partition-backed initial state from a custom partition count", () => {
    const customPartitionCount = 4;
    const expectedPartitions = [0, 1, 2, 3];

    const partitioningRun = createInternalRun({
      runId: "run-partitioning-4",
      adapter: new DemoKafkaRuntimeAdapter(),
      mode: "demo",
      scenario: scenario({
        id: "partitioning",
        topic: { partitions: customPartitionCount },
      }),
      names: {
        topicName: "kplay.partitioning-4",
        consumerGroupId: "kplay.partitioning-4.workers",
      },
    });
    const lagRun = createInternalRun({
      runId: "run-lag-4",
      adapter: new DemoKafkaRuntimeAdapter(),
      mode: "demo",
      scenario: scenario({
        id: "consumer-lag-backpressure",
        topic: { partitions: customPartitionCount },
      }),
      names: {
        topicName: "kplay.lag-4",
        consumerGroupId: "kplay.lag-4.workers",
      },
    });

    if (partitioningRun.scenarioState?.scenarioId !== "partitioning") {
      throw new Error("Missing partitioning state");
    }
    if (lagRun.scenarioState?.scenarioId !== "consumer-lag-backpressure") {
      throw new Error("Missing consumer lag state");
    }
    expect(
      partitioningRun.scenarioState.partitionPositions.map(
        ({ partition }) => partition,
      ),
    ).toEqual(expectedPartitions);
    expect(
      lagRun.scenarioState.partitions.map(({ partition }) => partition),
    ).toEqual(expectedPartitions);
  });

  it("projects bounded snapshots without exposing internal timers or handles", () => {
    const run = createInternalRun({
      runId: "run-1",
      adapter: new DemoKafkaRuntimeAdapter(),
      mode: "demo",
      scenario: scenario({ id: "partitioning" }),
      names: {
        topicName: "kplay.partitioning",
        consumerGroupId: "kplay.partitioning.workers",
      },
    });
    run.sequence = 3;
    run.messages.push(message("message-1"), message("message-2"));
    run.events.push(runtimeEvent(1), runtimeEvent(2), runtimeEvent(3));

    const snapshot = createRunSnapshot(run, 3, 2);

    expect(snapshot).toMatchObject({
      runId: "run-1",
      scenarioId: "partitioning",
      topicName: "kplay.partitioning",
      consumerLimit: 3,
      sequence: 3,
    });
    expect(snapshot.recentMessages.map((item) => item.messageId)).toEqual([
      "message-1",
      "message-2",
    ]);
    expect(snapshot.recentEvents.map((event) => event.sequence)).toEqual([
      2, 3,
    ]);
    expect("processingTimers" in snapshot).toBe(false);
  });
});

function scenario(
  override: Partial<ScenarioDefinition> = {},
): ScenarioDefinition {
  return {
    id: "partitioning",
    title: "Partitioning",
    description: "Partitioning scenario",
    disabled: false,
    learningObjectives: ["Understand partitioning"],
    topic: { partitions: 2 },
    limits: {
      maxConsumers: 3,
      maxProduceRate: 10,
      minProcessingLatencyMs: 0,
      maxProcessingLatencyMs: 5000,
    },
    ...override,
  };
}

function message(messageId: string) {
  return {
    messageId,
    runId: "run-1",
    topic: "kplay.partitioning",
    partition: 0,
    offset: "0",
    key: "user-1",
    value: {},
    headers: {},
    timestamp: "2026-06-26T00:00:00.000Z",
    state: "produced" as const,
    assignedConsumerId: null,
    committedOffset: null,
    createdAt: "2026-06-26T00:00:00.000Z",
    updatedAt: "2026-06-26T00:00:00.000Z",
  };
}

function runtimeEvent(sequence: number) {
  return {
    eventId: `event-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: "2026-06-26T00:00:00.000Z",
    type: "run.started" as const,
  };
}
