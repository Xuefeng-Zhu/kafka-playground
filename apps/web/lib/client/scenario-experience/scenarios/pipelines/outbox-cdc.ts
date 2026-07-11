import {
  experienceDefinition,
  experimentEvidence,
} from "../../definition-helpers";
import { buildScenarioGraph, graphCountMetric } from "../../graphs";
import {
  createFrame,
  entityFocus,
  evidence,
  fact,
  narrative,
  row,
  table,
} from "../../helpers";
import type { PipelineStageModel, ScenarioStateFor } from "../../model";

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

function latestPublishForOutbox(
  publishes: ScenarioStateFor<"outbox-cdc">["publishes"],
  outboxRowId: string,
) {
  for (let index = publishes.length - 1; index >= 0; index -= 1) {
    if (publishes[index]?.outboxRowId === outboxRowId) return publishes[index];
  }
  return undefined;
}
