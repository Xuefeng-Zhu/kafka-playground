import {
  coreNodes,
  descriptor,
  layout,
  scenarioEdge,
  scenarioNode,
} from "./helpers";
import type { ScenarioGraphDescriptorCatalogSubset } from "./model";

export const gateScenarioGraphDescriptors = {
  "schema-evolution-karapace": descriptor({
    scenarioId: "schema-evolution-karapace",
    replacesCoreProducerTopicEdge: true,
    nodes: [
      ...coreNodes({
        producer: layout(0),
        topic: layout(3),
        consumerGroup: layout(4),
      }),
      scenarioNode(
        "schema-registry",
        "Schema registry",
        "Stores demo schema versions.",
        "simulated",
        "schema",
        layout(1),
      ),
      scenarioNode(
        "compatibility-gate",
        "Compatibility gate",
        "Stops incompatible payloads before Kafka.",
        "simulated",
        "schema",
        layout(2),
      ),
    ],
    edges: [
      scenarioEdge(
        "producer-registry",
        "producer",
        "schema-registry",
        "candidate schema",
        "simulated",
        "data",
      ),
      scenarioEdge(
        "registry-gate",
        "schema-registry",
        "compatibility-gate",
        "field-level check",
        "simulated",
        "control",
      ),
      scenarioEdge(
        "gate-topic",
        "compatibility-gate",
        "topic",
        "accepted only",
        "simulated",
        "control",
      ),
      scenarioEdge(
        "topic-group",
        "topic",
        "consumerGroup",
        "safe payload",
        "observed",
        "data",
      ),
    ],
  }),
  "acl-least-privilege": descriptor({
    scenarioId: "acl-least-privilege",
    nodes: [
      ...coreNodes({
        producer: layout(2),
        topic: layout(3),
        consumerGroup: layout(4),
      }),
      scenarioNode(
        "principal-identity",
        "Kafka principal",
        "Identity requesting one operation.",
        "simulated",
        "acl",
        layout(0),
      ),
      scenarioNode(
        "authorization-gate",
        "Authorization gate",
        "Evaluates principal, operation, and resource before Kafka.",
        "simulated",
        "acl",
        layout(1),
      ),
    ],
    edges: [
      scenarioEdge(
        "principal-gate",
        "principal-identity",
        "authorization-gate",
        "permission request",
        "simulated",
        "control",
      ),
      scenarioEdge(
        "gate-producer",
        "authorization-gate",
        "producer",
        "allowed only",
        "simulated",
        "control",
      ),
      scenarioEdge(
        "producer-topic",
        "producer",
        "topic",
        "authorized operation",
        "observed",
        "data",
      ),
      scenarioEdge(
        "topic-group",
        "topic",
        "consumerGroup",
        "authorized read",
        "observed",
        "data",
      ),
    ],
  }),
} satisfies ScenarioGraphDescriptorCatalogSubset<
  "schema-evolution-karapace" | "acl-least-privilege"
>;
