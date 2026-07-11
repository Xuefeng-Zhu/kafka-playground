import type { TeachingScenarioTestCase } from "./helpers";
import { base, complete, simulated, state, testCase } from "./helpers";

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

export const pipelineAccessTestCases = [
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
