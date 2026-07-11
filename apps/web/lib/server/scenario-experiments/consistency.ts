import "server-only";
import { complete, step, upsertById, upsertReducer } from "./shared";
import type { ScenarioExperimentHandler } from "./types";

export const buildSchemaEvolutionExperiment: ScenarioExperimentHandler<
  "schema-evolution-karapace"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const compatible = experimentId === "compatible-schema";
  const transitions = compatible
    ? [
        step(
          "v2-diff",
          "Compare schema v2",
          "schema.diffed",
          ["schema-attempt-v2", "schema-v2"],
          100,
        ),
        step(
          "v2-accept",
          "Accept compatible v2",
          "schema.accepted",
          ["schema-attempt-v2", "schema-v2"],
          100,
        ),
      ]
    : [
        step(
          "v3-diff",
          "Compare schema v3",
          "schema.diffed",
          ["schema-attempt-v3", "schema-v3"],
          100,
        ),
        step(
          "v3-reject",
          "Reject incompatible v3",
          "schema.rejected",
          ["schema-attempt-v3", "schema-v3"],
          100,
        ),
      ];
  const attempt = compatible
    ? {
        id: "schema-attempt-v2",
        provenance: simulated,
        version: 2,
        compatible: true,
        fieldDiff: [
          {
            field: "displayName",
            before: null,
            after: "string?",
            compatibility: "compatible" as const,
          },
        ],
        gate: "accepted" as const,
        reachedTopic: true,
      }
    : {
        id: "schema-attempt-v3",
        provenance: simulated,
        version: 3,
        compatible: false,
        fieldDiff: [
          {
            field: "email",
            before: "string",
            after: "object",
            compatibility: "incompatible" as const,
          },
        ],
        gate: "rejected" as const,
        reachedTopic: false,
      };
  const nextState = complete(
    {
      ...state,
      activeVersion: compatible ? 2 : state.activeVersion,
      topicRecordCount: state.topicRecordCount + (compatible ? 1 : 0),
      attempts: upsertById(state.attempts, attempt),
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildTransactionalProducerExperiment: ScenarioExperimentHandler<
  "transactional-producers"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const contrast = experimentId === "abort-and-dedupe";
  const transitions = contrast
    ? [
        step(
          "abort",
          "Abort second transaction",
          "transaction.aborted",
          ["transaction-row-txn-2", "txn-2", "txn-2-record-1"],
          100,
        ),
        step(
          "dedupe",
          "Suppress duplicate sequence",
          "producer.deduplicated",
          ["transaction-row-txn-3", "txn-3", "txn-3-record-1"],
          100,
        ),
      ]
    : [
        step(
          "stage",
          "Stage transaction records",
          "transaction.staged",
          ["transaction-row-txn-1", "txn-1-record-1", "txn-1-record-2"],
          100,
        ),
        step(
          "commit",
          "Commit atomically",
          "transaction.committed",
          ["transaction-row-txn-1", "txn-1"],
          100,
        ),
      ];
  const committed = transaction(
    "txn-1",
    "committed",
    [0, 1],
    [true, true],
    true,
  );
  const contrasted = [
    transaction("txn-2", "aborted", [2], [false], false),
    {
      ...transaction("txn-3", "committed", [3], [true], true),
      dedupe: [
        { producerSequence: 3, accepted: true },
        { producerSequence: 3, accepted: false },
      ],
    },
  ];
  const nextState = complete(
    {
      ...state,
      transactions: contrast
        ? contrasted.reduce(upsertReducer, state.transactions)
        : upsertById(state.transactions, committed),
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildAclExperiment: ScenarioExperimentHandler<
  "acl-least-privilege"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const grant = experimentId === "grant-required-permission";
  const transitions = grant
    ? [
        step(
          "grant",
          "Grant only write",
          "acl.granted",
          ["policy-orders-write"],
          100,
        ),
        step(
          "retry",
          "Retry allowed operation",
          "acl.allowed",
          ["acl-attempt-2"],
          100,
        ),
      ]
    : [
        step(
          "evaluate",
          "Evaluate write permission",
          "acl.evaluated",
          ["acl-attempt-1", "acl-cell-write"],
          100,
        ),
        step(
          "deny",
          "Terminate denied path",
          "acl.denied",
          ["acl-attempt-1"],
          100,
        ),
      ];
  const writePolicy = {
    id: "policy-orders-write",
    provenance: simulated,
    principal: "orders-service",
    operation: "write" as const,
    resource: "orders",
    effect: "allow" as const,
  };
  const deniedAttempt = {
    id: "acl-attempt-1",
    provenance: simulated,
    principal: "orders-service",
    operation: "write" as const,
    resource: "orders",
    matchedPolicyId: null,
    decision: "denied" as const,
    terminatedBeforeKafka: true,
  };
  const allowedAttempt = {
    id: "acl-attempt-2",
    provenance: simulated,
    principal: "orders-service",
    operation: "write" as const,
    resource: "orders",
    matchedPolicyId: "policy-orders-write",
    decision: "allowed" as const,
    terminatedBeforeKafka: false,
  };
  const nextState = complete(
    {
      ...state,
      policies: grant
        ? upsertById(state.policies, writePolicy)
        : state.policies,
      attempts: upsertById(
        state.attempts,
        grant ? allowedAttempt : deniedAttempt,
      ),
      lastHighlightedCell: {
        principal: "orders-service",
        operation: "write",
        resource: "orders",
      },
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

function transaction(
  transactionId: string,
  status: "committed" | "aborted",
  sequences: number[],
  visibility: boolean[],
  offsetsCommitted: boolean,
) {
  const records = sequences.map((producerSequence, index) => ({
    recordId: `${transactionId}-record-${index + 1}`,
    producerSequence,
    staged: true,
    visible: visibility[index] ?? false,
  }));
  return {
    id: `transaction-row-${transactionId}`,
    provenance: "simulated" as const,
    transactionId,
    status,
    records,
    visibleRecordIds: records
      .filter((record) => record.visible)
      .map((record) => record.recordId),
    offsetsCommitted,
    dedupe: sequences.map((producerSequence) => ({
      producerSequence,
      accepted: true,
    })),
  };
}
