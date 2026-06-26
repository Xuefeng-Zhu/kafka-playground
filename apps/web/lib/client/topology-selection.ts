export type TopologySelection =
  | { type: "producer" }
  | { type: "topic" }
  | { type: "partition"; partition: number }
  | { type: "consumer"; consumerId: string };
