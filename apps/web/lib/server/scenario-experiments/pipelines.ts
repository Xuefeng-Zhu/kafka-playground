import "server-only";
import { complete, step, upsertById, upsertReducer } from "./shared";
import type { ScenarioExperimentHandler } from "./types";

export const buildStreamsJoinExperiment: ScenarioExperimentHandler<
  "streams-joins-windows"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const late = experimentId === "late-arrival";
  const transitions = late
    ? [
        step(
          "late",
          "Reject after-grace arrival",
          "window.record_late",
          ["stream-input-payment-99", "payment-99", "window-state-0"],
          6_000,
        ),
      ]
    : [
        step(
          "order",
          "Buffer matching order",
          "window.record_buffered",
          ["stream-input-order-42", "order-42", "window-state-0"],
          100,
        ),
        step(
          "payment",
          "Join matching payment",
          "window.join_emitted",
          [
            "stream-input-payment-42",
            "join-row-42",
            "join-42",
            "window-state-0",
          ],
          100,
        ),
        step(
          "unmatched",
          "Buffer unmatched key",
          "window.record_unmatched",
          ["stream-input-order-99", "order-99", "window-state-0"],
          100,
        ),
      ];
  const baseInputs = [
    streamInput("order-42", "orders", "42", 1_000, 1_000, "window-0", "joined"),
    streamInput(
      "payment-42",
      "payments",
      "42",
      1_500,
      1_600,
      "window-0",
      "joined",
    ),
    streamInput(
      "order-99",
      "orders",
      "99",
      2_000,
      2_000,
      "window-0",
      "unmatched",
    ),
  ];
  const lateInput = streamInput(
    "payment-99",
    "payments",
    "99",
    2_200,
    7_500,
    "window-0",
    "late",
  );
  const nextState = complete(
    {
      ...state,
      inputs: late
        ? upsertById(state.inputs, lateInput)
        : baseInputs.reduce(upsertReducer, state.inputs),
      windows: [
        {
          id: "window-state-0",
          provenance: simulated,
          windowId: "window-0",
          startMs: 0,
          endMs: 5_000,
          graceEndMs: 7_000,
          closed: late,
        },
      ],
      joins: late
        ? state.joins
        : [
            {
              id: "join-row-42",
              provenance: simulated,
              joinId: "join-42",
              key: "42",
              orderRecordId: "order-42",
              paymentRecordId: "payment-42",
              windowId: "window-0",
            },
          ],
      lateRecords: late ? ["payment-99"] : state.lateRecords,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildOutboxCdcExperiment: ScenarioExperimentHandler<
  "outbox-cdc"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const retry = experimentId === "retry-cdc";
  const transitions = retry
    ? [
        step(
          "retry",
          "Retry connector delivery",
          "cdc.retry_deduplicated",
          [
            "connector-row-2",
            "cdc-attempt-2",
            "publish-row-1",
            "dedupe-outbox-order-1",
          ],
          100,
        ),
      ]
    : [
        step(
          "db",
          "Commit business and outbox rows",
          "database.transaction_committed",
          [
            "db-transaction-row-1",
            "db-txn-1",
            "business-order-1",
            "outbox-order-1",
          ],
          100,
        ),
        step(
          "wal",
          "Read WAL position",
          "wal.recorded",
          ["wal-row-100", "wal-100", "connector-row-1"],
          100,
        ),
        step(
          "publish",
          "Publish and acknowledge",
          "kafka.publish_acknowledged",
          ["publish-row-1", "cdc-message-1", "connector-row-1"],
          100,
        ),
      ];
  const firstAttempt = {
    id: "connector-row-1",
    provenance: simulated,
    attemptId: "cdc-attempt-1",
    outboxRowId: "outbox-order-1",
    lsn: "0/100",
    attempt: 1,
    status: "published" as const,
  };
  const retryAttempt = {
    id: "connector-row-2",
    provenance: simulated,
    attemptId: "cdc-attempt-2",
    outboxRowId: "outbox-order-1",
    lsn: "0/100",
    attempt: 2,
    status: "retried" as const,
  };
  const firstPublish = {
    id: "publish-row-1",
    provenance: simulated,
    messageId: "cdc-message-1",
    outboxRowId: "outbox-order-1",
    lsn: "0/100",
    acknowledged: true,
    deduplicated: false,
  };
  const nextState = complete(
    {
      ...state,
      dbTransactions: retry
        ? state.dbTransactions
        : [
            {
              id: "db-transaction-row-1",
              provenance: simulated,
              transactionId: "db-txn-1",
              businessRowId: "business-order-1",
              outboxRowId: "outbox-order-1",
              committed: true,
            },
          ],
      wal: retry
        ? state.wal
        : [
            {
              id: "wal-row-100",
              provenance: simulated,
              lsn: "0/100",
              transactionId: "db-txn-1",
              outboxRowId: "outbox-order-1",
            },
          ],
      connectorAttempts: upsertById(
        state.connectorAttempts,
        retry ? retryAttempt : firstAttempt,
      ),
      publishes: retry
        ? state.publishes
        : upsertById(state.publishes, firstPublish),
      dedupeLedger: retry
        ? [
            {
              id: "dedupe-outbox-order-1",
              provenance: simulated,
              outboxRowId: "outbox-order-1",
              acceptedMessageId: "cdc-message-1",
              suppressedAttempts: 1,
            },
          ]
        : state.dedupeLedger,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

function streamInput(
  recordId: string,
  stream: "orders" | "payments",
  key: string,
  eventTimeMs: number,
  arrivalTimeMs: number,
  windowId: string,
  status: "buffered" | "joined" | "unmatched" | "late",
) {
  return {
    id: `stream-input-${recordId}`,
    provenance: "simulated" as const,
    recordId,
    stream,
    key,
    eventTimeMs,
    arrivalTimeMs,
    windowId,
    status,
  };
}
