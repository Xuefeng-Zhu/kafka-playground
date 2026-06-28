import type { RunSnapshot } from "@kplay/contracts";
import { buildScenarioTopology } from "./scenario-topology-builders";

export type {
  ScenarioTopologyEdge,
  ScenarioTopologyIcon,
  ScenarioTopologyModel,
  ScenarioTopologyNode,
  ScenarioTopologyTone,
} from "./scenario-topology-model";

export function deriveScenarioTopology(
  snapshot: RunSnapshot,
): ReturnType<typeof buildScenarioTopology> {
  return buildScenarioTopology(snapshot);
}
