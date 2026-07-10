import type { KeyStrategy, ScenarioDefinition } from "@kplay/contracts";
import { randomBytes, randomUUID } from "node:crypto";

const standardLimits = {
  maxConsumers: 3,
  maxProduceRate: 10,
  minProcessingLatencyMs: 0,
  maxProcessingLatencyMs: 5000,
};

const fanOutLoadBalancingLimits = {
  ...standardLimits,
  maxConsumers: 4,
};

export const SCENARIO_IDS = [
  "partitioning",
  "fan-out-load-balancing",
  "at-least-once-duplicates",
  "retry-dead-letter-queues",
  "schema-evolution-karapace",
  "transactional-producers",
  "event-replay-sourcing",
  "consumer-lag-backpressure",
  "hot-partitions-key-skew",
  "log-compaction-tombstones",
  "retention-data-loss",
  "cooperative-rebalancing",
  "streams-joins-windows",
  "outbox-cdc",
  "acl-least-privilege",
] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export const SCENARIOS = [
  {
    id: "partitioning",
    title: "Partitioning, Ordering, and Consumer Rebalancing",
    description:
      "Produce keyed messages, watch actual partitions and offsets, then add consumers to see group assignments and idle members.",
    disabled: false,
    learningObjectives: [
      "Messages with the same key are routed consistently while the topic partition count remains unchanged.",
      "Ordering is guaranteed only within a partition.",
      "Two partitions can be actively consumed by at most two members of the same consumer group.",
      "Receiving, processing, and committing offsets are distinct steps.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "fan-out-load-balancing",
    title: "Consumer-group load balancing",
    description:
      "Produce unkeyed messages and add consumers to see how one group divides partition ownership.",
    disabled: false,
    learningObjectives: [
      "One consumer group shares partitions across its active members.",
      "Extra members in the same group become idle when partitions are exhausted.",
      "Unkeyed events distribute across partitions differently than fixed-key events.",
    ],
    topic: { partitions: 3 },
    limits: fanOutLoadBalancingLimits,
  },
  {
    id: "at-least-once-duplicates",
    title: "At-least-once delivery and duplicate processing",
    description:
      "Pause commits and replay messages to see why idempotent handlers matter.",
    disabled: false,
    learningObjectives: [
      "A message can be processed before its offset is committed.",
      "Consumer interruption before commit can make a message visible again.",
      "Handlers should be idempotent because delivery can happen more than once.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "retry-dead-letter-queues",
    title: "Retry topics and dead-letter queues",
    description:
      "Route failed events through retries, backoff, and a terminal dead-letter topic.",
    disabled: false,
    learningObjectives: [
      "Failed processing should emit observable failure events.",
      "Retries separate transient failures from terminal dead-letter handling.",
      "Backoff keeps hot failures from overwhelming the main topic.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "schema-evolution-karapace",
    title: "Schema evolution using Karapace",
    description:
      "Publish compatible and incompatible payloads against a schema registry-backed topic.",
    disabled: false,
    learningObjectives: [
      "Schema versions create contracts between producers and consumers.",
      "Compatible payload changes can flow without breaking consumers.",
      "Incompatible payloads should fail before unsafe processing.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "transactional-producers",
    title: "Idempotent and transactional producers",
    description:
      "Observe producer sequence numbers, transactions, and exactly-once boundaries.",
    disabled: false,
    learningObjectives: [
      "Idempotent producers prevent duplicate writes from retried sends.",
      "Transactions group records and offset commits into one boundary.",
      "Consumers should only expose committed transactional output.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "event-replay-sourcing",
    title: "Event replay and event sourcing",
    description:
      "Rebuild derived state by resetting offsets and replaying an immutable event log.",
    disabled: false,
    learningObjectives: [
      "The event log remains the source of truth for derived projections.",
      "Resetting offsets replays historical records in partition order.",
      "Replay must distinguish rebuilding state from producing new facts.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "consumer-lag-backpressure",
    title: "Consumer lag and backpressure",
    description:
      "Increase production rate and processing latency to watch lag build and recover.",
    disabled: false,
    learningObjectives: [
      "Lag grows when production outpaces processing.",
      "Adding consumers can only help up to the partition count.",
      "Processing latency is a first-class capacity control.",
    ],
    topic: { partitions: 3 },
    limits: standardLimits,
  },
  {
    id: "hot-partitions-key-skew",
    title: "Hot partitions and key skew",
    description:
      "Send uneven keys to reveal overloaded partitions and poor distribution choices.",
    disabled: false,
    learningObjectives: [
      "A dominant key can overload one partition.",
      "More partitions do not help if the key distribution is skewed.",
      "Choosing keys is a capacity and ordering tradeoff.",
    ],
    topic: { partitions: 4 },
    limits: standardLimits,
  },
  {
    id: "log-compaction-tombstones",
    title: "Log compaction and tombstones",
    description:
      "Produce updates and deletes to see how compacted topics retain latest state.",
    disabled: false,
    learningObjectives: [
      "Compacted topics retain the latest value for each key.",
      "Tombstone records mark keys for deletion.",
      "Consumers may still observe historical updates before compaction completes.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "retention-data-loss",
    title: "Retention windows and data loss",
    description:
      "Expire old records and inspect what consumers can and cannot replay afterward.",
    disabled: false,
    learningObjectives: [
      "Retention limits how far consumers can rewind.",
      "Offsets can outlive the records they once referenced.",
      "Recovery plans must account for finite replay windows.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "cooperative-rebalancing",
    title: "Rebalance strategies and cooperative sticky assignment",
    description:
      "Compare eager and cooperative rebalances as consumers join and leave.",
    disabled: false,
    learningObjectives: [
      "Rebalances move partition ownership between group members.",
      "Cooperative assignment reduces full-stop revocations.",
      "Sticky assignment tries to preserve stable ownership.",
    ],
    topic: { partitions: 3 },
    limits: standardLimits,
  },
  {
    id: "streams-joins-windows",
    title: "Kafka Streams joins and windows",
    description:
      "Join two event streams and visualize window boundaries, late data, and grace periods.",
    disabled: false,
    learningObjectives: [
      "Windowed joins group records by event time.",
      "Late data can still join while grace remains open.",
      "State stores hold the working set needed for stream joins.",
    ],
    topic: { partitions: 3 },
    limits: standardLimits,
  },
  {
    id: "outbox-cdc",
    title: "Outbox pattern and CDC",
    description:
      "Move database changes into Kafka while preserving atomic writes and delivery order.",
    disabled: false,
    learningObjectives: [
      "Outbox rows bridge database commits and Kafka publication.",
      "CDC connectors publish ordered changes from the transaction log.",
      "Consumers need idempotency across connector retries.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
  {
    id: "acl-least-privilege",
    title: "ACLs, users, and least privilege",
    description:
      "Apply topic permissions and see how producer, consumer, and admin operations fail safely.",
    disabled: false,
    learningObjectives: [
      "Kafka principals need explicit permissions for topic operations.",
      "Least privilege narrows the blast radius of application credentials.",
      "Authorization failures should be visible and recoverable.",
    ],
    topic: { partitions: 2 },
    limits: standardLimits,
  },
] satisfies ScenarioDefinition[];

export const PRIMARY_SCENARIO = SCENARIOS[0];

export function findScenario(scenarioId: string) {
  return SCENARIOS.find((scenario) => scenario.id === scenarioId);
}

export function defaultKeyStrategyForScenario(scenarioId: string): KeyStrategy {
  if (scenarioId === "hot-partitions-key-skew")
    return { type: "fixed", value: "celebrity-user" };
  if (
    scenarioId === "fan-out-load-balancing" ||
    scenarioId === "consumer-lag-backpressure"
  )
    return { type: "no_key" };
  if (
    scenarioId === "schema-evolution-karapace" ||
    scenarioId === "acl-least-privilege"
  )
    return { type: "random_user" };
  return { type: "round_robin_users" };
}

export function defaultProcessingLatencyForScenario(scenarioId: string) {
  if (scenarioId === "consumer-lag-backpressure") return 1200;
  if (scenarioId === "retry-dead-letter-queues") return 800;
  if (scenarioId === "streams-joins-windows") return 900;
  return 3000;
}

export type ScenarioProcessingOutcome = {
  code: string;
  message: string;
};

export function evaluateScenarioProcessing(input: {
  scenarioId: string;
  sequence: number;
  value: Record<string, unknown>;
}): ScenarioProcessingOutcome | null {
  if (
    input.scenarioId === "retry-dead-letter-queues" &&
    input.sequence % 3 === 0
  ) {
    return {
      code: "ROUTE_TO_RETRY",
      message:
        "Handler failed; event moved to retry topic and marked for dead-letter escalation.",
    };
  }
  if (
    input.scenarioId === "schema-evolution-karapace" &&
    input.sequence % 4 === 0
  ) {
    return {
      code: "SCHEMA_INCOMPATIBLE",
      message:
        "Schema registry rejected this payload as incompatible with the active consumer contract.",
    };
  }
  if (input.scenarioId === "acl-least-privilege" && input.sequence % 3 === 0) {
    return {
      code: "AUTHORIZATION_FAILED",
      message:
        "Least-privilege ACL denied this simulated operation for the current principal.",
    };
  }
  return null;
}

export function createRunId() {
  return randomUUID();
}

export function sanitizeResourceSegment(segment: string) {
  return segment
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function validateTopicPrefix(prefix: string) {
  const sanitized = sanitizeResourceSegment(prefix);
  if (!sanitized || sanitized !== prefix || prefix.length > 32) {
    throw new Error(
      "KAFKA_TOPIC_PREFIX must use lowercase letters, numbers, dots, dashes, or underscores and be at most 32 characters.",
    );
  }
  return sanitized;
}

export function createResourceNames(input: {
  prefix: string;
  scenarioId: string;
  now?: Date;
}) {
  const prefix = validateTopicPrefix(input.prefix);
  const scenario = sanitizeResourceSegment(input.scenarioId);
  const date = (input.now ?? new Date())
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
  const suffix = randomBytes(3).toString("hex");
  const base = [prefix, scenario, date, suffix].join(".").slice(0, 180);
  return {
    topicName: base,
    consumerGroupId: `${base}.workers`.slice(0, 240),
  };
}

export class KeyStrategyState {
  private roundRobinIndex = 0;
  private sequence = 0;
  private randomSeed = 7;

  next(strategy: KeyStrategy) {
    this.sequence += 1;
    if (strategy.type === "fixed") return strategy.value;
    if (strategy.type === "round_robin_users") {
      const users = ["user-1", "user-2", "user-3"];
      const key = users[this.roundRobinIndex % users.length];
      this.roundRobinIndex += 1;
      return key;
    }
    if (strategy.type === "random_user") {
      const users = ["user-1", "user-2", "user-3", "user-4", "user-5"];
      return users[this.nextRandomIndex(users.length)];
    }
    return null;
  }

  get currentSequence() {
    return this.sequence;
  }

  private nextRandomIndex(length: number) {
    this.randomSeed = (this.randomSeed * 1664525 + 1013904223) >>> 0;
    return this.randomSeed % length;
  }
}

export function createPlaygroundValue(input: {
  eventId: string;
  runId: string;
  scenarioId: string;
  sequence: number;
  userId: string | null;
}) {
  return {
    eventId: input.eventId,
    runId: input.runId,
    scenarioId: input.scenarioId,
    type: scenarioEventType(input.scenarioId),
    userId: input.userId ?? "anonymous",
    sequence: input.sequence,
    createdAt: new Date().toISOString(),
    payload: scenarioPayload(input),
  };
}

export function createHeaders(input: {
  runId: string;
  eventId: string;
  scenarioId: string;
  sequence: number;
  keyStrategy: KeyStrategy;
}) {
  return {
    "x-playground-run-id": input.runId,
    "x-playground-event-id": input.eventId,
    "x-playground-scenario-id": input.scenarioId,
    "x-playground-sequence": String(input.sequence),
    "x-playground-key-strategy": input.keyStrategy.type,
  };
}

function scenarioEventType(scenarioId: string) {
  const types: Record<string, string> = {
    "fan-out-load-balancing": "fanout.activity",
    "at-least-once-duplicates": "payment.command",
    "retry-dead-letter-queues": "fulfillment.request",
    "schema-evolution-karapace": "profile.updated",
    "transactional-producers": "transaction.record",
    "event-replay-sourcing": "domain.event",
    "consumer-lag-backpressure": "work.item",
    "hot-partitions-key-skew": "celebrity.activity",
    "log-compaction-tombstones": "account.snapshot",
    "retention-data-loss": "retained.audit",
    "cooperative-rebalancing": "assignment.event",
    "streams-joins-windows": "stream.window.event",
    "outbox-cdc": "cdc.outbox.event",
    "acl-least-privilege": "secured.operation",
  };
  return types[scenarioId] ?? "user.activity";
}

function scenarioPayload(input: {
  eventId: string;
  runId: string;
  scenarioId: string;
  sequence: number;
  userId: string | null;
}) {
  const userId = input.userId ?? "anonymous";
  if (input.scenarioId === "fan-out-load-balancing") {
    return {
      action: "page_view",
      groupMode: "single-consumer-group",
      loadBalanceHint:
        input.sequence % 2 === 0
          ? "even-partition-spread"
          : "fanout-comparison",
    };
  }
  if (input.scenarioId === "at-least-once-duplicates") {
    return {
      action: "charge_card",
      idempotencyKey: `payment-${Math.ceil(input.sequence / 2)}`,
      duplicateRisk: input.sequence % 2 === 0,
    };
  }
  if (input.scenarioId === "retry-dead-letter-queues") {
    return {
      action: "ship_order",
      attempt: input.sequence % 3 === 0 ? 3 : 1,
      shouldFail: input.sequence % 3 === 0,
      retryTopic: "orders.retry.30s",
      deadLetterTopic: "orders.dlq",
    };
  }
  if (input.scenarioId === "schema-evolution-karapace") {
    return {
      schemaSubject: "profile-value",
      schemaVersion: input.sequence % 4 === 0 ? 3 : 2,
      compatible: input.sequence % 4 !== 0,
      fieldChange:
        input.sequence % 4 === 0
          ? "email changed from string to object"
          : "optional displayName added",
    };
  }
  if (input.scenarioId === "transactional-producers") {
    return {
      transactionId: `txn-${Math.ceil(input.sequence / 2)}`,
      producerEpoch: 1,
      sequenceNumber: input.sequence,
      commitBoundary: input.sequence % 2 === 0 ? "commit" : "open",
    };
  }
  if (input.scenarioId === "event-replay-sourcing") {
    return {
      aggregateId: `cart-${(input.sequence % 3) + 1}`,
      eventName: input.sequence % 2 === 0 ? "ItemRemoved" : "ItemAdded",
      replayCursor: input.sequence,
    };
  }
  if (input.scenarioId === "consumer-lag-backpressure") {
    return {
      workId: `work-${input.sequence}`,
      estimatedProcessingMs: 1200,
      priority: input.sequence % 5 === 0 ? "urgent" : "normal",
    };
  }
  if (input.scenarioId === "hot-partitions-key-skew") {
    return {
      action: "celebrity_post_viewed",
      skewKey: userId,
      expectedHotPartition: true,
      fanoutSize: 10000 + input.sequence,
    };
  }
  if (input.scenarioId === "log-compaction-tombstones") {
    return {
      compactedKey: userId,
      operation: input.sequence % 5 === 0 ? "delete" : "upsert",
      tombstone: input.sequence % 5 === 0,
      retainedValue:
        input.sequence % 5 === 0 ? null : `state-${input.sequence}`,
    };
  }
  if (input.scenarioId === "retention-data-loss") {
    return {
      retentionBucket: input.sequence <= 3 ? "expired-soon" : "active-window",
      replayableUntilOffset: Math.max(0, input.sequence - 3),
      recoveryNote:
        "Consumers cannot replay records outside the retention window.",
    };
  }
  if (input.scenarioId === "cooperative-rebalancing") {
    return {
      rebalanceStrategy: "cooperative-sticky",
      stickinessKey: userId,
      revocationScope: input.sequence % 2 === 0 ? "incremental" : "none",
    };
  }
  if (input.scenarioId === "streams-joins-windows") {
    const windowStart = Math.floor(input.sequence / 3) * 60;
    return {
      streamName: input.sequence % 2 === 0 ? "payments" : "orders",
      joinKey: userId,
      windowStartSecond: windowStart,
      windowEndSecond: windowStart + 60,
      lateArrival: input.sequence % 6 === 0,
    };
  }
  if (input.scenarioId === "outbox-cdc") {
    return {
      table: "orders",
      operation: input.sequence % 4 === 0 ? "update" : "insert",
      outboxId: input.eventId,
      lsn: `0/${(1000 + input.sequence).toString(16).toUpperCase()}`,
    };
  }
  if (input.scenarioId === "acl-least-privilege") {
    return {
      principal:
        input.sequence % 3 === 0 ? "analytics-reader" : "orders-service",
      operation: input.sequence % 3 === 0 ? "Write" : "Read",
      resource: "secured.orders",
      authorized: input.sequence % 3 !== 0,
    };
  }
  return {
    action: "page_view",
  };
}
