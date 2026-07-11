import { z } from "zod";
import type { ScenarioStateId } from "./scenario-state";

export type ScenarioExperimentRole = "primary" | "contrast" | "auxiliary";

type ScenarioExperimentDescriptorShape = {
  id: string;
  role: ScenarioExperimentRole;
  prerequisite: string | null;
};

function defineScenarioExperimentCatalog<
  const Catalog extends Record<
    ScenarioStateId,
    readonly ScenarioExperimentDescriptorShape[]
  >,
>(catalog: Catalog): Catalog {
  for (const [scenarioId, descriptors] of Object.entries(catalog)) {
    const ids = new Set(descriptors.map(({ id }) => id));
    if (ids.size !== descriptors.length) {
      throw new Error(`Duplicate experiment ID in ${scenarioId}.`);
    }
    for (const role of ["primary", "contrast"] as const) {
      if (
        descriptors.filter((descriptor) => descriptor.role === role).length !==
        1
      ) {
        throw new Error(
          `${scenarioId} must define exactly one ${role} experiment.`,
        );
      }
    }
    for (const descriptor of descriptors) {
      if (
        descriptor.prerequisite !== null &&
        !ids.has(descriptor.prerequisite)
      ) {
        throw new Error(
          `${descriptor.id} requires an experiment outside ${scenarioId}.`,
        );
      }
    }
  }
  return catalog;
}

export const scenarioExperimentCatalog = defineScenarioExperimentCatalog({
  partitioning: [
    {
      id: "produce-keyed-record",
      role: "primary",
      prerequisite: null,
    },
    {
      id: "grow-consumer-group",
      role: "contrast",
      prerequisite: "produce-keyed-record",
    },
  ],
  "fan-out-load-balancing": [
    {
      id: "produce-unkeyed-burst",
      role: "contrast",
      prerequisite: "grow-consumer-group",
    },
    { id: "balance-settings", role: "auxiliary", prerequisite: null },
    { id: "grow-consumer-group", role: "primary", prerequisite: null },
  ],
  "at-least-once-duplicates": [
    {
      id: "duplicate-risk-records",
      role: "contrast",
      prerequisite: "crash-and-redeliver",
    },
    { id: "slow-commit-window", role: "auxiliary", prerequisite: null },
    { id: "crash-and-redeliver", role: "primary", prerequisite: null },
  ],
  "retry-dead-letter-queues": [
    {
      id: "trigger-retry-failure",
      role: "auxiliary",
      prerequisite: null,
    },
    { id: "transient-recovery", role: "primary", prerequisite: null },
    {
      id: "poison-to-dlq",
      role: "contrast",
      prerequisite: "transient-recovery",
    },
  ],
  "schema-evolution-karapace": [
    {
      id: "trigger-schema-rejection",
      role: "contrast",
      prerequisite: "compatible-schema",
    },
    { id: "compatible-schema", role: "primary", prerequisite: null },
  ],
  "transactional-producers": [
    { id: "transaction-pair", role: "primary", prerequisite: null },
    {
      id: "abort-and-dedupe",
      role: "contrast",
      prerequisite: "transaction-pair",
    },
  ],
  "event-replay-sourcing": [
    { id: "aggregate-events", role: "primary", prerequisite: null },
    {
      id: "rebuild-projection",
      role: "contrast",
      prerequisite: "aggregate-events",
    },
  ],
  "consumer-lag-backpressure": [
    { id: "build-lag", role: "primary", prerequisite: null },
    {
      id: "recover-lag",
      role: "contrast",
      prerequisite: "build-lag",
    },
  ],
  "hot-partitions-key-skew": [
    { id: "hot-key-burst", role: "primary", prerequisite: null },
    {
      id: "balanced-comparison",
      role: "contrast",
      prerequisite: "hot-key-burst",
    },
  ],
  "log-compaction-tombstones": [
    {
      id: "compacted-key-series",
      role: "auxiliary",
      prerequisite: null,
    },
    { id: "run-compaction", role: "primary", prerequisite: null },
    {
      id: "expire-tombstone",
      role: "contrast",
      prerequisite: "run-compaction",
    },
  ],
  "retention-data-loss": [
    { id: "retention-window", role: "auxiliary", prerequisite: null },
    { id: "advance-retention", role: "primary", prerequisite: null },
    {
      id: "recover-retention",
      role: "contrast",
      prerequisite: "advance-retention",
    },
  ],
  "cooperative-rebalancing": [
    {
      id: "cooperative-pressure",
      role: "contrast",
      prerequisite: "compare-rebalance",
    },
    { id: "compare-rebalance", role: "primary", prerequisite: null },
  ],
  "streams-joins-windows": [
    { id: "window-pair", role: "primary", prerequisite: null },
    {
      id: "late-arrival",
      role: "contrast",
      prerequisite: "window-pair",
    },
  ],
  "outbox-cdc": [
    { id: "cdc-batch", role: "primary", prerequisite: null },
    {
      id: "retry-cdc",
      role: "contrast",
      prerequisite: "cdc-batch",
    },
  ],
  "acl-least-privilege": [
    { id: "trigger-acl-denial", role: "primary", prerequisite: null },
    {
      id: "grant-required-permission",
      role: "contrast",
      prerequisite: "trigger-acl-denial",
    },
  ],
} as const satisfies Record<
  ScenarioStateId,
  readonly ScenarioExperimentDescriptorShape[]
>);

export type ScenarioExperimentDescriptorFor<Id extends ScenarioStateId> =
  (typeof scenarioExperimentCatalog)[Id][number];

export type ScenarioExperimentIdFor<Id extends ScenarioStateId> =
  ScenarioExperimentDescriptorFor<Id>["id"];

export type ScenarioExperimentIdForRole<
  Id extends ScenarioStateId,
  Role extends ScenarioExperimentRole,
> = Extract<ScenarioExperimentDescriptorFor<Id>, { role: Role }>["id"];

export type ScenarioExperimentId = ScenarioExperimentIdFor<ScenarioStateId>;

type ScenarioExperimentIdsByScenario = {
  readonly [Id in ScenarioStateId]: readonly ScenarioExperimentIdFor<Id>[];
};

export const scenarioExperimentIds = Object.fromEntries(
  Object.entries(scenarioExperimentCatalog).map(([scenarioId, descriptors]) => [
    scenarioId,
    descriptors.map(({ id }) => id),
  ]),
) as unknown as ScenarioExperimentIdsByScenario;

const scenarioExperimentIdValues = [
  ...new Set(
    Object.values(scenarioExperimentCatalog).flatMap((descriptors) =>
      descriptors.map(({ id }) => id),
    ),
  ),
] as [ScenarioExperimentId, ...ScenarioExperimentId[]];

export const scenarioExperimentIdSchema = z.enum(scenarioExperimentIdValues);

export function scenarioExperimentDescriptorFor<Id extends ScenarioStateId>(
  scenarioId: Id,
  experimentId: string,
): ScenarioExperimentDescriptorFor<Id> | undefined {
  return scenarioExperimentCatalog[scenarioId].find(
    ({ id }) => id === experimentId,
  ) as ScenarioExperimentDescriptorFor<Id> | undefined;
}

export function isScenarioExperimentIdFor<Id extends ScenarioStateId>(
  scenarioId: Id,
  experimentId: string,
): experimentId is ScenarioExperimentIdFor<Id> {
  return scenarioExperimentDescriptorFor(scenarioId, experimentId) != null;
}
