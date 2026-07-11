import type { TeachingScenarioTestCase } from "./helpers";
import {
  base,
  complete,
  consumer,
  epoch,
  position,
  route,
  state,
  testCase,
} from "./helpers";

const partitioningInitial = state({
  ...base("partitioning"),
  routingTraces: [],
  partitionPositions: [position(0, null, null), position(1, null, null)],
  consumers: [],
  assignmentEpoch: 0,
});
const partitioningPivotal = state({
  ...partitioningInitial,
  revision: 1,
  experiment: complete("produce-keyed-record", 3),
  routingTraces: [
    route("route-a-1", "message-a-1", "A", 0, "0", 1),
    route("route-b-1", "message-b-1", "B", 1, "0", 2),
    route("route-a-2", "message-a-2", "A", 0, "1", 3),
  ],
  partitionPositions: [position(0, "1", "2"), position(1, "0", "1")],
  consumers: [consumer("consumer-1", [0, 1], "running")],
  assignmentEpoch: 1,
});
const partitioningContrast = state({
  ...partitioningPivotal,
  revision: 2,
  experiment: complete("grow-consumer-group"),
  consumers: [
    consumer("consumer-1", [0], "running"),
    consumer("consumer-2", [1], "running"),
    consumer("consumer-3", [], "idle"),
  ],
  assignmentEpoch: 2,
});

const assignmentInitial = state({
  ...base("fan-out-load-balancing"),
  epochs: [],
});
const assignmentPivotal = state({
  ...assignmentInitial,
  revision: 4,
  experiment: complete("grow-consumer-group", 4),
  epochs: [
    epoch(1, [[0, 1, 2]], []),
    epoch(2, [[0, 2], [1]], []),
    epoch(3, [[0], [1], [2]], []),
    epoch(4, [[0], [1], [2], []], ["consumer-4"]),
  ],
});
const assignmentContrast = state({
  ...assignmentPivotal,
  revision: 7,
  experiment: complete("produce-unkeyed-burst", 3),
});

export const routingAssignmentTestCases = [
  testCase(
    "partitioning",
    "What changed in routing and commit progress?",
    partitioningInitial,
    partitioningPivotal,
    partitioningContrast,
    "routing",
    ["routing-trace-count", 0],
    ["routing-trace-count", 3],
    ["idle-consumers", 1],
  ),
  testCase(
    "fan-out-load-balancing",
    "Why is the fourth group member idle?",
    assignmentInitial,
    assignmentPivotal,
    assignmentContrast,
    "assignment",
    ["assignment-members", 0],
    ["assignment-members", 4],
    ["assignment-unkeyed-routes", 3],
  ),
] as const satisfies readonly TeachingScenarioTestCase[];
