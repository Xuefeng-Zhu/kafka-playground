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
  GateEvaluationModel,
  ScenarioExperienceDefinition,
  ScenarioExperienceProjectionInput,
  ScenarioStateFor,
} from "../../model";

export const schemaExperience = experienceDefinition(
  "schema-evolution-karapace",
  projectSchema,
);

type SchemaDefinition =
  ScenarioExperienceDefinition<"schema-evolution-karapace">;
type SchemaInput =
  ScenarioExperienceProjectionInput<"schema-evolution-karapace">;
type SchemaState = ScenarioStateFor<"schema-evolution-karapace">;
type SchemaAttempt = SchemaState["attempts"][number];

function projectSchema(definition: SchemaDefinition, input: SchemaInput) {
  const { scenarioState } = input;
  const accepted = acceptedSchemaAttempts(scenarioState);
  const rejected = rejectedSchemaAttempts(scenarioState);
  const factSet = buildSchemaFacts(scenarioState, accepted, rejected);
  const facts = factSet.all;
  const latest = scenarioState.attempts.at(-1);
  return createFrame(
    definition,
    buildSchemaGraph(input, latest, rejected.length),
    {
      kind: "gate",
      title: "Field-level compatibility gate",
      summary: "Only accepted schema attempts contribute to the topic count.",
      emptyCopy: definition.lesson.emptyCopy,
      facts,
      table: buildSchemaAttemptTable(
        scenarioState,
        definition.lesson.emptyCopy,
      ),
      sections: [
        {
          id: "schema-field-differences",
          title: "Field differences",
          facts: [factSet.activeSchema],
          table: buildSchemaDiffTable(scenarioState),
        },
      ],
      evaluations: buildSchemaEvaluations(input),
    },
    buildSchemaNarrative(definition, scenarioState, latest),
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
      latest
        ? [
            factSet.topicRecords,
            factSet.acceptedAttempts,
            factSet.rejectedAttempts,
          ]
        : [],
    ),
  );
}

function acceptedSchemaAttempts(state: SchemaState) {
  return state.attempts.filter(
    (attempt) => attempt.gate === "accepted" && attempt.reachedTopic,
  );
}

function rejectedSchemaAttempts(state: SchemaState) {
  return state.attempts.filter(
    (attempt) => attempt.gate === "rejected" && !attempt.reachedTopic,
  );
}

function buildSchemaFacts(
  state: SchemaState,
  accepted: readonly SchemaAttempt[],
  rejected: readonly SchemaAttempt[],
) {
  const activeSchema = fact(
    "schema-active-version",
    "Active schema",
    evidence(`v${state.activeVersion}`, "simulated", "current"),
  );
  const topicRecords = fact(
    "schema-topic-records",
    "Topic records",
    evidence(state.topicRecordCount, "simulated", "run-total"),
  );
  const acceptedAttempts = fact(
    "schema-accepted",
    "Accepted attempts",
    evidence(accepted.length, "simulated", "run-total"),
    { emphasis: accepted.length > 0 ? "positive" : "neutral" },
  );
  const rejectedAttempts = fact(
    "schema-rejected",
    "Rejected before Kafka",
    evidence(rejected.length, "simulated", "run-total"),
    { emphasis: rejected.length > 0 ? "warning" : "neutral" },
  );
  return {
    all: [activeSchema, topicRecords, acceptedAttempts, rejectedAttempts],
    activeSchema,
    topicRecords,
    acceptedAttempts,
    rejectedAttempts,
  };
}

function buildSchemaAttemptTable(state: SchemaState, emptyCopy: string) {
  return table(
    "schema-gate-attempts",
    "Schema compatibility attempts",
    [
      { key: "version", label: "Version" },
      { key: "compatibility", label: "Compatibility" },
      { key: "gate", label: "Gate" },
      { key: "topic", label: "Reached Kafka" },
    ],
    state.attempts.map((attempt) =>
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
    emptyCopy,
  );
}

function buildSchemaDiffTable(state: SchemaState) {
  return table(
    "schema-field-diff",
    "Field-level schema differences",
    [
      { key: "version", label: "Version" },
      { key: "field", label: "Field" },
      { key: "before", label: "Before" },
      { key: "after", label: "After" },
      { key: "compatibility", label: "Result" },
    ],
    state.attempts.flatMap((attempt) =>
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
}

function buildSchemaGraph(
  input: SchemaInput,
  latest: SchemaAttempt | undefined,
  rejectedCount: number,
) {
  return buildScenarioGraph("schema-evolution-karapace", input.snapshot, {
    active: Boolean(latest),
    inactiveEdgeIds:
      latest?.gate === "rejected"
        ? new Set(["gate-topic", "topic-group"])
        : undefined,
    metrics: {
      "schema-registry": evidence(
        `v${input.scenarioState.activeVersion}`,
        "simulated",
        "current",
      ),
      "compatibility-gate": graphCountMetric(
        rejectedCount,
        "simulated",
        "run-total",
      ),
      topic: graphCountMetric(
        input.scenarioState.topicRecordCount,
        "simulated",
        "run-total",
      ),
    },
    states: {
      "compatibility-gate": latest?.gate === "rejected" ? "failed" : "active",
    },
  });
}

function buildSchemaNarrative(
  definition: SchemaDefinition,
  state: SchemaState,
  latest: SchemaAttempt | undefined,
) {
  if (!latest) {
    return narrative(
      "No schema version has been evaluated yet.",
      "The deterministic registry gate runs before any simulated Kafka append.",
      definition.lesson.emptyCopy,
      "simulated",
    );
  }
  return narrative(
    `Schema v${latest.version} was ${latest.gate}${latest.reachedTopic ? " and reached Kafka" : " before Kafka"}.`,
    latest.compatible
      ? "Its field-level changes satisfy the simulated compatibility policy."
      : "At least one field change violates compatibility, so the pre-topic gate terminated the path.",
    latest.gate === "accepted"
      ? "Run the incompatible contrast and verify the topic count does not increase."
      : `The topic remains at ${state.topicRecordCount} accepted record(s).`,
    latest.provenance,
  );
}

function buildSchemaEvaluations(input: SchemaInput): GateEvaluationModel[] {
  return input.scenarioState.attempts.map((attempt) => ({
    id: attempt.id,
    subject: `Schema v${attempt.version}`,
    resource: input.snapshot.topicName,
    operation: "write",
    outcome: attempt.gate === "accepted" ? "allowed" : "denied",
    reason: attempt.compatible
      ? "Field changes are compatible."
      : "An incompatible field change was rejected.",
    provenance: attempt.provenance,
    focus: entityFocus(attempt.id),
  }));
}
