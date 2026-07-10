import {
  experienceDefinition,
  experimentEvidence,
} from "../definition-helpers";
import { buildScenarioGraph, graphCountMetric } from "../graphs";
import {
  createFrame,
  entityFocus,
  evidence,
  fact,
  narrative,
  recordFocus,
  row,
  table,
} from "../helpers";
import type {
  PipelineStageModel,
  ScenarioStateFor,
  WindowJoinRecordModel,
} from "../model";

export const streamsExperience = experienceDefinition(
  "streams-joins-windows",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const validJoins = scenarioState.joins.filter((join) =>
      isValidJoin(scenarioState, join),
    );
    const lateCount = scenarioState.lateRecords.length;
    const unmatchedCount = scenarioState.inputs.filter(
      (record) => record.status === "unmatched",
    ).length;
    const facts = [
      fact(
        "streams-input-count",
        "Input records",
        evidence(scenarioState.inputs.length, "simulated", "run-total"),
      ),
      fact(
        "streams-valid-joins",
        "Valid joined outputs",
        evidence(validJoins.length, "simulated", "run-total"),
        {
          emphasis: validJoins.length > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "streams-unmatched",
        "Unmatched keys",
        evidence(unmatchedCount, "simulated", "run-total"),
      ),
      fact(
        "streams-late",
        "After grace",
        evidence(lateCount, "simulated", "run-total"),
        {
          emphasis: lateCount > 0 ? "warning" : "neutral",
        },
      ),
    ];
    const inputTable = table(
      "streams-window-inputs",
      "Windowed join inputs",
      [
        { key: "record", label: "Record" },
        { key: "stream", label: "Stream" },
        { key: "key", label: "Key" },
        { key: "eventTime", label: "Event time" },
        { key: "arrival", label: "Arrival" },
        { key: "window", label: "Window" },
        { key: "status", label: "Status" },
      ],
      scenarioState.inputs.map((record) =>
        row(
          record.id,
          {
            record: evidence(record.recordId, record.provenance, "run-total"),
            stream: evidence(record.stream, record.provenance, "run-total"),
            key: evidence(record.key, record.provenance, "run-total"),
            eventTime: evidence(
              `${record.eventTimeMs} ms`,
              record.provenance,
              "run-total",
            ),
            arrival: evidence(
              `${record.arrivalTimeMs} ms`,
              record.provenance,
              "run-total",
            ),
            window: evidence(record.windowId, record.provenance, "current"),
            status: evidence(record.status, record.provenance, "current"),
          },
          recordFocus(
            snapshot,
            record.recordId,
            undefined,
            undefined,
            record.stream === "orders" ? "orders-stream" : "payments-stream",
          ),
          record.status === "late"
            ? "danger"
            : record.status === "joined"
              ? "positive"
              : record.status === "unmatched"
                ? "warning"
                : "neutral",
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const outputTable = table(
      "streams-join-outputs",
      "Validated joined outputs",
      [
        { key: "join", label: "Join" },
        { key: "key", label: "Matching key" },
        { key: "order", label: "Order" },
        { key: "payment", label: "Payment" },
        { key: "window", label: "Window" },
      ],
      validJoins.map((join) =>
        row(
          join.id,
          {
            join: evidence(join.joinId, join.provenance, "run-total"),
            key: evidence(join.key, join.provenance, "run-total"),
            order: evidence(join.orderRecordId, join.provenance, "run-total"),
            payment: evidence(
              join.paymentRecordId,
              join.provenance,
              "run-total",
            ),
            window: evidence(join.windowId, join.provenance, "run-total"),
          },
          entityFocus(join.id, "window-state-store"),
          "positive",
        ),
      ),
      "No equal-key records have joined inside a valid window yet.",
    );
    const windowTable = table(
      "streams-window-boundaries",
      "Event-time window and grace boundaries",
      [
        { key: "window", label: "Window" },
        { key: "start", label: "Start" },
        { key: "end", label: "End" },
        { key: "grace", label: "Grace ends" },
        { key: "status", label: "Status" },
      ],
      scenarioState.windows.map((window) =>
        row(
          window.id,
          {
            window: evidence(window.windowId, window.provenance, "run-total"),
            start: evidence(
              `${window.startMs} ms`,
              window.provenance,
              "run-total",
            ),
            end: evidence(`${window.endMs} ms`, window.provenance, "run-total"),
            grace: evidence(
              `${window.graceEndMs} ms`,
              window.provenance,
              "run-total",
            ),
            status: evidence(
              window.closed ? "Closed" : "Open",
              window.provenance,
              "current",
            ),
          },
          entityFocus(window.id, "window-state-store"),
        ),
      ),
      "A window appears with the first keyed input.",
    );
    const graph = buildScenarioGraph("streams-joins-windows", snapshot, {
      active: scenarioState.inputs.length > 0,
      inactiveEdgeIds:
        validJoins.length === 0
          ? new Set(["window-topic", "topic-group"])
          : undefined,
      metrics: {
        "orders-stream": graphCountMetric(
          scenarioState.inputs.filter((record) => record.stream === "orders")
            .length,
          "simulated",
          "run-total",
        ),
        "payments-stream": graphCountMetric(
          scenarioState.inputs.filter((record) => record.stream === "payments")
            .length,
          "simulated",
          "run-total",
        ),
        "window-state-store": graphCountMetric(
          validJoins.length,
          "simulated",
          "run-total",
        ),
      },
    });
    const latestInput = scenarioState.inputs.at(-1);
    const frameNarrative = latestInput
      ? narrative(
          `${latestInput.recordId} is ${latestInput.status} for key ${latestInput.key} in ${latestInput.windowId}.`,
          latestInput.status === "joined"
            ? "A record from the other stream has the same key, window, and a valid arrival before grace closed."
            : latestInput.status === "late"
              ? "Its arrival crossed the grace boundary, so it cannot create joined output."
              : "No eligible record on the other stream matches both key and window yet.",
          latestInput.status === "buffered"
            ? "Produce the matching other-side record before grace closes."
            : "Compare the joined output count with unmatched and late inputs.",
          latestInput.provenance,
        )
      : narrative(
          "No windowed input has been recorded yet.",
          "Joined output requires equal keys and a valid event-time window.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const records: WindowJoinRecordModel[] = scenarioState.inputs.map(
      (record) => ({
        id: record.id,
        key: record.key,
        side: record.stream === "orders" ? "left" : "right",
        eventTimeMs: record.eventTimeMs,
        windowId: record.windowId,
        outcome: record.status === "buffered" ? "waiting" : record.status,
        provenance: record.provenance,
        focus: recordFocus(
          snapshot,
          record.recordId,
          undefined,
          undefined,
          record.stream === "orders" ? "orders-stream" : "payments-stream",
        ),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "window-join",
        title: "Key and window join evidence",
        summary: "Only validated equal-key, in-window pairs appear as outputs.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: inputTable,
        sections: [
          {
            id: "window-boundaries",
            title: "Window boundaries",
            facts: [facts[3]],
            table: windowTable,
          },
        ],
        records,
        outputs: outputTable,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "streams-before-output",
            "Joined outputs before",
            evidence(0, "simulated", "run-total"),
          ),
        ],
        latestInput ? [facts[1], facts[2], facts[3]] : [],
      ),
    );
  },
);

export const outboxExperience = experienceDefinition(
  "outbox-cdc",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const committed = scenarioState.dbTransactions.filter(
      (transaction) => transaction.committed,
    );
    const acknowledged = scenarioState.publishes.filter(
      (publish) => publish.acknowledged && !publish.deduplicated,
    );
    const suppressed = scenarioState.dedupeLedger.reduce(
      (total, entry) => total + entry.suppressedAttempts,
      0,
    );
    const latestPublish = scenarioState.publishes.at(-1);
    const facts = [
      fact(
        "outbox-db-commits",
        "Atomic DB commits",
        evidence(committed.length, "simulated", "run-total"),
      ),
      fact(
        "outbox-wal-records",
        "WAL records",
        evidence(scenarioState.wal.length, "simulated", "run-total"),
      ),
      fact(
        "outbox-acknowledged",
        "Acknowledged publishes",
        evidence(acknowledged.length, "simulated", "run-total"),
        {
          emphasis: acknowledged.length > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "outbox-suppressed",
        "Suppressed retry attempts",
        evidence(suppressed, "simulated", "run-total"),
        {
          emphasis: suppressed > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "outbox-latest-acknowledgement",
        "Latest retry acknowledgement",
        evidence(
          latestPublish?.deduplicated
            ? "Not emitted"
            : latestPublish?.acknowledged
              ? "Acknowledged"
              : "Pending",
          latestPublish?.provenance ?? "simulated",
          "current",
        ),
        {
          emphasis: latestPublish?.deduplicated ? "positive" : "neutral",
        },
      ),
    ];
    const traceTable = table(
      "outbox-cdc-trace",
      "Stable transaction, outbox, LSN, and publish identities",
      [
        { key: "transaction", label: "DB transaction" },
        { key: "business", label: "Business row" },
        { key: "outbox", label: "Outbox row" },
        { key: "lsn", label: "WAL LSN" },
        { key: "publish", label: "Kafka message" },
        { key: "status", label: "Publish status" },
      ],
      scenarioState.dbTransactions.map((transaction) => {
        const wal = scenarioState.wal.find(
          (entry) => entry.outboxRowId === transaction.outboxRowId,
        );
        const publish = latestPublishForOutbox(
          scenarioState.publishes,
          transaction.outboxRowId,
        );
        return row(
          transaction.id,
          {
            transaction: evidence(
              transaction.transactionId,
              transaction.provenance,
              "run-total",
            ),
            business: evidence(
              transaction.businessRowId,
              transaction.provenance,
              "run-total",
            ),
            outbox: evidence(
              transaction.outboxRowId,
              transaction.provenance,
              "run-total",
            ),
            lsn: evidence(
              wal?.lsn ?? "Pending",
              wal?.provenance ?? "simulated",
              "current",
            ),
            publish: evidence(
              publish?.messageId ?? "Pending",
              publish?.provenance ?? "simulated",
              "current",
            ),
            status: evidence(
              publish == null
                ? "Not published"
                : publish.deduplicated
                  ? "Deduplicated before acknowledgement"
                  : publish.acknowledged
                    ? "Acknowledged"
                    : "Awaiting acknowledgement",
              publish?.provenance ?? "simulated",
              "current",
            ),
          },
          entityFocus(transaction.id, "database-outbox"),
          publish?.deduplicated
            ? "warning"
            : publish?.acknowledged
              ? "positive"
              : "neutral",
        );
      }),
      definition.lesson.emptyCopy,
    );
    const attemptTable = table(
      "outbox-connector-attempts",
      "CDC connector attempts",
      [
        { key: "attempt", label: "Attempt ID" },
        { key: "outbox", label: "Outbox row" },
        { key: "lsn", label: "LSN" },
        { key: "number", label: "Try", align: "end" },
        { key: "status", label: "Status" },
      ],
      scenarioState.connectorAttempts.map((attempt) =>
        row(
          attempt.id,
          {
            attempt: evidence(
              attempt.attemptId,
              attempt.provenance,
              "run-total",
            ),
            outbox: evidence(
              attempt.outboxRowId,
              attempt.provenance,
              "run-total",
            ),
            lsn: evidence(attempt.lsn, attempt.provenance, "run-total"),
            number: evidence(attempt.attempt, attempt.provenance, "run-total"),
            status: evidence(attempt.status, attempt.provenance, "current"),
          },
          entityFocus(attempt.id, "cdc-connector"),
          attempt.status === "retried" ? "warning" : "neutral",
        ),
      ),
      "Connector attempts appear after a committed outbox row reaches the WAL.",
    );
    const stages: PipelineStageModel[] = [
      {
        id: "database-outbox",
        title: "Atomic DB commit",
        status: committed.length > 0 ? "complete" : "waiting",
        provenance: "simulated",
        focus: { kind: "entity", id: "database-outbox" },
      },
      {
        id: "transaction-log",
        title: "WAL / LSN",
        status: scenarioState.wal.length > 0 ? "complete" : "waiting",
        provenance: "simulated",
        focus: { kind: "entity", id: "transaction-log" },
      },
      {
        id: "cdc-connector",
        title: "CDC publish",
        status:
          suppressed > 0
            ? "deduplicated"
            : acknowledged.length > 0
              ? "complete"
              : scenarioState.connectorAttempts.length > 0
                ? "active"
                : "waiting",
        provenance: "simulated",
        focus: { kind: "entity", id: "cdc-connector" },
      },
      {
        id: "topic",
        title: "Kafka acknowledgement",
        status: acknowledged.length > 0 ? "complete" : "waiting",
        provenance: "simulated",
        focus: { kind: "entity", id: "topic" },
      },
    ];
    const graph = buildScenarioGraph("outbox-cdc", snapshot, {
      active: scenarioState.dbTransactions.length > 0,
      metrics: {
        "database-outbox": graphCountMetric(
          committed.length,
          "simulated",
          "run-total",
        ),
        "transaction-log": graphCountMetric(
          scenarioState.wal.length,
          "simulated",
          "run-total",
        ),
        "cdc-connector": graphCountMetric(
          scenarioState.connectorAttempts.length,
          "simulated",
          "run-total",
        ),
        topic: graphCountMetric(acknowledged.length, "simulated", "run-total"),
      },
    });
    const frameNarrative = latestPublish
      ? narrative(
          `${latestPublish.outboxRowId} reached publish ${latestPublish.messageId} at LSN ${latestPublish.lsn}.`,
          latestPublish.deduplicated
            ? "The outbox identity already existed in the dedupe ledger, so the retry was suppressed."
            : "The business row and outbox row committed before the ordered WAL and CDC stages advanced.",
          latestPublish.deduplicated
            ? "No second Kafka acknowledgement was emitted; the first accepted publish remains authoritative."
            : latestPublish.acknowledged
              ? "Trace the stable IDs back to the atomic database transaction."
              : "Wait for the deterministic Kafka acknowledgement.",
          latestPublish.provenance,
        )
      : narrative(
          scenarioState.dbTransactions.length > 0
            ? "The database transaction exists but no Kafka publish is recorded yet."
            : "No outbox transaction has been committed yet.",
          "The pipeline advances only after the business and outbox rows commit together.",
          definition.lesson.emptyCopy,
          "simulated",
        );

    return createFrame(
      definition,
      graph,
      {
        kind: "pipeline",
        title: "Outbox-to-Kafka causal pipeline",
        summary:
          "Stable IDs connect atomic commit, WAL ordering, CDC, and deduplication.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: traceTable,
        sections: [
          {
            id: "connector-attempts",
            title: "Connector retry evidence",
            facts: [facts[3], facts[4]],
            table: attemptTable,
          },
        ],
        stages,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "outbox-before-publish",
            "Acknowledged before",
            evidence(0, "simulated", "run-total"),
          ),
        ],
        latestPublish ? [facts[2], facts[3], facts[4]] : [],
      ),
    );
  },
);

type StreamsState = ScenarioStateFor<"streams-joins-windows">;
type StreamsJoin = StreamsState["joins"][number];

function latestPublishForOutbox(
  publishes: ScenarioStateFor<"outbox-cdc">["publishes"],
  outboxRowId: string,
) {
  for (let index = publishes.length - 1; index >= 0; index -= 1) {
    if (publishes[index]?.outboxRowId === outboxRowId) return publishes[index];
  }
  return undefined;
}

function isValidJoin(state: StreamsState, join: StreamsJoin) {
  const order = state.inputs.find(
    (record) =>
      record.recordId === join.orderRecordId && record.stream === "orders",
  );
  const payment = state.inputs.find(
    (record) =>
      record.recordId === join.paymentRecordId && record.stream === "payments",
  );
  const window = state.windows.find(
    (candidate) => candidate.windowId === join.windowId,
  );
  if (!order || !payment || !window) return false;
  if (
    order.key !== payment.key ||
    join.key !== order.key ||
    order.windowId !== join.windowId ||
    payment.windowId !== join.windowId
  ) {
    return false;
  }
  const inEventWindow = [order, payment].every(
    (record) =>
      record.eventTimeMs >= window.startMs &&
      record.eventTimeMs <= window.endMs,
  );
  const beforeGrace = [order, payment].every(
    (record) => record.arrivalTimeMs <= window.graceEndMs,
  );
  const notLate =
    !state.lateRecords.includes(order.recordId) &&
    !state.lateRecords.includes(payment.recordId);
  return inEventWindow && beforeGrace && notLate;
}
