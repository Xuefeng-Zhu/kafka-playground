import { z } from "zod";
import { scenarioStateSchema } from "./scenario-state";

export * from "./scenario-state";

export const kafkaModeSchema = z.enum(["demo", "aiven", "remote"]);
export type KafkaMode = z.infer<typeof kafkaModeSchema>;

export const userSelectableKafkaModeSchema = z.enum(["demo", "remote"]);
export type UserSelectableKafkaMode = z.infer<
  typeof userSelectableKafkaModeSchema
>;

export const saslMechanismSchema = z.enum([
  "PLAIN",
  "SCRAM-SHA-256",
  "SCRAM-SHA-512",
]);
export type SaslMechanism = z.infer<typeof saslMechanismSchema>;

export const remoteKafkaConfigSchema = z.object({
  brokers: z.string().trim().max(2000).default(""),
  username: z.string().trim().max(300).default(""),
  password: z.string().max(1000).default(""),
  saslMechanism: saslMechanismSchema.default("SCRAM-SHA-256"),
  useTls: z.boolean().default(true),
  caCertificate: z.string().max(20000).default(""),
});
export type RemoteKafkaConfig = z.infer<typeof remoteKafkaConfigSchema>;

export function parseRemoteKafkaBrokerList(value: string) {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

export function getMissingRemoteKafkaConfigFields(config: RemoteKafkaConfig) {
  const missing = [];
  if (parseRemoteKafkaBrokerList(config.brokers).length === 0) {
    missing.push("brokers");
  }
  if (!config.username) missing.push("username");
  if (!config.password) missing.push("password");
  return missing;
}

export const runStatusSchema = z.enum([
  "idle",
  "starting",
  "running",
  "stopping",
  "stopped",
  "error",
  "cleaning",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const producerStatusSchema = z.enum([
  "stopped",
  "starting",
  "running",
  "paused",
]);
export type ProducerStatus = z.infer<typeof producerStatusSchema>;

export const cleanupStatusSchema = z.enum([
  "not_requested",
  "requested",
  "completed",
  "partially_completed",
  "failed",
]);
export type CleanupStatus = z.infer<typeof cleanupStatusSchema>;

export const keyStrategySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("fixed"), value: z.string().min(1).max(80) }),
  z.object({ type: z.literal("round_robin_users") }),
  z.object({ type: z.literal("random_user") }),
  z.object({ type: z.literal("no_key") }),
]);
export type KeyStrategy = z.infer<typeof keyStrategySchema>;

export const scenarioDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  disabled: z.boolean().default(false),
  learningObjectives: z.array(z.string()),
  topic: z.object({ partitions: z.number().int().positive() }),
  limits: z.object({
    maxConsumers: z.number().int().positive(),
    maxProduceRate: z.number().int().positive(),
    minProcessingLatencyMs: z.number().int().min(0),
    maxProcessingLatencyMs: z.number().int().min(0),
  }),
});
export type ScenarioDefinition = z.infer<typeof scenarioDefinitionSchema>;

export const messageStateSchema = z.enum([
  "producing",
  "produced",
  "received",
  "processing",
  "processed",
  "commit_requested",
  "committed",
  "failed",
]);
export type MessageState = z.infer<typeof messageStateSchema>;

export const consumerSnapshotSchema = z.object({
  consumerId: z.string(),
  status: z.enum([
    "starting",
    "running",
    "idle",
    "stopping",
    "stopped",
    "crashed",
  ]),
  assignments: z.array(
    z.object({
      topic: z.string(),
      partition: z.number().int().nonnegative(),
    }),
  ),
  processedCount: z.number().int().nonnegative(),
  committedCount: z.number().int().nonnegative(),
});
export type ConsumerSnapshot = z.infer<typeof consumerSnapshotSchema>;

export const playgroundMessageSchema = z.object({
  messageId: z.string(),
  runId: z.string(),
  topic: z.string(),
  partition: z.number().int().nonnegative().nullable(),
  offset: z.string().nullable(),
  key: z.string().nullable(),
  value: z.record(z.string(), z.unknown()),
  headers: z.record(z.string(), z.string()),
  timestamp: z.string().nullable(),
  state: messageStateSchema,
  assignedConsumerId: z.string().nullable(),
  committedOffset: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PlaygroundMessage = z.infer<typeof playgroundMessageSchema>;

const eventBaseSchema = z.object({
  eventId: z.string(),
  runId: z.string(),
  sequence: z.number().int().positive(),
  occurredAt: z.string(),
  actor: z.string().optional(),
});

export const simpleRuntimeEventTypes = [
  "run.started",
  "run.stopping",
  "run.stopped",
  "run.error",
  "topic.creating",
  "topic.created",
  "producer.starting",
  "producer.started",
  "producer.paused",
  "producer.stopped",
  "message.producing",
  "message.processing_started",
  "message.processing_completed",
  "message.processing_failed",
  "consumer.starting",
  "consumer.started",
  "consumer.idle",
  "consumer.stopping",
  "consumer.stopped",
  "consumer.crashing",
  "consumer.crashed",
  "resource.cleanup_started",
  "resource.cleanup_completed",
  "resource.cleanup_failed",
] as const;

export const detailedRuntimeEventTypes = [
  "message.produced",
  "message.received",
  "consumer.partitions_assigned",
  "consumer.partitions_revoked",
  "offset.commit_requested",
  "offset.committed",
  "offset.commit_failed",
] as const;

export const runtimeEventTypes = [
  ...simpleRuntimeEventTypes,
  ...detailedRuntimeEventTypes,
  "scenario.experiment.started",
  "scenario.experiment.transition",
  "scenario.experiment.completed",
  "scenario.experiment.failed",
] as const;

const scenarioExperimentEventBaseSchema = eventBaseSchema.extend({
  scenarioId: z.string(),
  experimentId: z.string(),
  entityIds: z.array(z.string()).min(1),
  provenance: z.enum(["observed", "derived", "simulated"]),
  virtualTimeMs: z.number().int().nonnegative(),
  messageId: z.string().optional(),
  partition: z.number().int().nonnegative().optional(),
  offset: z.string().optional(),
  step: z.object({
    id: z.string(),
    index: z.number().int().nonnegative(),
    total: z.number().int().positive(),
    label: z.string(),
  }),
});

export const runtimeEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({
    type: z.enum(simpleRuntimeEventTypes),
    message: z.string().optional(),
    consumerId: z.string().optional(),
    messageId: z.string().optional(),
  }),
  eventBaseSchema.extend({
    type: z.literal("message.produced"),
    messageId: z.string(),
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    offset: z.string(),
    key: z.string().nullable(),
    kafkaTimestamp: z.string().nullable(),
  }),
  eventBaseSchema.extend({
    type: z.literal("message.received"),
    messageId: z.string(),
    consumerId: z.string(),
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    offset: z.string(),
  }),
  eventBaseSchema.extend({
    type: z.literal("consumer.partitions_assigned"),
    consumerId: z.string(),
    assignments: z.array(
      z.object({
        topic: z.string(),
        partition: z.number().int().nonnegative(),
      }),
    ),
  }),
  eventBaseSchema.extend({
    type: z.literal("consumer.partitions_revoked"),
    consumerId: z.string(),
    assignments: z.array(
      z.object({
        topic: z.string(),
        partition: z.number().int().nonnegative(),
      }),
    ),
  }),
  eventBaseSchema.extend({
    type: z.literal("offset.commit_requested"),
    consumerId: z.string(),
    groupId: z.string(),
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    committedOffset: z.string(),
    messageId: z.string(),
  }),
  eventBaseSchema.extend({
    type: z.literal("offset.committed"),
    consumerId: z.string(),
    groupId: z.string(),
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    committedOffset: z.string(),
    messageId: z.string(),
  }),
  eventBaseSchema.extend({
    type: z.literal("offset.commit_failed"),
    consumerId: z.string(),
    groupId: z.string(),
    topic: z.string(),
    partition: z.number().int().nonnegative(),
    attemptedOffset: z.string(),
    messageId: z.string(),
    errorCode: z.string(),
  }),
  scenarioExperimentEventBaseSchema.extend({
    type: z.literal("scenario.experiment.started"),
  }),
  scenarioExperimentEventBaseSchema.extend({
    type: z.literal("scenario.experiment.transition"),
    transition: z.string(),
  }),
  scenarioExperimentEventBaseSchema.extend({
    type: z.literal("scenario.experiment.completed"),
  }),
  scenarioExperimentEventBaseSchema.extend({
    type: z.literal("scenario.experiment.failed"),
    errorCode: z.string(),
    message: z.string(),
  }),
]);
export type RuntimeEvent = z.infer<typeof runtimeEventSchema>;

export const cleanupResultSchema = z.object({
  status: cleanupStatusSchema,
  steps: z.array(
    z.object({
      name: z.string(),
      status: z.enum(["requested", "completed", "failed", "skipped"]),
      resourceName: z.string().optional(),
      message: z.string().optional(),
    }),
  ),
});
export type CleanupResult = z.infer<typeof cleanupResultSchema>;

export const runSnapshotSchema = z.object({
  runId: z.string(),
  scenarioId: z.string(),
  mode: kafkaModeSchema,
  status: runStatusSchema,
  topicName: z.string(),
  partitionCount: z.number().int().positive(),
  consumerLimit: z.number().int().positive(),
  consumerGroupId: z.string(),
  producerStatus: producerStatusSchema,
  productionRate: z.number().int().positive(),
  keyStrategy: keyStrategySchema,
  processingLatencyMs: z.number().int().min(0),
  consumers: z.array(consumerSnapshotSchema),
  latestPartitionOffsets: z.record(z.string(), z.string()),
  latestCommittedOffsets: z.record(z.string(), z.string()),
  messageCounts: z.record(z.string(), z.number().int().nonnegative()),
  recentMessages: z.array(playgroundMessageSchema),
  recentEvents: z.array(runtimeEventSchema),
  cleanupStatus: cleanupStatusSchema,
  sequence: z.number().int().nonnegative(),
  scenarioState: scenarioStateSchema.nullable().optional(),
});
export type RunSnapshot = z.infer<typeof runSnapshotSchema>;

export const connectionStatusSchema = z.object({
  status: z.enum([
    "connected",
    "disconnected",
    "configuration_missing",
    "connection_failed",
    "demo_mode",
  ]),
  mode: kafkaModeSchema,
  maskedBrokerHost: z.string().nullable(),
  brokerCount: z.number().int().nonnegative(),
  topicCount: z.number().int().nonnegative().nullable(),
  missingVariables: z.array(z.string()).default([]),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
  checkedAt: z.string(),
});
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const connectionTestRequestSchema = z
  .object({
    mode: userSelectableKafkaModeSchema.default("demo"),
    remoteKafkaConfig: remoteKafkaConfigSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "remote" && !value.remoteKafkaConfig) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remoteKafkaConfig"],
        message: "Remote Kafka configuration is required.",
      });
    }
  });
export type ConnectionTestRequest = z.infer<typeof connectionTestRequestSchema>;

export const problemDetailsSchema = z.object({
  code: z.string(),
  message: z.string(),
  requestId: z.string(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const createRunRequestSchema = z
  .object({
    scenarioId: z.string().default("partitioning"),
    mode: userSelectableKafkaModeSchema.default("demo"),
    remoteKafkaConfig: remoteKafkaConfigSchema.optional(),
  })
  .superRefine((value, context) => {
    if (value.mode === "remote" && !value.remoteKafkaConfig) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["remoteKafkaConfig"],
        message: "Remote Kafka configuration is required.",
      });
    }
  });
export const settingsRequestSchema = z.object({
  productionRate: z.number().int().min(1).max(10).optional(),
  keyStrategy: keyStrategySchema.optional(),
  processingLatencyMs: z.number().int().min(0).max(5000).optional(),
});
export const produceMessageRequestSchema = z.object({
  keyStrategy: keyStrategySchema.optional(),
});

export type CreateRunRequest = z.infer<typeof createRunRequestSchema>;
export type SettingsRequest = z.infer<typeof settingsRequestSchema>;
export type ProduceMessageRequest = z.infer<typeof produceMessageRequestSchema>;
