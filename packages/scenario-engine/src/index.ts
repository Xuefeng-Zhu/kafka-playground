import type { KeyStrategy, ScenarioDefinition } from "@kplay/contracts";
import { randomBytes, randomUUID } from "node:crypto";

export const PRIMARY_SCENARIO: ScenarioDefinition = {
  id: "partitioning",
  title: "Partitioning, Ordering, and Consumer Rebalancing",
  description:
    "Produce keyed messages, watch actual partitions and offsets, then add consumers to see group assignments and idle members.",
  disabled: false,
  learningObjectives: [
    "Messages with the same key are routed consistently while the topic partition count remains unchanged.",
    "Ordering is guaranteed only within a partition.",
    "Two partitions can be actively consumed by at most two members of the same consumer group.",
    "Receiving, processing, and committing offsets are distinct steps."
  ],
  topic: { partitions: 2 },
  limits: {
    maxConsumers: 3,
    maxProduceRate: 10,
    minProcessingLatencyMs: 0,
    maxProcessingLatencyMs: 3000
  }
};

export const FUTURE_SCENARIOS: ScenarioDefinition[] = [
  "Fan-out versus load balancing",
  "At-least-once delivery and duplicate processing",
  "Retry topics and dead-letter queues",
  "Schema evolution using Karapace",
  "Idempotent and transactional producers",
  "Event replay and event sourcing"
].map((title, index) => ({
  id: `future-${index + 1}`,
  title,
  description: "Coming soon",
  disabled: true,
  learningObjectives: [],
  topic: { partitions: 2 },
  limits: {
    maxConsumers: 1,
    maxProduceRate: 1,
    minProcessingLatencyMs: 0,
    maxProcessingLatencyMs: 0
  }
}));

export const SCENARIOS = [PRIMARY_SCENARIO, ...FUTURE_SCENARIOS];

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
    throw new Error("KAFKA_TOPIC_PREFIX must use lowercase letters, numbers, dots, dashes, or underscores and be at most 32 characters.");
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
  const date = (input.now ?? new Date()).toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = randomBytes(3).toString("hex");
  const base = [prefix, scenario, date, suffix].join(".").slice(0, 180);
  return {
    topicName: base,
    consumerGroupId: `${base}.workers`.slice(0, 240)
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
  sequence: number;
  userId: string | null;
}) {
  return {
    eventId: input.eventId,
    runId: input.runId,
    type: "user.activity",
    userId: input.userId ?? "anonymous",
    sequence: input.sequence,
    createdAt: new Date().toISOString(),
    payload: {
      action: "page_view"
    }
  };
}

export function createHeaders(input: {
  runId: string;
  eventId: string;
  sequence: number;
  keyStrategy: KeyStrategy;
}) {
  return {
    "x-playground-run-id": input.runId,
    "x-playground-event-id": input.eventId,
    "x-playground-sequence": String(input.sequence),
    "x-playground-key-strategy": input.keyStrategy.type
  };
}
