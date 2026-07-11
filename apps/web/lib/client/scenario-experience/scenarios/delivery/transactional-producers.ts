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
import type { TransactionBoundaryModel } from "../../model";

export const transactionExperience = experienceDefinition(
  "transactional-producers",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const staged = scenarioState.transactions.reduce(
      (total, transaction) =>
        total + transaction.records.filter((record) => record.staged).length,
      0,
    );
    const visible = scenarioState.transactions.reduce(
      (total, transaction) => total + transaction.visibleRecordIds.length,
      0,
    );
    const aborted = scenarioState.transactions.filter(
      (transaction) => transaction.status === "aborted",
    ).length;
    const deduplicated = scenarioState.transactions.reduce(
      (total, transaction) =>
        total +
        transaction.dedupe.filter((attempt) => !attempt.accepted).length,
      0,
    );
    const facts = [
      fact(
        "transaction-staged",
        "Staged records",
        evidence(staged, "simulated", "run-total"),
      ),
      fact(
        "transaction-visible",
        "Visible records",
        evidence(visible, "simulated", "run-total"),
        {
          emphasis: visible > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "transaction-aborted",
        "Aborted transactions",
        evidence(aborted, "simulated", "run-total"),
      ),
      fact(
        "transaction-deduplicated",
        "Suppressed resends",
        evidence(deduplicated, "simulated", "run-total"),
      ),
    ];
    const transactionTable = table(
      "transaction-boundaries",
      "Transaction visibility boundaries",
      [
        { key: "transaction", label: "Transaction" },
        { key: "status", label: "Status" },
        { key: "staged", label: "Staged", align: "end" },
        { key: "visible", label: "Visible", align: "end" },
        { key: "offsets", label: "Offsets committed" },
      ],
      scenarioState.transactions.map((transaction) =>
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
      definition.lesson.emptyCopy,
    );
    const recordTable = table(
      "transaction-record-visibility",
      "Per-record staged and visible state",
      [
        { key: "transaction", label: "Transaction" },
        { key: "record", label: "Record" },
        { key: "sequence", label: "Producer sequence", align: "end" },
        { key: "staged", label: "Staged" },
        { key: "visible", label: "Visible" },
      ],
      scenarioState.transactions.flatMap((transaction) =>
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
              snapshot,
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
    const graph = buildScenarioGraph("transactional-producers", snapshot, {
      active: scenarioState.transactions.length > 0,
      inactiveEdgeIds:
        visible === 0 ? new Set(["boundary-topic", "topic-group"]) : undefined,
      metrics: {
        "transaction-coordinator": graphCountMetric(
          scenarioState.transactions.length,
          "simulated",
          "run-total",
        ),
        "commit-boundary": graphCountMetric(visible, "simulated", "run-total"),
      },
    });
    const latest = scenarioState.transactions.at(-1);
    const frameNarrative = latest
      ? narrative(
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
        )
      : narrative(
          "No transaction has been staged yet.",
          "Visibility evidence begins at the server-owned transaction boundary.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const boundaries: TransactionBoundaryModel[] =
      scenarioState.transactions.map((transaction) => ({
        id: transaction.id,
        status: transaction.status === "open" ? "staged" : transaction.status,
        recordIds: transaction.records.map((record) => record.recordId),
        visibleRecordIds: transaction.visibleRecordIds,
        provenance: transaction.provenance,
        focus: entityFocus(transaction.id, "commit-boundary"),
      }));

    return createFrame(
      definition,
      graph,
      {
        kind: "transaction",
        title: "Transactional visibility",
        summary:
          "Staged does not mean visible; aborts and resends remain explicit.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: transactionTable,
        sections: [
          {
            id: "transaction-records",
            title: "Record visibility",
            facts: [facts[0], facts[1]],
            table: recordTable,
          },
        ],
        boundaries,
      },
      frameNarrative,
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
        latest?.status === "committed" || aborted > 0 ? facts : [],
      ),
    );
  },
);
