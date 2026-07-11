export type TopologyLayout = "auto" | "spread";

export type TopologyLayoutMetrics = {
  producer: { x: number; y: number };
  producerWidth: number;
  topic: { x: number; y: number };
  topicWidth: number;
  consumerGroup: { x: number; y: number };
  consumerGroupWidth: number;
};

export function topologyMetrics(
  layout: TopologyLayout,
  compact: boolean,
): TopologyLayoutMetrics {
  if (compact) {
    return {
      producer: { x: 26, y: 116 },
      producerWidth: 170,
      topic: { x: 26, y: 320 },
      topicWidth: 332,
      consumerGroup: { x: 26, y: 610 },
      consumerGroupWidth: 332,
    };
  }

  return layout === "auto"
    ? {
        producer: { x: 28, y: 214 },
        producerWidth: 170,
        topic: { x: 312, y: 124 },
        topicWidth: 520,
        consumerGroup: { x: 860, y: 182 },
        consumerGroupWidth: 280,
      }
    : {
        producer: { x: 24, y: 236 },
        producerWidth: 190,
        topic: { x: 344, y: 112 },
        topicWidth: 560,
        consumerGroup: { x: 950, y: 172 },
        consumerGroupWidth: 310,
      };
}

export function assignmentHandleTop(index: number, assignmentCount: number) {
  if (assignmentCount <= 1) return 50;
  const first = 40;
  const last = 60;
  return first + (index * (last - first)) / (assignmentCount - 1);
}

export function scenarioFlowNodeId(id: string) {
  return `scenario-${id}`;
}

export function topologyEndpointId(
  id: string,
  scenarioNodeIds: ReadonlySet<string>,
) {
  return scenarioNodeIds.has(id) ? scenarioFlowNodeId(id) : id;
}
