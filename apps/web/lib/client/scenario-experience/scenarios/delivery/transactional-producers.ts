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
  recordFocus,
  row,
  table,
} from "../../helpers";
import type {
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
  TransactionBoundaryModel,
} from "../../model";

export const transactionExperience = experienceDefinition(
  "transactional-producers",
  projectTransactions,
);

type TransactionDefinition =
  ScenarioExperienceDefinition<"transactional-producers">;
type TransactionInput =
  ScenarioExperienceProjectionInput<"transactional-producers">;
type TransactionState = ScenarioStateFor<"transactional-producers">;
type Transaction = TransactionState["transactions"][number];

function projectTransactions(
  definition: TransactionDefinition,
  input: TransactionInput,
) {
  const { scenarioState } = input;
  const totals = transactionTotals(scenarioState);
  const factSet = buildTransactionFacts(totals);
  const facts = factSet.all;
  const latest = scenarioState.transactions.at(-1);
  return createFrame(
    definition,
    buildTransactionGraph(input, totals.visible),
    {
      kind: "transaction",
      title: "Transactional visibility",
      summary:
        "Staged does not mean visible; aborts and resends remain explicit.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildTransactionTable(scenarioState, definition.lesson.emptyCopy),
      sections: [
        {
          id: "transaction-records",
          title: "Record visibility",
          facts: [factSet.stagedRecords, factSet.visibleRecords],
          table: buildTransactionRecordTable(input),
        },
      ],
      boundaries: buildTransactionBoundaries(scenarioState),
    },
    buildTransactionNarrative(definition, latest, totals.deduplicated),
    undefined,
    experimentEvidence(
      definition,
      input,
      facts,
      [
        fact(
          "before-visible",
          "Visible before",
          evidence(0, "simulated", "run-total"),
        ),
      ],
      latest?.status === "committed" || totals.aborted > 0 ? facts : [],
    ),
  );
}

function transactionTotals(state: TransactionState) {
  return {
    staged: state.transactions.reduce(
      (total, transaction) =>
        total + transaction.records.filter((record) => record.staged).length,
      0,
    ),
    visible: state.transactions.reduce(
      (total, transaction) => total + transaction.visibleRecordIds.length,
      0,
    ),
    aborted: state.transactions.filter(
      (transaction) => transaction.status === "aborted",
    ).length,
    deduplicated: state.transactions.reduce(
      (total, transaction) =>
        total +
        transaction.dedupe.filter((attempt) => !attempt.accepted).length,
      0,
    ),
  };
}

type TransactionTotals = ReturnType<typeof transactionTotals>;

function buildTransactionFacts(totals: TransactionTotals) {
  const stagedRecords = fact(
    "transaction-staged",
    "Staged records",
    evidence(totals.staged, "simulated", "run-total"),
  );
  const visibleRecords = fact(
    "transaction-visible",
    "Visible records",
    evidence(totals.visible, "simulated", "run-total"),
    { emphasis: totals.visible > 0 ? "positive" : "neutral" },
  );
  const abortedTransactions = fact(
    "transaction-aborted",
    "Aborted transactions",
    evidence(totals.aborted, "simulated", "run-total"),
  );
  const suppressedResends = fact(
    "transaction-deduplicated",
    "Suppressed resends",
    evidence(totals.deduplicated, "simulated", "run-total"),
  );
  return {
    all: [
      stagedRecords,
      visibleRecords,
      abortedTransactions,
      suppressedResends,
    ],
    stagedRecords,
    visibleRecords,
    abortedTransactions,
    suppressedResends,
  };
}

function buildTransactionTable(state: TransactionState, emptyCopy: string) {
  return table(
    "transaction-boundaries",
    "Transaction visibility boundaries",
    [
      { key: "transaction", label: "Transaction" },
      { key: "status", label: "Status" },
      { key: "staged", label: "Staged", align: "end" },
      { key: "visible", label: "Visible", align: "end" },
      { key: "offsets", label: "Offsets committed" },
    ],
    state.transactions.map((transaction) =>
      row(
        transaction.id,
        {
          transaction: evidence(
            transaction.transactionId,
            transaction.provenance,
            "run-total",
          ),
          status: evidence(
            transaction.status,
            transaction.provenance,
            "current",
          ),
          staged: evidence(
            transaction.records.filter((record) => record.staged).length,
            transaction.provenance,
            "run-total",
          ),
          visible: evidence(
            transaction.visibleRecordIds.length,
            transaction.provenance,
            "run-total",
          ),
          offsets: evidence(
            transaction.offsetsCommitted ? "Yes" : "No",
            transaction.provenance,
            "current",
          ),
        },
        entityFocus(transaction.id, "commit-boundary"),
        transaction.status === "aborted"
          ? "warning"
          : transaction.status === "committed"
            ? "positive"
            : "neutral",
      ),
    ),
    emptyCopy,
  );
}

function buildTransactionRecordTable(input: TransactionInput) {
  return table(
    "transaction-record-visibility",
    "Per-record staged and visible state",
    [
      { key: "transaction", label: "Transaction" },
      { key: "record", label: "Record" },
      { key: "sequence", label: "Producer sequence", align: "end" },
      { key: "staged", label: "Staged" },
      { key: "visible", label: "Visible" },
    ],
    input.scenarioState.transactions.flatMap((transaction) =>
      transaction.records.map((record) =>
        row(
          `${transaction.id}-${record.recordId}`,
          {
            transaction: evidence(
              transaction.transactionId,
              transaction.provenance,
              "run-total",
            ),
            record: evidence(
              record.recordId,
              transaction.provenance,
              "run-total",
            ),
            sequence: evidence(
              record.producerSequence,
              transaction.provenance,
              "run-total",
            ),
            staged: evidence(
              record.staged ? "Yes" : "No",
              transaction.provenance,
              "current",
            ),
            visible: evidence(
              record.visible ? "Yes" : "No",
              transaction.provenance,
              "current",
            ),
          },
          recordFocus(
            input.snapshot,
            record.recordId,
            undefined,
            undefined,
            "commit-boundary",
          ),
        ),
      ),
    ),
    "Stage a transaction to see record visibility.",
  );
}

function buildTransactionGraph(input: TransactionInput, visible: number) {
  return buildScenarioGraph("transactional-producers", input.snapshot, {
    active: input.scenarioState.transactions.length > 0,
    inactiveEdgeIds:
      visible === 0 ? new Set(["boundary-topic", "topic-group"]) : undefined,
    metrics: {
      "transaction-coordinator": graphCountMetric(
        input.scenarioState.transactions.length,
        "simulated",
        "run-total",
      ),
      "commit-boundary": graphCountMetric(visible, "simulated", "run-total"),
    },
  });
}

function buildTransactionNarrative(
  definition: TransactionDefinition,
  latest: Transaction | undefined,
  deduplicated: number,
) {
  if (!latest) {
    return narrative(
      "No transaction has been staged yet.",
      "Visibility evidence begins at the server-owned transaction boundary.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
    `${latest.transactionId} is ${latest.status}; ${latest.visibleRecordIds.length} record(s) are visible.`,
    latest.status === "committed"
      ? "The simulated read-committed boundary released the transaction as one unit."
      : latest.status === "aborted"
        ? "Aborted staged records never crossed the visibility boundary."
        : "Open records remain staged and hidden.",
    deduplicated > 0
      ? `${deduplicated} repeated producer sequence was suppressed.`
      : "Run the abort-and-dedupe contrast to test hidden output and resend suppression.",
    latest.provenance,
  );
}

function buildTransactionBoundaries(
  state: TransactionState,
): TransactionBoundaryModel[] {
  return state.transactions.map((transaction) => ({
    id: transaction.id,
    status: transaction.status === "open" ? "staged" : transaction.status,
    recordIds: transaction.records.map((record) => record.recordId),
    visibleRecordIds: transaction.visibleRecordIds,
    provenance: transaction.provenance,
    focus: entityFocus(transaction.id, "commit-boundary"),
  }));
}
