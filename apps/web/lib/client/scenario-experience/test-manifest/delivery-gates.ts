import type { TeachingScenarioTestCase } from "./helpers";
import { base, completedState, simulated, state, testCase } from "./helpers";

const duplicateInitial = state({
  ...base("at-least-once-duplicates"),
  deliveries: [],
  sideEffects: [],
});
const duplicatePrimary = completedState(
  duplicateInitial,
  "crash-and-redeliver",
  3,
  {
    deliveries: [
      delivery("delivery-1", 1, false),
      delivery("delivery-2", 2, true),
    ],
    sideEffects: [sideEffect("payment-42", 2, 1)],
  },
  3,
);
const duplicateContrast = completedState(
  duplicatePrimary,
  "duplicate-risk-records",
  4,
);

const retryInitial = state({
  ...base("retry-dead-letter-queues"),
  records: [],
});
const retryPrimary = completedState(
  retryInitial,
  "transient-recovery",
  1,
  {
    virtualTimeMs: 1_100,
    records: [retryRecord("retry-transient", "transient", "succeeded", 2)],
  },
  3,
);
const retryContrast = completedState(
  retryPrimary,
  "poison-to-dlq",
  2,
  {
    virtualTimeMs: 4_200,
    records: [
      ...retryPrimary.records,
      retryRecord("retry-poison", "poison", "dlq", 3),
    ],
  },
  3,
);

const schemaInitial = state({
  ...base("schema-evolution-karapace"),
  activeVersion: 1,
  topicRecordCount: 0,
  attempts: [],
});
const schemaPrimary = completedState(
  schemaInitial,
  "compatible-schema",
  1,
  {
    activeVersion: 1,
    topicRecordCount: 1,
    attempts: [schemaAttempt("schema-attempt-v2", 2, true)],
  },
  2,
);
const schemaContrast = completedState(
  schemaPrimary,
  "trigger-schema-rejection",
  2,
  {
    attempts: [
      ...schemaPrimary.attempts,
      schemaAttempt("schema-attempt-v3", 3, false),
    ],
  },
  2,
);

const transactionInitial = state({
  ...base("transactional-producers"),
  transactions: [],
});
const transactionPrimary = completedState(
  transactionInitial,
  "transaction-pair",
  1,
  {
    transactions: [
      transaction("txn-1", "committed", ["txn-1-r1", "txn-1-r2"], true),
    ],
  },
  2,
);
const transactionContrast = completedState(
  transactionPrimary,
  "abort-and-dedupe",
  2,
  {
    transactions: [
      ...transactionPrimary.transactions,
      transaction("txn-2", "aborted", ["txn-2-r1"], false),
      {
        ...transaction("txn-3", "committed", ["txn-3-r1"], true),
        dedupe: [
          { producerSequence: 3, accepted: true },
          { producerSequence: 3, accepted: false },
        ],
      },
    ],
  },
  2,
);

export const deliveryGateTestCases = [
  testCase(
    "at-least-once-duplicates",
    "Why did the same offset apply a side effect twice?",
    duplicateInitial,
    duplicatePrimary,
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
    retryPrimary,
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
    schemaPrimary,
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
    transactionPrimary,
    transactionContrast,
    "transaction",
    ["transaction-visible", 0],
    ["transaction-visible", 2],
    ["transaction-deduplicated", 1],
  ),
] as const satisfies readonly TeachingScenarioTestCase[];

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
