import type {
  CausalGraphModel,
  EvidenceValue,
  Provenance,
  ScenarioExperienceId,
  ScenarioExperienceSnapshot,
} from "./model";
import { causalGraph, evidence, type GraphNodeSpec } from "./helpers";
import { SCENARIO_GRAPH_DESCRIPTORS } from "./scenario-graph-descriptors";

type GraphOptions = {
  active?: boolean;
  inactiveEdgeIds?: ReadonlySet<string>;
  metrics?: Readonly<Record<string, EvidenceValue>>;
  states?: Readonly<Record<string, GraphNodeSpec["state"]>>;
};

export function buildScenarioGraph(
  scenarioId: ScenarioExperienceId,
  snapshot: ScenarioExperienceSnapshot,
  options: GraphOptions = {},
): CausalGraphModel {
  const descriptor = SCENARIO_GRAPH_DESCRIPTORS[scenarioId];
  const partitionNodes = descriptor.partitions
    ? Array.from({ length: snapshot.partitionCount }, (_, partition) => ({
        id: `partition-${partition}`,
        title: `Partition ${partition}`,
        description: `Kafka partition ${partition} in ${snapshot.topicName}.`,
        provenance: "observed" as const,
      }))
    : [];
  const partitionEdges = descriptor.partitions
    ? Array.from({ length: snapshot.partitionCount }, (_, partition) => ({
        id: `topic-partition-${partition}`,
        source: "topic",
        target: `partition-${partition}`,
        label: `P${partition} log`,
        provenance: "observed" as const,
      }))
    : [];

  return causalGraph(
    [...descriptor.nodes, ...partitionNodes].map((item) => ({
      id: item.id,
      title: item.title,
      description: item.description,
      provenance: modeAwareProvenance(snapshot, item.provenance),
      state: options.states?.[item.id] ?? (options.active ? "active" : "idle"),
      ...(options.metrics?.[item.id]
        ? { metric: options.metrics[item.id] }
        : {}),
    })),
    [...descriptor.edges, ...partitionEdges].map((item) => ({
      id: item.id,
      source: item.source,
      target: item.target,
      label: item.label,
      provenance: modeAwareProvenance(snapshot, item.provenance),
      scope: "current",
      active: Boolean(options.active) && !options.inactiveEdgeIds?.has(item.id),
    })),
  );
}

function modeAwareProvenance(
  snapshot: ScenarioExperienceSnapshot,
  provenance: Provenance,
): Provenance {
  if (snapshot.mode === "demo" && provenance === "observed") {
    return "simulated";
  }
  return provenance;
}

export function graphCountMetric(
  value: number,
  provenance: Provenance,
  scope: "current" | "run-total" | "recent-window" = "current",
) {
  return evidence(value, provenance, scope);
}
