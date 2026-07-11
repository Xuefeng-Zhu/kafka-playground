import type { ScenarioExperimentStatus, ScenarioState } from "@kplay/contracts";

export type TeachingScenarioTestCase = {
  scenarioId: ScenarioState["scenarioId"];
  noviceQuestion: string;
  initial: ScenarioState;
  pivotal: ScenarioState;
  contrast: ScenarioState;
  expectation: {
    lensKind:
      | "routing"
      | "assignment"
      | "lifecycle"
      | "pipeline"
      | "gate"
      | "transaction"
      | "projection"
      | "capacity"
      | "heatmap"
      | "window-join";
    initialFact: readonly [id: string, value: string | number];
    pivotalFact: readonly [id: string, value: string | number];
    contrastFact: readonly [id: string, value: string | number];
  };
};

const simulated = { provenance: "simulated" as const };

const partitioningInitial = state({
  ...base("partitioning"),
  routingTraces: [],
  partitionPositions: [position(0, null, null), position(1, null, null)],
  consumers: [],
  assignmentEpoch: 0,
});
const partitioningPivotal = state({
  ...partitioningInitial,
  revision: 1,
  experiment: complete("produce-keyed-record", 3),
  routingTraces: [
    route("route-a-1", "message-a-1", "A", 0, "0", 1),
    route("route-b-1", "message-b-1", "B", 1, "0", 2),
    route("route-a-2", "message-a-2", "A", 0, "1", 3),
  ],
  partitionPositions: [position(0, "1", "2"), position(1, "0", "1")],
  consumers: [consumer("consumer-1", [0, 1], "running")],
  assignmentEpoch: 1,
});
const partitioningContrast = state({
  ...partitioningPivotal,
  revision: 2,
  experiment: complete("grow-consumer-group"),
  consumers: [
    consumer("consumer-1", [0], "running"),
    consumer("consumer-2", [1], "running"),
    consumer("consumer-3", [], "idle"),
  ],
  assignmentEpoch: 2,
});

const assignmentInitial = state({
  ...base("fan-out-load-balancing"),
  epochs: [],
});
const assignmentPivotal = state({
  ...assignmentInitial,
  revision: 4,
  experiment: complete("grow-consumer-group", 4),
  epochs: [
    epoch(1, [[0, 1, 2]], []),
    epoch(2, [[0, 2], [1]], []),
    epoch(3, [[0], [1], [2]], []),
    epoch(4, [[0], [1], [2], []], ["consumer-4"]),
  ],
});
const assignmentContrast = state({
  ...assignmentPivotal,
  revision: 7,
  experiment: complete("produce-unkeyed-burst", 3),
});

const duplicateInitial = state({
  ...base("at-least-once-duplicates"),
  deliveries: [],
  sideEffects: [],
});
const duplicatePivotal = state({
  ...duplicateInitial,
  revision: 3,
  experiment: complete("crash-and-redeliver", 3),
  deliveries: [
    delivery("delivery-1", 1, false),
    delivery("delivery-2", 2, true),
  ],
  sideEffects: [sideEffect("payment-42", 2, 1)],
});
const duplicateContrast = state({
  ...duplicatePivotal,
  revision: 4,
  experiment: complete("duplicate-risk-records", 1),
});

const retryInitial = state({
  ...base("retry-dead-letter-queues"),
  records: [],
});
const retryPivotal = state({
  ...retryInitial,
  revision: 1,
  virtualTimeMs: 1_100,
  experiment: complete("transient-recovery", 3),
  records: [retryRecord("retry-transient", "transient", "succeeded", 2)],
});
const retryContrast = state({
  ...retryPivotal,
  revision: 2,
  virtualTimeMs: 4_200,
  experiment: complete("poison-to-dlq", 3),
  records: [
    ...retryPivotal.records,
    retryRecord("retry-poison", "poison", "dlq", 3),
  ],
});

const schemaInitial = state({
  ...base("schema-evolution-karapace"),
  activeVersion: 1,
  topicRecordCount: 0,
  attempts: [],
});
const schemaPivotal = state({
  ...schemaInitial,
  revision: 1,
  experiment: complete("compatible-schema", 2),
  activeVersion: 1,
  topicRecordCount: 1,
  attempts: [schemaAttempt("schema-attempt-v2", 2, true)],
});
const schemaContrast = state({
  ...schemaPivotal,
  revision: 2,
  experiment: complete("trigger-schema-rejection", 2),
  attempts: [
    ...schemaPivotal.attempts,
    schemaAttempt("schema-attempt-v3", 3, false),
  ],
});

const transactionInitial = state({
  ...base("transactional-producers"),
  transactions: [],
});
const transactionPivotal = state({
  ...transactionInitial,
  revision: 1,
  experiment: complete("transaction-pair", 2),
  transactions: [
    transaction("txn-1", "committed", ["txn-1-r1", "txn-1-r2"], true),
  ],
});
const transactionContrast = state({
  ...transactionPivotal,
  revision: 2,
  experiment: complete("abort-and-dedupe", 2),
  transactions: [
    ...transactionPivotal.transactions,
    transaction("txn-2", "aborted", ["txn-2-r1"], false),
    {
      ...transaction("txn-3", "committed", ["txn-3-r1"], true),
      dedupe: [
        { producerSequence: 3, accepted: true },
        { producerSequence: 3, accepted: false },
      ],
    },
  ],
});

const replayInitial = state({
  ...base("event-replay-sourcing"),
  log: [],
  cursor: null,
  projection: {},
  rebuildInProgress: false,
  producedCount: 0,
});
const replayPivotal = state({
  ...replayInitial,
  revision: 1,
  experiment: complete("aggregate-events", 3),
  log: [replayEvent(0, 1), replayEvent(1, 1), replayEvent(2, -1)],
  cursor: "3",
  projection: { "cart-1": 1 },
  producedCount: 3,
});
const replayContrast = state({
  ...replayPivotal,
  revision: 2,
  experiment: complete("rebuild-projection", 5),
  cursor: "3",
  rebuildInProgress: false,
  projection: { "cart-1": 1 },
  producedCount: 3,
});

const lagInitial = state({
  ...base("consumer-lag-backpressure"),
  samples: [],
  partitions: [lagPartition(0, 0), lagPartition(1, 0), lagPartition(2, 0)],
  consumerCount: 1,
  drainEstimateMs: null,
});
const lagPivotal = state({
  ...lagInitial,
  revision: 1,
  virtualTimeMs: 5_000,
  experiment: complete("build-lag", 1),
  samples: [lagSample("lag-sample-0", 8, 2, 18, "rising")],
  partitions: [lagPartition(0, 7), lagPartition(1, 5), lagPartition(2, 6)],
  drainEstimateMs: 9_000,
});
const lagContrast = state({
  ...lagPivotal,
  revision: 2,
  virtualTimeMs: 10_100,
  experiment: complete("recover-lag", 2),
  samples: [
    ...lagPivotal.samples,
    lagSample("lag-sample-1", 3, 9, 6, "falling"),
    lagSample("lag-sample-2", 3, 9, 0, "steady"),
  ],
  partitions: [lagPartition(0, 0), lagPartition(1, 0), lagPartition(2, 0)],
  consumerCount: 3,
  drainEstimateMs: 0,
});

const hotInitial = state({
  ...base("hot-partitions-key-skew"),
  phases: [],
});
const hotPivotal = state({
  ...hotInitial,
  revision: 1,
  experiment: complete("hot-key-burst", 1),
  phases: [hotPhase("phase-hot", "hot", [0, 8, 0, 0], 8)],
});
const hotContrast = state({
  ...hotPivotal,
  revision: 2,
  experiment: complete("balanced-comparison", 2),
  phases: [
    ...hotPivotal.phases,
    hotPhase("phase-balanced", "balanced", [2, 2, 2, 2], 1),
  ],
});

const compactionInitial = state({
  ...base("log-compaction-tombstones"),
  rawLog: [],
  materialized: [],
  cleanerPasses: [],
});
const compactionPivotal = state({
  ...compactionInitial,
  revision: 1,
  experiment: complete("run-compaction", 2),
  rawLog: [
    compactedRecord("raw-a1", "0", "A", "A1", "compaction"),
    compactedRecord("raw-b1", "1", "B", "B1", "compaction"),
    compactedRecord("raw-a2", "2", "A", "A2", null),
    compactedRecord("raw-b-delete", "3", "B", null, null),
  ],
  materialized: [
    materialized("state-a", "A", "A2", "2"),
    materialized("state-b", "B", null, "3"),
  ],
  cleanerPasses: [cleaner("cleaner-compaction", "compaction", ["0", "1"])],
});
const compactionContrast = state({
  ...compactionPivotal,
  revision: 2,
  experiment: complete("expire-tombstone", 1),
  rawLog: compactionPivotal.rawLog.map((entry) =>
    entry.id === "raw-b-delete"
      ? { ...entry, removedAtStage: "tombstone_cleanup" as const }
      : entry,
  ),
  materialized: [materialized("state-a", "A", "A2", "2")],
  cleanerPasses: [
    ...compactionPivotal.cleanerPasses,
    cleaner("cleaner-tombstone", "tombstone_cleanup", ["3"]),
  ],
});

const retentionInitial = state({
  ...base("retention-data-loss"),
  records: [],
  retentionMs: 60_000,
  cutoffVirtualMs: 0,
  logStartOffset: "0",
  committedOffset: "0",
  error: null,
});
const retentionPivotal = state({
  ...retentionInitial,
  revision: 1,
  virtualTimeMs: 61_200,
  experiment: complete("advance-retention", 3),
  records: [
    retainedRecord("retention-record-0", "0", 0, true),
    retainedRecord("retention-record-1", "1", 100, true),
    retainedRecord("retention-record-2", "2", 200, true),
    retainedRecord("retention-record-3", "3", 300, false),
    retainedRecord("retention-record-4", "4", 400, false),
  ],
  cutoffVirtualMs: 1_000,
  logStartOffset: "3",
  error: {
    code: "offset_out_of_range",
    requestedOffset: "0",
    recoveryOptions: ["earliest", "latest", "restore"],
    provenance: "simulated",
  },
});
const retentionContrast = state({
  ...retentionPivotal,
  revision: 2,
  virtualTimeMs: 61_300,
  experiment: complete("recover-retention", 1),
  committedOffset: "3",
  error: null,
});

const cooperativeInitial = state({
  ...base("cooperative-rebalancing"),
  comparisons: [],
});
const cooperativePivotal = state({
  ...cooperativeInitial,
  revision: 1,
  experiment: complete("compare-rebalance", 3),
  comparisons: [
    rebalance("rebalance-eager", "eager", [], [0, 1, 2], [0, 1, 2]),
    rebalance("rebalance-cooperative", "cooperative_sticky", [0, 2], [1], [1]),
  ],
});
const cooperativeContrast = state({
  ...cooperativePivotal,
  revision: 2,
  experiment: complete("cooperative-pressure", 1),
});

const streamsInitial = state({
  ...base("streams-joins-windows"),
  inputs: [],
  windows: [],
  joins: [],
  lateRecords: [],
});
const streamsPivotal = state({
  ...streamsInitial,
  revision: 1,
  experiment: complete("window-pair", 3),
  inputs: [
    streamInput("order-42", "orders", "42", 1_000, 1_000, "joined"),
    streamInput("payment-42", "payments", "42", 1_500, 1_600, "joined"),
    streamInput("order-99", "orders", "99", 2_000, 2_000, "unmatched"),
  ],
  windows: [streamWindow("window-0")],
  joins: [streamJoin("join-row-42", "join-42", "42", "order-42", "payment-42")],
});
const streamsContrast = state({
  ...streamsPivotal,
  revision: 2,
  experiment: complete("late-arrival", 2),
  inputs: [
    ...streamsPivotal.inputs,
    streamInput("payment-99", "payments", "99", 2_200, 7_500, "late"),
  ],
  lateRecords: ["payment-99"],
});

const outboxInitial = state({
  ...base("outbox-cdc"),
  dbTransactions: [],
  wal: [],
  connectorAttempts: [],
  publishes: [],
  dedupeLedger: [],
});
const outboxPivotal = state({
  ...outboxInitial,
  revision: 1,
  experiment: complete("cdc-batch", 4),
  dbTransactions: [dbTransaction()],
  wal: [wal()],
  connectorAttempts: [connectorAttempt("connector-row-1", 1, "published")],
  publishes: [publish("publish-row-1", "cdc-message-1", false)],
  dedupeLedger: [],
});
const outboxContrast = state({
  ...outboxPivotal,
  revision: 2,
  experiment: complete("retry-cdc", 2),
  connectorAttempts: [
    ...outboxPivotal.connectorAttempts,
    connectorAttempt("connector-row-2", 2, "retried"),
  ],
  publishes: [
    ...outboxPivotal.publishes,
    publish("publish-row-2", "cdc-message-1-retry", true),
  ],
  dedupeLedger: [ledger(1)],
});

const aclInitial = state({
  ...base("acl-least-privilege"),
  policies: [policy("policy-read", "read", "allow")],
  attempts: [],
  lastHighlightedCell: null,
});
const aclPivotal = state({
  ...aclInitial,
  revision: 1,
  experiment: complete("trigger-acl-denial", 2),
  attempts: [aclAttempt("acl-denied", "write", "denied", true, null)],
  lastHighlightedCell: {
    principal: "orders-service",
    operation: "write",
    resource: "orders",
  },
});
const aclContrast = state({
  ...aclPivotal,
  revision: 2,
  experiment: complete("grant-required-permission", 2),
  policies: [...aclPivotal.policies, policy("policy-write", "write", "allow")],
  attempts: [
    ...aclPivotal.attempts,
    aclAttempt("acl-allowed", "write", "allowed", false, "policy-write"),
  ],
});

export const teachingScenarioTestManifest = [
  testCase(
    "partitioning",
    "What changed in routing and commit progress?",
    partitioningInitial,
    partitioningPivotal,
    partitioningContrast,
    "routing",
    ["routing-trace-count", 0],
    ["routing-trace-count", 3],
    ["idle-consumers", 1],
  ),
  testCase(
    "fan-out-load-balancing",
    "Why is the fourth group member idle?",
    assignmentInitial,
    assignmentPivotal,
    assignmentContrast,
    "assignment",
    ["assignment-members", 0],
    ["assignment-members", 4],
    ["assignment-unkeyed-routes", 3],
  ),
  testCase(
    "at-least-once-duplicates",
    "Why did the same offset apply a side effect twice?",
    duplicateInitial,
    duplicatePivotal,
    duplicateContrast,
    "lifecycle",
    ["redelivery-count", 0],
    ["redelivery-count", 1],
    ["naive-side-effects", 2],
  ),
  testCase(
    "retry-dead-letter-queues",
    "Which single route is this failed record on now?",
    retryInitial,
    retryPivotal,
    retryContrast,
    "lifecycle",
    ["retry-records", 0],
    ["transient-recovered", 1],
    ["retry-dead-lettered", 1],
  ),
  testCase(
    "schema-evolution-karapace",
    "Why did one schema reach Kafka while another stopped?",
    schemaInitial,
    schemaPivotal,
    schemaContrast,
    "gate",
    ["schema-topic-records", 0],
    ["schema-topic-records", 1],
    ["schema-rejected", 1],
  ),
  testCase(
    "transactional-producers",
    "Which staged records are actually visible?",
    transactionInitial,
    transactionPivotal,
    transactionContrast,
    "transaction",
    ["transaction-visible", 0],
    ["transaction-visible", 2],
    ["transaction-deduplicated", 1],
  ),
  testCase(
    "event-replay-sourcing",
    "Did replay append facts or rebuild derived state?",
    replayInitial,
    replayPivotal,
    replayContrast,
    "projection",
    ["replay-produced-count", 0],
    ["replay-produced-count", 3],
    ["replay-produced-count", 3],
  ),
  testCase(
    "consumer-lag-backpressure",
    "Why is lag rising or falling?",
    lagInitial,
    lagPivotal,
    lagContrast,
    "capacity",
    ["lag-total", 0],
    ["lag-total", 18],
    ["lag-total", 0],
  ),
  testCase(
    "hot-partitions-key-skew",
    "How does the equal-size balanced phase differ?",
    hotInitial,
    hotPivotal,
    hotContrast,
    "heatmap",
    ["hot-phase-size", 0],
    ["hot-phase-size", 8],
    ["equal-phase-size", "Yes"],
  ),
  testCase(
    "log-compaction-tombstones",
    "When does a tombstone actually disappear?",
    compactionInitial,
    compactionPivotal,
    compactionContrast,
    "projection",
    ["compaction-raw-count", 0],
    ["compaction-removed", 2],
    ["compaction-cleaned-tombstones", 1],
  ),
  testCase(
    "retention-data-loss",
    "Why can a committed offset become unreadable?",
    retentionInitial,
    retentionPivotal,
    retentionContrast,
    "lifecycle",
    ["retention-expired", 0],
    ["retention-error", "offset_out_of_range"],
    ["retention-error", "Available"],
  ),
  testCase(
    "cooperative-rebalancing",
    "Which strategy keeps more partition ownership?",
    cooperativeInitial,
    cooperativePivotal,
    cooperativeContrast,
    "assignment",
    ["eager-kept", 0],
    ["eager-revoked", 3],
    ["cooperative-kept", 2],
  ),
  testCase(
    "streams-joins-windows",
    "Why did this pair join or miss its window?",
    streamsInitial,
    streamsPivotal,
    streamsContrast,
    "window-join",
    ["streams-valid-joins", 0],
    ["streams-valid-joins", 1],
    ["streams-late", 1],
  ),
  testCase(
    "outbox-cdc",
    "Where is the atomic outbox change now?",
    outboxInitial,
    outboxPivotal,
    outboxContrast,
    "pipeline",
    ["outbox-db-commits", 0],
    ["outbox-acknowledged", 1],
    ["outbox-suppressed", 1],
  ),
  testCase(
    "acl-least-privilege",
    "Which exact ACL cell stopped this operation?",
    aclInitial,
    aclPivotal,
    aclContrast,
    "gate",
    ["acl-denied", 0],
    ["acl-denied", 1],
    ["acl-allowed", 1],
  ),
] as const satisfies readonly TeachingScenarioTestCase[];

function testCase(
  scenarioId: ScenarioState["scenarioId"],
  noviceQuestion: string,
  initial: ScenarioState,
  pivotal: ScenarioState,
  contrast: ScenarioState,
  lensKind: TeachingScenarioTestCase["expectation"]["lensKind"],
  initialFact: readonly [string, string | number],
  pivotalFact: readonly [string, string | number],
  contrastFact: readonly [string, string | number],
): TeachingScenarioTestCase {
  return {
    scenarioId,
    noviceQuestion,
    initial,
    pivotal,
    contrast,
    expectation: { lensKind, initialFact, pivotalFact, contrastFact },
  };
}

function state<T extends ScenarioState>(value: T): T {
  return value;
}

function base<const Id extends ScenarioState["scenarioId"]>(scenarioId: Id) {
  return {
    version: 1 as const,
    scenarioId,
    virtualTimeMs: 0,
    revision: 0,
    experiment: idle(),
  };
}

function idle(): ScenarioExperimentStatus {
  return {
    status: "idle",
    experimentId: null,
    stepIndex: 0,
    totalSteps: 0,
    startedAtVirtualMs: null,
    completedAtVirtualMs: null,
    error: null,
  };
}

function complete(
  experimentId: string,
  totalSteps = 1,
): ScenarioExperimentStatus {
  return {
    status: "completed",
    experimentId,
    stepIndex: totalSteps,
    totalSteps,
    startedAtVirtualMs: 0,
    completedAtVirtualMs: totalSteps * 100,
    error: null,
  };
}

function position(
  partition: number,
  processedOffset: string | null,
  committedOffset: string | null,
) {
  return {
    ...simulated,
    id: `position-${partition}`,
    partition,
    processedOffset,
    committedOffset,
  };
}
function route(
  id: string,
  messageId: string,
  key: string,
  partition: number,
  offset: string,
  sequence: number,
) {
  return { ...simulated, id, messageId, key, partition, offset, sequence };
}
function consumer(
  consumerId: string,
  partitions: number[],
  status: "running" | "idle",
) {
  return {
    ...simulated,
    id: `state-${consumerId}`,
    consumerId,
    partitions,
    status,
    epoch: 1,
  };
}
function epoch(
  value: number,
  partitionSets: number[][],
  idleConsumerIds: string[],
) {
  const memberIds = partitionSets.map((_, index) => `consumer-${index + 1}`);
  return {
    ...simulated,
    id: `epoch-${value}`,
    epoch: value,
    memberIds,
    assignments: partitionSets.map((partitions, index) => ({
      consumerId: memberIds[index],
      partitions,
    })),
    idleConsumerIds,
  };
}
function delivery(id: string, attempt: number, committed: boolean) {
  return {
    ...simulated,
    id,
    messageId: "duplicate-message-42",
    partition: 0,
    offset: "7",
    attempt,
    consumerId: `consumer-${attempt}`,
    sideEffectApplied: true,
    committed,
  };
}
function sideEffect(
  idempotencyKey: string,
  naiveCount: number,
  idempotentCount: number,
) {
  return {
    ...simulated,
    id: `effect-${idempotencyKey}`,
    idempotencyKey,
    naiveCount,
    idempotentCount,
  };
}
function retryRecord(
  id: string,
  kind: "transient" | "poison",
  status: "succeeded" | "dlq",
  attempt: number,
) {
  return {
    ...simulated,
    id,
    messageId: id,
    kind,
    status,
    attempt,
    maxAttempts: 3,
    backoffUntilVirtualMs: null,
    error: status === "dlq" ? "poison" : null,
    route: [
      { stage: "main" as const, atVirtualMs: 0 },
      { stage: status, atVirtualMs: 1_000 },
    ],
  };
}
function schemaAttempt(id: string, version: number, compatible: boolean) {
  return {
    ...simulated,
    id,
    version,
    compatible,
    fieldDiff: [
      {
        field: compatible ? "displayName" : "email",
        before: compatible ? null : "string",
        after: compatible ? "string?" : "object",
        compatibility: compatible
          ? ("compatible" as const)
          : ("incompatible" as const),
      },
    ],
    gate: compatible ? ("accepted" as const) : ("rejected" as const),
    reachedTopic: compatible,
  };
}
function transaction(
  id: string,
  status: "committed" | "aborted",
  recordIds: string[],
  visible: boolean,
) {
  return {
    ...simulated,
    id,
    transactionId: id,
    status,
    records: recordIds.map((recordId, producerSequence) => ({
      recordId,
      producerSequence,
      staged: true,
      visible,
    })),
    visibleRecordIds: visible ? recordIds : [],
    offsetsCommitted: visible,
    dedupe: recordIds.map((_, producerSequence) => ({
      producerSequence,
      accepted: true,
    })),
  };
}
function replayEvent(offset: number, delta: number) {
  return {
    ...simulated,
    id: `event-${offset}`,
    offset: String(offset),
    aggregateId: "cart-1",
    eventName: delta > 0 ? "ItemAdded" : "ItemRemoved",
    delta,
  };
}
function lagPartition(partition: number, lag: number) {
  return {
    ...simulated,
    id: `lag-partition-${partition}`,
    partition,
    endOffset: String(lag + 10),
    committedOffset: "10",
    lag,
  };
}
function lagSample(
  id: string,
  productionRate: number,
  processingRate: number,
  lag: number,
  trend: "rising" | "falling" | "steady",
) {
  return {
    ...simulated,
    id,
    atVirtualMs:
      id === "lag-sample-0" ? 5_000 : id === "lag-sample-1" ? 5_100 : 10_100,
    productionRate,
    processingRate,
    lag,
    trend,
  };
}
function hotPhase(
  id: string,
  kind: "hot" | "balanced",
  partitionCounts: number[],
  skewRatio: number,
) {
  const total = partitionCounts.reduce((sum, count) => sum + count, 0);
  return {
    ...simulated,
    id,
    kind,
    total,
    partitionCounts,
    percentages: partitionCounts.map((count) =>
      total === 0 ? 0 : (count / total) * 100,
    ),
    skewRatio,
    routes: partitionCounts.flatMap((count, partition) =>
      Array.from({ length: count }, (_, index) => ({
        messageId: `${id}-${partition}-${index}`,
        key: kind === "hot" ? "celebrity-user" : null,
        partition,
      })),
    ),
  };
}
function compactedRecord(
  id: string,
  offset: string,
  key: string,
  value: string | null,
  removedAtStage: "compaction" | "tombstone_cleanup" | null,
) {
  return {
    ...simulated,
    id,
    offset,
    key,
    value,
    tombstone: value == null,
    removedAtStage,
  };
}
function materialized(
  id: string,
  key: string,
  value: string | null,
  sourceOffset: string,
) {
  return { ...simulated, id, key, value, sourceOffset };
}
function cleaner(
  id: string,
  stage: "compaction" | "tombstone_cleanup",
  removedOffsets: string[],
) {
  return {
    ...simulated,
    id,
    stage,
    removedOffsets,
    atVirtualMs: stage === "compaction" ? 1_000 : 70_000,
  };
}
function retainedRecord(
  id: string,
  offset: string,
  createdAtVirtualMs: number,
  expired: boolean,
) {
  return { ...simulated, id, offset, createdAtVirtualMs, expired };
}
function rebalance(
  id: string,
  strategy: "eager" | "cooperative_sticky",
  keptPartitions: number[],
  revokedPartitions: number[],
  pausedPartitions: number[],
) {
  return {
    ...simulated,
    id,
    strategy,
    before: [{ consumerId: "consumer-1", partitions: [0, 1, 2] }],
    after: [
      { consumerId: "consumer-1", partitions: [0, 2] },
      { consumerId: "consumer-2", partitions: [1] },
    ],
    keptPartitions,
    movedPartitions: [
      {
        partition: 1,
        fromConsumerId: "consumer-1",
        toConsumerId: "consumer-2",
      },
    ],
    revokedPartitions,
    pausedPartitions,
  };
}
function streamInput(
  recordId: string,
  stream: "orders" | "payments",
  key: string,
  eventTimeMs: number,
  arrivalTimeMs: number,
  status: "joined" | "late" | "unmatched",
) {
  return {
    ...simulated,
    id: `stream-input-${recordId}`,
    recordId,
    stream,
    key,
    eventTimeMs,
    arrivalTimeMs,
    windowId: "window-0",
    status,
  };
}
function streamWindow(windowId: string) {
  return {
    ...simulated,
    id: "window-state-0",
    windowId,
    startMs: 0,
    endMs: 5_000,
    graceEndMs: 7_000,
    closed: true,
  };
}
function streamJoin(
  id: string,
  joinId: string,
  key: string,
  orderRecordId: string,
  paymentRecordId: string,
) {
  return {
    ...simulated,
    id,
    joinId,
    key,
    orderRecordId,
    paymentRecordId,
    windowId: "window-0",
  };
}
function dbTransaction() {
  return {
    ...simulated,
    id: "db-transaction-row-1",
    transactionId: "db-txn-1",
    businessRowId: "business-order-1",
    outboxRowId: "outbox-order-1",
    committed: true,
  };
}
function wal() {
  return {
    ...simulated,
    id: "wal-row-100",
    lsn: "0/100",
    transactionId: "db-txn-1",
    outboxRowId: "outbox-order-1",
  };
}
function connectorAttempt(
  id: string,
  attempt: number,
  status: "published" | "retried",
) {
  return {
    ...simulated,
    id,
    attemptId: attempt === 1 ? "cdc-attempt-1" : "cdc-attempt-2",
    outboxRowId: "outbox-order-1",
    lsn: "0/100",
    attempt,
    status,
  };
}
function publish(id: string, messageId: string, deduplicated: boolean) {
  return {
    ...simulated,
    id,
    messageId,
    outboxRowId: "outbox-order-1",
    lsn: "0/100",
    acknowledged: !deduplicated,
    deduplicated,
  };
}
function ledger(suppressedAttempts: number) {
  return {
    ...simulated,
    id: "dedupe-outbox-order-1",
    outboxRowId: "outbox-order-1",
    acceptedMessageId: "cdc-message-1",
    suppressedAttempts,
  };
}
function policy(
  id: string,
  operation: "read" | "write",
  effect: "allow" | "deny",
) {
  return {
    ...simulated,
    id,
    principal: "orders-service",
    operation,
    resource: "orders",
    effect,
  };
}
function aclAttempt(
  id: string,
  operation: "read" | "write",
  decision: "allowed" | "denied",
  terminatedBeforeKafka: boolean,
  matchedPolicyId: string | null,
) {
  return {
    ...simulated,
    id,
    principal: "orders-service",
    operation,
    resource: "orders",
    matchedPolicyId,
    decision,
    terminatedBeforeKafka,
  };
}
