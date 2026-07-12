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
import type {
  PipelineStageModel,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
} from "../../model";

export const outboxExperience = experienceDefinition(
  "outbox-cdc",
  projectOutbox,
);

type OutboxDefinition = ScenarioExperienceDefinition<"outbox-cdc">;
type OutboxInput = ScenarioExperienceProjectionInput<"outbox-cdc">;
type OutboxState = ScenarioStateFor<"outbox-cdc">;
type OutboxPublish = OutboxState["publishes"][number];

function projectOutbox(definition: OutboxDefinition, input: OutboxInput) {
  const { scenarioState } = input;
  const metrics = outboxMetrics(scenarioState);
  const factSet = buildOutboxFacts(scenarioState, metrics);
  const facts = factSet.all;
  return createFrame(
    definition,
    buildOutboxGraph(input, metrics),
    {
      kind: "pipeline",
      title: "Outbox-to-Kafka causal pipeline",
      summary:
        "Stable IDs connect atomic commit, WAL ordering, CDC, and deduplication.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildOutboxTraceTable(scenarioState, definition.lesson.emptyCopy),
      sections: [
        {
          id: "connector-attempts",
          title: "Connector retry evidence",
          facts: [factSet.suppressedRetries, factSet.latestAcknowledgement],
          table: buildConnectorAttemptTable(scenarioState),
        },
      ],
      stages: buildOutboxStages(scenarioState, metrics),
    },
    buildOutboxNarrative(definition, scenarioState, metrics.latestPublish),
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
      metrics.latestPublish
        ? [
            factSet.acknowledgedPublishes,
            factSet.suppressedRetries,
            factSet.latestAcknowledgement,
          ]
        : [],
    ),
  );
}

function outboxMetrics(state: OutboxState) {
  return {
    committed: state.dbTransactions.filter(
      (transaction) => transaction.committed,
    ),
    acknowledged: state.publishes.filter(
      (publish) => publish.acknowledged && !publish.deduplicated,
    ),
    suppressed: state.dedupeLedger.reduce(
      (total, entry) => total + entry.suppressedAttempts,
      0,
    ),
    latestPublish: state.publishes.at(-1),
  };
}

type OutboxMetrics = ReturnType<typeof outboxMetrics>;

function buildOutboxFacts(state: OutboxState, metrics: OutboxMetrics) {
  const { committed, acknowledged, suppressed, latestPublish } = metrics;
  const atomicCommits = fact(
    "outbox-db-commits",
    "Atomic DB commits",
    evidence(committed.length, "simulated", "run-total"),
  );
  const walRecords = fact(
    "outbox-wal-records",
    "WAL records",
    evidence(state.wal.length, "simulated", "run-total"),
  );
  const acknowledgedPublishes = fact(
    "outbox-acknowledged",
    "Acknowledged publishes",
    evidence(acknowledged.length, "simulated", "run-total"),
    { emphasis: acknowledged.length > 0 ? "positive" : "neutral" },
  );
  const suppressedRetries = fact(
    "outbox-suppressed",
    "Suppressed retry attempts",
    evidence(suppressed, "simulated", "run-total"),
    { emphasis: suppressed > 0 ? "positive" : "neutral" },
  );
  const latestAcknowledgement = fact(
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
    { emphasis: latestPublish?.deduplicated ? "positive" : "neutral" },
  );
  return {
    all: [
      atomicCommits,
      walRecords,
      acknowledgedPublishes,
      suppressedRetries,
      latestAcknowledgement,
    ],
    atomicCommits,
    walRecords,
    acknowledgedPublishes,
    suppressedRetries,
    latestAcknowledgement,
  };
}

function buildOutboxTraceTable(state: OutboxState, emptyCopy: string) {
  return table(
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
    state.dbTransactions.map((transaction) => {
      const wal = state.wal.find(
        (entry) => entry.outboxRowId === transaction.outboxRowId,
      );
      const publish = latestPublishForOutbox(
        state.publishes,
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
            publishStatus(publish),
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
    emptyCopy,
  );
}

function publishStatus(publish: OutboxPublish | undefined) {
  if (!publish) return "Not published";
  if (publish.deduplicated) return "Deduplicated before acknowledgement";
  return publish.acknowledged ? "Acknowledged" : "Awaiting acknowledgement";
}

function buildConnectorAttemptTable(state: OutboxState) {
  return table(
    "outbox-connector-attempts",
    "CDC connector attempts",
    [
      { key: "attempt", label: "Attempt ID" },
      { key: "outbox", label: "Outbox row" },
      { key: "lsn", label: "LSN" },
      { key: "number", label: "Try", align: "end" },
      { key: "status", label: "Status" },
    ],
    state.connectorAttempts.map((attempt) =>
      row(
        attempt.id,
        {
          attempt: evidence(attempt.attemptId, attempt.provenance, "run-total"),
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
}

function buildOutboxStages(
  state: OutboxState,
  metrics: OutboxMetrics,
): PipelineStageModel[] {
  return [
    {
      id: "database-outbox",
      title: "Atomic DB commit",
      status: metrics.committed.length > 0 ? "complete" : "waiting",
      provenance: "simulated",
      focus: { kind: "entity", id: "database-outbox" },
    },
    {
      id: "transaction-log",
      title: "WAL / LSN",
      status: state.wal.length > 0 ? "complete" : "waiting",
      provenance: "simulated",
      focus: { kind: "entity", id: "transaction-log" },
    },
    {
      id: "cdc-connector",
      title: "CDC publish",
      status:
        metrics.suppressed > 0
          ? "deduplicated"
          : metrics.acknowledged.length > 0
            ? "complete"
            : state.connectorAttempts.length > 0
              ? "active"
              : "waiting",
      provenance: "simulated",
      focus: { kind: "entity", id: "cdc-connector" },
    },
    {
      id: "topic",
      title: "Kafka acknowledgement",
      status: metrics.acknowledged.length > 0 ? "complete" : "waiting",
      provenance: "simulated",
      focus: { kind: "entity", id: "topic" },
    },
  ];
}

function buildOutboxGraph(input: OutboxInput, metrics: OutboxMetrics) {
  return buildScenarioGraph("outbox-cdc", input.snapshot, {
    active: input.scenarioState.dbTransactions.length > 0,
    metrics: {
      "database-outbox": graphCountMetric(
        metrics.committed.length,
        "simulated",
        "run-total",
      ),
      "transaction-log": graphCountMetric(
        input.scenarioState.wal.length,
        "simulated",
        "run-total",
      ),
      "cdc-connector": graphCountMetric(
        input.scenarioState.connectorAttempts.length,
        "simulated",
        "run-total",
      ),
      topic: graphCountMetric(
        metrics.acknowledged.length,
        "simulated",
        "run-total",
      ),
    },
  });
}

function buildOutboxNarrative(
  definition: OutboxDefinition,
  state: OutboxState,
  latestPublish: OutboxPublish | undefined,
) {
  if (!latestPublish) {
    return narrative(
      state.dbTransactions.length > 0
        ? "The database transaction exists but no Kafka publish is recorded yet."
        : "No outbox transaction has been committed yet.",
      "The pipeline advances only after the business and outbox rows commit together.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
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
  );
}

function latestPublishForOutbox(
  publishes: ScenarioStateFor<"outbox-cdc">["publishes"],
  outboxRowId: string,
) {
  for (let index = publishes.length - 1; index >= 0; index -= 1) {
    if (publishes[index]?.outboxRowId === outboxRowId) return publishes[index];
  }
  return undefined;
}
