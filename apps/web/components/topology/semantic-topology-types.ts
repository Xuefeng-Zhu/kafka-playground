import type { RunSnapshot } from "@kplay/contracts";
import type { TopologySelection } from "@/lib/client/topology-selection";

export type SemanticTopologyNodeProps = {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  onSelectMessage(messageId: string): void;
  onSelectNode(selection: TopologySelection): void;
  partitions: number[];
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  selectedScenarioNodeId: string | null;
  snapshot: RunSnapshot;
  taskNowMs: number;
};

export type CoreEntityId = "producer" | "topic" | "consumerGroup";
