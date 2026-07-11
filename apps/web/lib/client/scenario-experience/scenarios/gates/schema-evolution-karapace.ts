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
import type { GateEvaluationModel } from "../../model";

export const schemaExperience = experienceDefinition(
  "schema-evolution-karapace",
  (definition, input) => {
    const { snapshot, scenarioState } = input;
    const accepted = scenarioState.attempts.filter(
      (attempt) => attempt.gate === "accepted" && attempt.reachedTopic,
    );
    const rejected = scenarioState.attempts.filter(
      (attempt) => attempt.gate === "rejected" && !attempt.reachedTopic,
    );
    const facts = [
      fact(
        "schema-active-version",
        "Active schema",
        evidence(`v${scenarioState.activeVersion}`, "simulated", "current"),
      ),
      fact(
        "schema-topic-records",
        "Topic records",
        evidence(scenarioState.topicRecordCount, "simulated", "run-total"),
      ),
      fact(
        "schema-accepted",
        "Accepted attempts",
        evidence(accepted.length, "simulated", "run-total"),
        {
          emphasis: accepted.length > 0 ? "positive" : "neutral",
        },
      ),
      fact(
        "schema-rejected",
        "Rejected before Kafka",
        evidence(rejected.length, "simulated", "run-total"),
        {
          emphasis: rejected.length > 0 ? "warning" : "neutral",
        },
      ),
    ];
    const attemptTable = table(
      "schema-gate-attempts",
      "Schema compatibility attempts",
      [
        { key: "version", label: "Version" },
        { key: "compatibility", label: "Compatibility" },
        { key: "gate", label: "Gate" },
        { key: "topic", label: "Reached Kafka" },
      ],
      scenarioState.attempts.map((attempt) =>
        row(
          attempt.id,
          {
            version: evidence(
              `v${attempt.version}`,
              attempt.provenance,
              "run-total",
            ),
            compatibility: evidence(
              attempt.compatible ? "Compatible" : "Incompatible",
              attempt.provenance,
              "current",
            ),
            gate: evidence(attempt.gate, attempt.provenance, "current"),
            topic: evidence(
              attempt.reachedTopic ? "Yes" : "No",
              attempt.provenance,
              "current",
            ),
          },
          entityFocus(attempt.id, "compatibility-gate"),
          attempt.gate === "rejected" ? "danger" : "positive",
        ),
      ),
      definition.lesson.emptyCopy,
    );
    const diffTable = table(
      "schema-field-diff",
      "Field-level schema differences",
      [
        { key: "version", label: "Version" },
        { key: "field", label: "Field" },
        { key: "before", label: "Before" },
        { key: "after", label: "After" },
        { key: "compatibility", label: "Result" },
      ],
      scenarioState.attempts.flatMap((attempt) =>
        attempt.fieldDiff.map((field, index) =>
          row(
            `${attempt.id}-field-${index}`,
            {
              version: evidence(
                `v${attempt.version}`,
                attempt.provenance,
                "run-total",
              ),
              field: evidence(field.field, attempt.provenance, "run-total"),
              before: evidence(
                field.before ?? "Absent",
                attempt.provenance,
                "run-total",
              ),
              after: evidence(
                field.after ?? "Absent",
                attempt.provenance,
                "run-total",
              ),
              compatibility: evidence(
                field.compatibility,
                attempt.provenance,
                "current",
              ),
            },
            entityFocus(attempt.id, "compatibility-gate"),
            field.compatibility === "incompatible" ? "danger" : "neutral",
          ),
        ),
      ),
      "Run a schema attempt to see field-level changes.",
    );
    const latest = scenarioState.attempts.at(-1);
    const graph = buildScenarioGraph("schema-evolution-karapace", snapshot, {
      active: Boolean(latest),
      inactiveEdgeIds:
        latest?.gate === "rejected"
          ? new Set(["gate-topic", "topic-group"])
          : undefined,
      metrics: {
        "schema-registry": evidence(
          `v${scenarioState.activeVersion}`,
          "simulated",
          "current",
        ),
        "compatibility-gate": graphCountMetric(
          rejected.length,
          "simulated",
          "run-total",
        ),
        topic: graphCountMetric(
          scenarioState.topicRecordCount,
          "simulated",
          "run-total",
        ),
      },
      states: {
        "compatibility-gate": latest?.gate === "rejected" ? "failed" : "active",
      },
    });
    const frameNarrative = latest
      ? narrative(
          `Schema v${latest.version} was ${latest.gate}${latest.reachedTopic ? " and reached Kafka" : " before Kafka"}.`,
          latest.compatible
            ? "Its field-level changes satisfy the simulated compatibility policy."
            : "At least one field change violates compatibility, so the pre-topic gate terminated the path.",
          latest.gate === "accepted"
            ? "Run the incompatible contrast and verify the topic count does not increase."
            : `The topic remains at ${scenarioState.topicRecordCount} accepted record(s).`,
          latest.provenance,
        )
      : narrative(
          "No schema version has been evaluated yet.",
          "The deterministic registry gate runs before any simulated Kafka append.",
          definition.lesson.emptyCopy,
          "simulated",
        );
    const evaluations: GateEvaluationModel[] = scenarioState.attempts.map(
      (attempt) => ({
        id: attempt.id,
        subject: `Schema v${attempt.version}`,
        resource: snapshot.topicName,
        operation: "write",
        outcome: attempt.gate === "accepted" ? "allowed" : "denied",
        reason: attempt.compatible
          ? "Field changes are compatible."
          : "An incompatible field change was rejected.",
        provenance: attempt.provenance,
        focus: entityFocus(attempt.id),
      }),
    );

    return createFrame(
      definition,
      graph,
      {
        kind: "gate",
        title: "Field-level compatibility gate",
        summary: "Only accepted schema attempts contribute to the topic count.",
        emptyCopy: definition.lesson.emptyCopy,
        facts,
        table: attemptTable,
        sections: [
          {
            id: "schema-field-differences",
            title: "Field differences",
            facts: [facts[0]],
            table: diffTable,
          },
        ],
        evaluations,
      },
      frameNarrative,
      undefined,
      experimentEvidence(
        definition,
        input,
        facts,
        [
          fact(
            "schema-before-topic",
            "Topic records before",
            evidence(
              Math.max(0, scenarioState.topicRecordCount - accepted.length),
              "simulated",
              "run-total",
            ),
          ),
        ],
        latest ? [facts[1], facts[2], facts[3]] : [],
      ),
    );
  },
);
