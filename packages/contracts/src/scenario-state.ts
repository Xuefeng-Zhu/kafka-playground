import { z } from "zod";

export const scenarioStateIds = [
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
export type ScenarioStateId = (typeof scenarioStateIds)[number];

export const evidenceProvenanceSchema = z.enum([
  "observed",
  "derived",
  "simulated",
]);
export type EvidenceProvenance = z.infer<typeof evidenceProvenanceSchema>;

export const scenarioExperimentStatusSchema = z.object({
  status: z.enum(["idle", "running", "completed", "failed"]),
  experimentId: z.string().nullable(),
  stepIndex: z.number().int().nonnegative(),
  totalSteps: z.number().int().nonnegative(),
  startedAtVirtualMs: z.number().int().nonnegative().nullable(),
  completedAtVirtualMs: z.number().int().nonnegative().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
    })
    .nullable(),
});
export type ScenarioExperimentStatus = z.infer<
  typeof scenarioExperimentStatusSchema
>;

const offsetSchema = z.string();
const evidenceBase = {
  id: z.string(),
  provenance: evidenceProvenanceSchema,
};

function scenarioBase<const ScenarioId extends string>(scenarioId: ScenarioId) {
  return {
    version: z.literal(1),
    scenarioId: z.literal(scenarioId),
    virtualTimeMs: z.number().int().nonnegative(),
    revision: z.number().int().nonnegative(),
    experiment: scenarioExperimentStatusSchema,
  };
}

const assignmentSchema = z.object({
  consumerId: z.string(),
  partitions: z.array(z.number().int().nonnegative()),
});

export const partitioningScenarioStateSchema = z.object({
  ...scenarioBase("partitioning"),
  routingTraces: z.array(
    z.object({
      ...evidenceBase,
      messageId: z.string(),
      key: z.string().nullable(),
      partition: z.number().int().nonnegative(),
      offset: offsetSchema,
      sequence: z.number().int().positive(),
    }),
  ),
  partitionPositions: z.array(
    z.object({
      ...evidenceBase,
      partition: z.number().int().nonnegative(),
      processedOffset: offsetSchema.nullable(),
      committedOffset: offsetSchema.nullable(),
    }),
  ),
  consumers: z.array(
    z.object({
      ...evidenceBase,
      consumerId: z.string(),
      partitions: z.array(z.number().int().nonnegative()),
      status: z.enum(["running", "idle"]),
      epoch: z.number().int().nonnegative(),
    }),
  ),
  assignmentEpoch: z.number().int().nonnegative(),
});

export const loadBalancingScenarioStateSchema = z.object({
  ...scenarioBase("fan-out-load-balancing"),
  epochs: z.array(
    z.object({
      ...evidenceBase,
      epoch: z.number().int().nonnegative(),
      memberIds: z.array(z.string()),
      assignments: z.array(assignmentSchema),
      idleConsumerIds: z.array(z.string()),
    }),
  ),
});

export const duplicateScenarioStateSchema = z.object({
  ...scenarioBase("at-least-once-duplicates"),
  deliveries: z.array(
    z.object({
      ...evidenceBase,
      messageId: z.string(),
      partition: z.number().int().nonnegative(),
      offset: offsetSchema,
      attempt: z.number().int().positive(),
      consumerId: z.string(),
      sideEffectApplied: z.boolean(),
      committed: z.boolean(),
    }),
  ),
  sideEffects: z.array(
    z.object({
      ...evidenceBase,
      idempotencyKey: z.string(),
      naiveCount: z.number().int().nonnegative(),
      idempotentCount: z.number().int().nonnegative(),
    }),
  ),
});

export const retryScenarioStateSchema = z.object({
  ...scenarioBase("retry-dead-letter-queues"),
  records: z.array(
    z.object({
      ...evidenceBase,
      messageId: z.string(),
      kind: z.enum(["transient", "poison"]),
      status: z.enum(["main", "retry", "backoff", "succeeded", "dlq"]),
      attempt: z.number().int().positive(),
      maxAttempts: z.number().int().positive(),
      backoffUntilVirtualMs: z.number().int().nonnegative().nullable(),
      error: z.string().nullable(),
      route: z.array(
        z.object({
          stage: z.enum(["main", "retry", "backoff", "succeeded", "dlq"]),
          atVirtualMs: z.number().int().nonnegative(),
        }),
      ),
    }),
  ),
});

export const schemaEvolutionScenarioStateSchema = z.object({
  ...scenarioBase("schema-evolution-karapace"),
  activeVersion: z.number().int().positive(),
  topicRecordCount: z.number().int().nonnegative(),
  attempts: z.array(
    z.object({
      ...evidenceBase,
      version: z.number().int().positive(),
      compatible: z.boolean(),
      fieldDiff: z.array(
        z.object({
          field: z.string(),
          before: z.string().nullable(),
          after: z.string().nullable(),
          compatibility: z.enum(["compatible", "incompatible"]),
        }),
      ),
      gate: z.enum(["accepted", "rejected"]),
      reachedTopic: z.boolean(),
    }),
  ),
});

export const transactionScenarioStateSchema = z.object({
  ...scenarioBase("transactional-producers"),
  transactions: z.array(
    z.object({
      ...evidenceBase,
      transactionId: z.string(),
      status: z.enum(["open", "committed", "aborted"]),
      records: z.array(
        z.object({
          recordId: z.string(),
          producerSequence: z.number().int().nonnegative(),
          staged: z.boolean(),
          visible: z.boolean(),
        }),
      ),
      visibleRecordIds: z.array(z.string()),
      offsetsCommitted: z.boolean(),
      dedupe: z.array(
        z.object({
          producerSequence: z.number().int().nonnegative(),
          accepted: z.boolean(),
        }),
      ),
    }),
  ),
});

export const replayScenarioStateSchema = z.object({
  ...scenarioBase("event-replay-sourcing"),
  log: z.array(
    z.object({
      ...evidenceBase,
      offset: offsetSchema,
      aggregateId: z.string(),
      eventName: z.string(),
      delta: z.number().int(),
    }),
  ),
  cursor: offsetSchema.nullable(),
  projection: z.record(z.string(), z.number().int()),
  rebuildInProgress: z.boolean(),
  producedCount: z.number().int().nonnegative(),
});

export const lagScenarioStateSchema = z.object({
  ...scenarioBase("consumer-lag-backpressure"),
  samples: z.array(
    z.object({
      ...evidenceBase,
      atVirtualMs: z.number().int().nonnegative(),
      productionRate: z.number().nonnegative(),
      processingRate: z.number().nonnegative(),
      lag: z.number().int().nonnegative(),
      trend: z.enum(["rising", "steady", "falling"]),
    }),
  ),
  partitions: z.array(
    z.object({
      ...evidenceBase,
      partition: z.number().int().nonnegative(),
      endOffset: offsetSchema,
      committedOffset: offsetSchema,
      lag: z.number().int().nonnegative(),
    }),
  ),
  consumerCount: z.number().int().nonnegative(),
  drainEstimateMs: z.number().int().nonnegative().nullable(),
});

const phaseRouteSchema = z.object({
  messageId: z.string(),
  key: z.string().nullable(),
  partition: z.number().int().nonnegative(),
});

export const hotPartitionScenarioStateSchema = z.object({
  ...scenarioBase("hot-partitions-key-skew"),
  phases: z.array(
    z.object({
      ...evidenceBase,
      kind: z.enum(["hot", "balanced"]),
      total: z.number().int().nonnegative(),
      partitionCounts: z.array(z.number().int().nonnegative()),
      percentages: z.array(z.number().nonnegative()),
      skewRatio: z.number().nonnegative(),
      routes: z.array(phaseRouteSchema),
    }),
  ),
});

export const compactionScenarioStateSchema = z.object({
  ...scenarioBase("log-compaction-tombstones"),
  rawLog: z.array(
    z.object({
      ...evidenceBase,
      offset: offsetSchema,
      key: z.string(),
      value: z.string().nullable(),
      tombstone: z.boolean(),
      removedAtStage: z.enum(["compaction", "tombstone_cleanup"]).nullable(),
    }),
  ),
  materialized: z.array(
    z.object({
      ...evidenceBase,
      key: z.string(),
      value: z.string().nullable(),
      sourceOffset: offsetSchema,
    }),
  ),
  cleanerPasses: z.array(
    z.object({
      ...evidenceBase,
      stage: z.enum(["compaction", "tombstone_cleanup"]),
      removedOffsets: z.array(offsetSchema),
      atVirtualMs: z.number().int().nonnegative(),
    }),
  ),
});

export const retentionScenarioStateSchema = z.object({
  ...scenarioBase("retention-data-loss"),
  records: z.array(
    z.object({
      ...evidenceBase,
      offset: offsetSchema,
      createdAtVirtualMs: z.number().int().nonnegative(),
      expired: z.boolean(),
    }),
  ),
  retentionMs: z.number().int().positive(),
  cutoffVirtualMs: z.number().int().nonnegative(),
  logStartOffset: offsetSchema,
  committedOffset: offsetSchema,
  error: z
    .object({
      code: z.literal("offset_out_of_range"),
      requestedOffset: offsetSchema,
      recoveryOptions: z.array(z.enum(["earliest", "latest", "restore"])),
      provenance: evidenceProvenanceSchema,
    })
    .nullable(),
});

const ownershipSnapshotSchema = z.array(assignmentSchema);

export const cooperativeScenarioStateSchema = z.object({
  ...scenarioBase("cooperative-rebalancing"),
  comparisons: z.array(
    z.object({
      ...evidenceBase,
      strategy: z.enum(["eager", "cooperative_sticky"]),
      before: ownershipSnapshotSchema,
      after: ownershipSnapshotSchema,
      keptPartitions: z.array(z.number().int().nonnegative()),
      movedPartitions: z.array(
        z.object({
          partition: z.number().int().nonnegative(),
          fromConsumerId: z.string(),
          toConsumerId: z.string(),
        }),
      ),
      revokedPartitions: z.array(z.number().int().nonnegative()),
      pausedPartitions: z.array(z.number().int().nonnegative()),
    }),
  ),
});

export const streamsScenarioStateSchema = z.object({
  ...scenarioBase("streams-joins-windows"),
  inputs: z.array(
    z.object({
      ...evidenceBase,
      recordId: z.string(),
      stream: z.enum(["orders", "payments"]),
      key: z.string(),
      eventTimeMs: z.number().int().nonnegative(),
      arrivalTimeMs: z.number().int().nonnegative(),
      windowId: z.string(),
      status: z.enum(["buffered", "joined", "unmatched", "late"]),
    }),
  ),
  windows: z.array(
    z.object({
      ...evidenceBase,
      windowId: z.string(),
      startMs: z.number().int().nonnegative(),
      endMs: z.number().int().nonnegative(),
      graceEndMs: z.number().int().nonnegative(),
      closed: z.boolean(),
    }),
  ),
  joins: z.array(
    z.object({
      ...evidenceBase,
      joinId: z.string(),
      key: z.string(),
      orderRecordId: z.string(),
      paymentRecordId: z.string(),
      windowId: z.string(),
    }),
  ),
  lateRecords: z.array(z.string()),
});

export const outboxScenarioStateSchema = z.object({
  ...scenarioBase("outbox-cdc"),
  dbTransactions: z.array(
    z.object({
      ...evidenceBase,
      transactionId: z.string(),
      businessRowId: z.string(),
      outboxRowId: z.string(),
      committed: z.boolean(),
    }),
  ),
  wal: z.array(
    z.object({
      ...evidenceBase,
      lsn: z.string(),
      transactionId: z.string(),
      outboxRowId: z.string(),
    }),
  ),
  connectorAttempts: z.array(
    z.object({
      ...evidenceBase,
      attemptId: z.string(),
      outboxRowId: z.string(),
      lsn: z.string(),
      attempt: z.number().int().positive(),
      status: z.enum(["read", "published", "retried"]),
    }),
  ),
  publishes: z.array(
    z.object({
      ...evidenceBase,
      messageId: z.string(),
      outboxRowId: z.string(),
      lsn: z.string(),
      acknowledged: z.boolean(),
      deduplicated: z.boolean(),
    }),
  ),
  dedupeLedger: z.array(
    z.object({
      ...evidenceBase,
      outboxRowId: z.string(),
      acceptedMessageId: z.string(),
      suppressedAttempts: z.number().int().nonnegative(),
    }),
  ),
});

export const aclScenarioStateSchema = z.object({
  ...scenarioBase("acl-least-privilege"),
  policies: z.array(
    z.object({
      ...evidenceBase,
      principal: z.string(),
      operation: z.enum(["read", "write", "create", "describe"]),
      resource: z.string(),
      effect: z.enum(["allow", "deny"]),
    }),
  ),
  attempts: z.array(
    z.object({
      ...evidenceBase,
      principal: z.string(),
      operation: z.enum(["read", "write", "create", "describe"]),
      resource: z.string(),
      matchedPolicyId: z.string().nullable(),
      decision: z.enum(["allowed", "denied"]),
      terminatedBeforeKafka: z.boolean(),
    }),
  ),
  lastHighlightedCell: z
    .object({
      principal: z.string(),
      operation: z.enum(["read", "write", "create", "describe"]),
      resource: z.string(),
    })
    .nullable(),
});

export const scenarioStateSchema = z.discriminatedUnion("scenarioId", [
  partitioningScenarioStateSchema,
  loadBalancingScenarioStateSchema,
  duplicateScenarioStateSchema,
  retryScenarioStateSchema,
  schemaEvolutionScenarioStateSchema,
  transactionScenarioStateSchema,
  replayScenarioStateSchema,
  lagScenarioStateSchema,
  hotPartitionScenarioStateSchema,
  compactionScenarioStateSchema,
  retentionScenarioStateSchema,
  cooperativeScenarioStateSchema,
  streamsScenarioStateSchema,
  outboxScenarioStateSchema,
  aclScenarioStateSchema,
]);

export type ScenarioState = z.infer<typeof scenarioStateSchema>;
