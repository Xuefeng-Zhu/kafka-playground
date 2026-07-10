export type TopologySelection =
  | { type: "producer" }
  | { type: "topic" }
  | { type: "consumerGroup" }
  | { type: "partition"; partition: number }
  | { type: "consumer"; consumerId: string }
  | { type: "scenarioNode"; nodeId: string };
