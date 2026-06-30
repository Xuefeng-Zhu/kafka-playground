import type {
  ConsumerSnapshot,
  PlaygroundMessage,
  RunSnapshot,
} from "@kplay/contracts";

export function runSnapshot(overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: "run-1",
    scenarioId: "partitioning",
    mode: "demo",
    status: "running",
    topicName: "kplay.test",
    partitionCount: 2,
    consumerLimit: 3,
    consumerGroupId: "kplay.test.workers",
    producerStatus: "stopped",
    productionRate: 1,
    keyStrategy: { type: "round_robin_users" },
    processingLatencyMs: 500,
    consumers: [],
    latestPartitionOffsets: {},
    latestCommittedOffsets: {},
    messageCounts: {
      produced: 0,
      received: 0,
      processed: 0,
      committed: 0,
      failed: 0,
    },
    recentMessages: [],
    recentEvents: [],
    cleanupStatus: "not_requested",
    sequence: 0,
    ...overrides,
  };
}

export function consumerSnapshot(
  overrides: Partial<ConsumerSnapshot> = {},
): ConsumerSnapshot {
  return {
    consumerId: "consumer-1",
    status: "running",
    assignments: [{ topic: "kplay.test", partition: 0 }],
    processedCount: 0,
    committedCount: 0,
    ...overrides,
  };
}

export function playgroundMessage(
  overrides: Partial<PlaygroundMessage> = {},
): PlaygroundMessage {
  return {
    messageId: "message-1",
    runId: "run-1",
    topic: "kplay.test",
    partition: 0,
    offset: "0",
    key: "user-1",
    value: {},
    headers: {},
    timestamp: new Date(0).toISOString(),
    state: "produced",
    assignedConsumerId: null,
    committedOffset: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}
