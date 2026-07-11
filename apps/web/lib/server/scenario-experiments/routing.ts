import "server-only";
import { complete, step, upsertById, upsertReducer } from "./shared";
import type {
  ScenarioExperimentHandler,
  ScenarioExperimentObservations,
  ScenarioExperimentTransition,
} from "./types";

export const buildPartitioningExperiment: ScenarioExperimentHandler<
  "partitioning"
> = ({ state, experimentId, startedAtVirtualMs, observations }) => {
  let transitions: ScenarioExperimentTransition[];

  const growGroup = experimentId === "grow-consumer-group";
  transitions = growGroup
    ? [
        step(
          "assign-consumers",
          "Assign three consumers",
          "group.assignment_changed",
          ["consumer-1", "consumer-2", "consumer-3"],
          100,
        ),
      ]
    : [
        step("route-key-a", "Route key A", "key.hashed", ["key-A"], 100),
        step("route-key-b", "Route key B", "key.hashed", ["key-B"], 100),
        step(
          "route-key-a-again",
          "Route key A again",
          "partition.order.extended",
          ["key-A"],
          100,
        ),
        step(
          "assign-primary-consumer",
          "Assign the processing consumer",
          "group.assignment_changed",
          ["consumer-1"],
          100,
        ),
      ];
  const observed = observations?.partitioning;
  const fallback: NonNullable<ScenarioExperimentObservations["partitioning"]> =
    {
      routingTraces: [
        route("routing-a-1", "partitioning-message-a-1", "A", 0, "0", 1),
        route("routing-b-1", "partitioning-message-b-1", "B", 1, "0", 2),
        route("routing-a-2", "partitioning-message-a-2", "A", 0, "1", 3),
      ],
      // Kafka commits the next offset to resume from. The second A is
      // processed at offset 1 but intentionally left uncommitted, so the
      // group would resume at that same offset after a restart.
      partitionPositions: [position(0, "1", "1"), position(1, "0", "1")],
      consumers: growGroup
        ? [
            consumer("consumer-1", [0], "running", 1),
            consumer("consumer-2", [1], "running", 1),
            consumer("consumer-3", [], "idle", 1),
          ]
        : [consumer("consumer-1", [0, 1], "running", 1)],
      assignmentEpoch: 1,
    };
  const partitioning = observed ?? {
    ...fallback,
    routingTraces: growGroup ? state.routingTraces : fallback.routingTraces,
    partitionPositions: growGroup
      ? state.partitionPositions
      : fallback.partitionPositions,
    assignmentEpoch: growGroup
      ? state.assignmentEpoch + 1
      : fallback.assignmentEpoch,
  };
  transitions = transitions.map((transition, index) => {
    const trace = transition.id.startsWith("route-")
      ? partitioning.routingTraces[index]
      : undefined;
    return trace
      ? {
          ...transition,
          entityIds: [
            trace.id,
            trace.messageId,
            `partition-${trace.partition}-position`,
            ...transition.entityIds,
          ],
          messageId: trace.messageId,
          partition: trace.partition,
          offset: trace.offset,
        }
      : transition.id === "assign-consumers" ||
          transition.id === "assign-primary-consumer"
        ? {
            ...transition,
            entityIds: [
              ...partitioning.consumers.map((consumer) => consumer.id),
              ...transition.entityIds,
            ],
          }
        : transition;
  });
  const nextState = complete(
    {
      ...state,
      ...partitioning,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildLoadBalancingExperiment: ScenarioExperimentHandler<
  "fan-out-load-balancing"
> = ({ state, experimentId, startedAtVirtualMs, observations }) => {
  const unkeyedBurst = experimentId === "produce-unkeyed-burst";
  const settingsOnly = experimentId === "balance-settings";
  const transitions = unkeyedBurst
    ? (observations?.loadBalancing?.routes.length
        ? observations.loadBalancing.routes
        : [0, 1, 2].map((partition) => ({
            messageId: `load-message-${partition + 1}`,
            partition,
            offset: "0",
          }))
      ).map((route, index) => ({
        ...step(
          `route-unkeyed-${index + 1}`,
          `Route unkeyed record ${index + 1}`,
          "record.partitioned",
          [route.messageId, `partition-${route.partition}`],
          100,
        ),
        messageId: route.messageId,
        partition: route.partition,
        offset: route.offset,
      }))
    : settingsOnly
      ? [
          step(
            "balance-settings",
            "Apply balance settings",
            "producer.settings_changed",
            ["producer"],
            100,
          ),
        ]
      : [1, 2, 3, 4].map((members) =>
          step(
            `members-${members}`,
            `Grow group to ${members}`,
            "group.assignment_changed",
            [
              `assignment-epoch-${members}`,
              ...Array.from(
                { length: members },
                (_, index) => `consumer-${index + 1}`,
              ),
            ],
            100,
          ),
        );
  const fallbackEpochs = [
    epoch(1, [[0, 1, 2]], []),
    epoch(2, [[0, 2], [1]], []),
    epoch(3, [[0], [1], [2]], []),
    epoch(4, [[0], [1], [2], []], ["consumer-4"]),
  ];
  const nextState = complete(
    {
      ...state,
      epochs:
        unkeyedBurst || settingsOnly
          ? state.epochs
          : observations?.loadBalancing?.epochs.length
            ? observations.loadBalancing.epochs
            : state.epochs.length
              ? state.epochs
              : fallbackEpochs,
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildHotPartitionExperiment: ScenarioExperimentHandler<
  "hot-partitions-key-skew"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const balanced = experimentId === "balanced-comparison";
  const transitions = balanced
    ? [
        step(
          "balanced",
          "Run no-key phase",
          "phase.completed",
          ["phase-balanced"],
          100,
        ),
        step(
          "compare",
          "Compare skew",
          "skew.compared",
          ["phase-hot", "phase-balanced"],
          100,
        ),
      ]
    : [
        step(
          "hot",
          "Run fixed-key phase",
          "phase.completed",
          ["phase-hot"],
          100,
        ),
      ];
  const hotPhase = phase(
    "phase-hot",
    "hot",
    [0, 8, 0, 0],
    [0, 100, 0, 0],
    8,
    "celebrity-user",
  );
  const balancedPhase = phase(
    "phase-balanced",
    "balanced",
    [2, 2, 2, 2],
    [25, 25, 25, 25],
    1,
    null,
  );
  const nextState = complete(
    {
      ...state,
      phases: balanced
        ? upsertById(state.phases, balancedPhase)
        : upsertById(state.phases, hotPhase),
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

export const buildCooperativeRebalancingExperiment: ScenarioExperimentHandler<
  "cooperative-rebalancing"
> = ({ state, experimentId, startedAtVirtualMs }) => {
  const simulated = "simulated" as const;

  const compare = experimentId === "compare-rebalance";
  const transitions = compare
    ? [
        step(
          "eager",
          "Run eager rebalance",
          "rebalance.eager",
          ["eager-comparison"],
          100,
        ),
        step(
          "sticky",
          "Run cooperative-sticky rebalance",
          "rebalance.cooperative",
          ["sticky-comparison"],
          100,
        ),
        step(
          "compare",
          "Compare disruption",
          "rebalance.compared",
          ["eager-comparison", "sticky-comparison"],
          100,
        ),
      ]
    : [
        step(
          "eager",
          "Run eager rebalance",
          "rebalance.eager",
          ["eager-comparison"],
          100,
        ),
      ];
  const before = [{ consumerId: "consumer-1", partitions: [0, 1, 2] }];
  const after = [
    { consumerId: "consumer-1", partitions: [0, 2] },
    { consumerId: "consumer-2", partitions: [1] },
  ];
  const eager = {
    id: "eager-comparison",
    provenance: simulated,
    strategy: "eager" as const,
    before,
    after,
    keptPartitions: [],
    movedPartitions: [
      {
        partition: 1,
        fromConsumerId: "consumer-1",
        toConsumerId: "consumer-2",
      },
    ],
    revokedPartitions: [0, 1, 2],
    pausedPartitions: [0, 1, 2],
  };
  const sticky = {
    id: "sticky-comparison",
    provenance: simulated,
    strategy: "cooperative_sticky" as const,
    before,
    after,
    keptPartitions: [0, 2],
    movedPartitions: [
      {
        partition: 1,
        fromConsumerId: "consumer-1",
        toConsumerId: "consumer-2",
      },
    ],
    revokedPartitions: [1],
    pausedPartitions: [1],
  };
  const nextState = complete(
    {
      ...state,
      comparisons: compare
        ? [eager, sticky].reduce(upsertReducer, state.comparisons)
        : upsertById(state.comparisons, eager),
    },
    experimentId,
    startedAtVirtualMs,
    transitions,
  );

  return { state: nextState, transitions };
};

function route(
  id: string,
  messageId: string,
  key: string,
  partition: number,
  offset: string,
  sequence: number,
) {
  return {
    id,
    provenance: "simulated" as const,
    messageId,
    key,
    partition,
    offset,
    sequence,
  };
}

function position(
  partition: number,
  processedOffset: string,
  committedOffset: string,
) {
  return {
    id: `partition-${partition}-position`,
    provenance: "simulated" as const,
    partition,
    processedOffset,
    committedOffset,
  };
}

function consumer(
  consumerId: string,
  partitions: number[],
  status: "running" | "idle",
  epoch: number,
) {
  return {
    id: `assignment-${consumerId}-${epoch}`,
    provenance: "simulated" as const,
    consumerId,
    partitions,
    status,
    epoch,
  };
}

function epoch(
  epochNumber: number,
  partitionSets: number[][],
  idleConsumerIds: string[],
) {
  const memberIds = partitionSets.map((_, index) => `consumer-${index + 1}`);
  return {
    id: `assignment-epoch-${epochNumber}`,
    provenance: "simulated" as const,
    epoch: epochNumber,
    memberIds,
    assignments: partitionSets.map((partitions, index) => ({
      consumerId: memberIds[index],
      partitions,
    })),
    idleConsumerIds,
  };
}

function phase(
  id: string,
  kind: "hot" | "balanced",
  partitionCounts: number[],
  percentages: number[],
  skewRatio: number,
  key: string | null,
) {
  const routes = partitionCounts.flatMap((count, partition) =>
    Array.from({ length: count }, (_, index) => ({
      messageId: `${id}-message-${partition}-${index}`,
      key,
      partition,
    })),
  );
  return {
    id,
    provenance: "simulated" as const,
    kind,
    total: partitionCounts.reduce((sum, count) => sum + count, 0),
    partitionCounts,
    percentages,
    skewRatio,
    routes,
  };
}
