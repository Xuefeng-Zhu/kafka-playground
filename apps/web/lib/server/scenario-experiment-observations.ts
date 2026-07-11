import "server-only";
import type {
  ConsumerSnapshot,
  KeyStrategy,
  PlaygroundMessage,
} from "@kplay/contracts";
import type { InternalRun } from "./playground-runtime-state";
import type { ScenarioExperimentObservations } from "./scenario-experiments";

type ObservationOperations = {
  produce: (keyStrategy: KeyStrategy) => Promise<PlaygroundMessage>;
  addConsumer: () => Promise<void>;
  processMessage: (
    messageId: string,
    expectedConsumerId: string,
    options?: { commit?: boolean },
  ) => Promise<void>;
  consumerLimit: number;
  activeConsumers: () => ConsumerSnapshot[];
};

export async function prepareScenarioExperimentObservations({
  run,
  experimentId,
  operations,
}: {
  run: InternalRun;
  experimentId: string;
  operations: ObservationOperations;
}): Promise<ScenarioExperimentObservations | undefined> {
  if (run.scenarioId === "partitioning") {
    return preparePartitioningObservations(run, experimentId, operations);
  }

  if (run.scenarioId === "fan-out-load-balancing") {
    return prepareLoadBalancingObservations(run, experimentId, operations);
  }

  return undefined;
}

async function preparePartitioningObservations(
  run: InternalRun,
  experimentId: string,
  operations: ObservationOperations,
): Promise<ScenarioExperimentObservations> {
  const growGroup = experimentId === "grow-consumer-group";
  const produced: PlaygroundMessage[] = growGroup
    ? run.messages.filter((message) =>
        run.scenarioState?.scenarioId === "partitioning"
          ? run.scenarioState.routingTraces.some(
              (trace) => trace.messageId === message.messageId,
            )
          : false,
      )
    : [];

  if (!growGroup) {
    for (const key of ["A", "B", "A"]) {
      produced.push(await operations.produce({ type: "fixed", value: key }));
    }
  }

  const simulateConsumerGrowth = growGroup && operations.consumerLimit < 3;
  if (!simulateConsumerGrowth) {
    const targetConsumerCount = growGroup ? 3 : 1;
    while (operations.activeConsumers().length < targetConsumerCount) {
      await operations.addConsumer();
    }
  }

  if (!simulateConsumerGrowth) {
    for (const message of produced) {
      const timer = run.processingTimers.get(message.messageId);
      if (timer) clearTimeout(timer);
      run.processingTimers.delete(message.messageId);
      if (message.assignedConsumerId) {
        await operations.processMessage(
          message.messageId,
          message.assignedConsumerId,
          { commit: growGroup || message !== produced.at(-1) },
        );
      }
    }
  }

  const assignmentEpoch =
    run.scenarioState?.scenarioId === "partitioning"
      ? run.scenarioState.assignmentEpoch + 1
      : 1;
  const experimentConsumers = simulateConsumerGrowth
    ? Array.from({ length: 3 }, (_, index) => ({
        consumerId: `guided-consumer-${index + 1}`,
        partitions: Array.from(
          { length: run.partitionCount },
          (_, partition) => partition,
        ).filter((partition) => partition % 3 === index),
      }))
    : operations.activeConsumers().map((consumer) => ({
        consumerId: consumer.consumerId,
        partitions: consumer.assignments.map(
          (assignment) => assignment.partition,
        ),
      }));
  const partitionPositions =
    simulateConsumerGrowth && run.scenarioState?.scenarioId === "partitioning"
      ? run.scenarioState.partitionPositions.map((position) => ({
          ...position,
        }))
      : Array.from({ length: run.partitionCount }, (_, partition) => {
          const partitionMessages = produced.filter(
            (message) => message.partition === partition,
          );
          const processed = partitionMessages
            .filter((message) =>
              ["processed", "commit_requested", "committed"].includes(
                message.state,
              ),
            )
            .at(-1);
          return {
            id: `partition-${partition}-position`,
            provenance: "simulated" as const,
            partition,
            processedOffset: processed?.offset ?? null,
            committedOffset:
              run.latestCommittedOffsets[String(partition)] ?? null,
          };
        });

  return {
    partitioning: {
      routingTraces: produced.flatMap((message, index) =>
        message.partition === null || message.offset === null
          ? []
          : [
              {
                id: `routing-${message.messageId}`,
                provenance: "simulated" as const,
                messageId: message.messageId,
                key: message.key,
                partition: message.partition,
                offset: message.offset,
                sequence: index + 1,
              },
            ],
      ),
      partitionPositions,
      consumers: experimentConsumers.map((consumer) => ({
        id: `assignment-${consumer.consumerId}-${assignmentEpoch}`,
        provenance: "simulated" as const,
        consumerId: consumer.consumerId,
        partitions: consumer.partitions,
        status: consumer.partitions.length > 0 ? "running" : "idle",
        epoch: assignmentEpoch,
      })),
      assignmentEpoch,
    },
  };
}

async function prepareLoadBalancingObservations(
  run: InternalRun,
  experimentId: string,
  operations: ObservationOperations,
): Promise<ScenarioExperimentObservations> {
  const routes: Array<{
    messageId: string;
    partition: number;
    offset: string;
  }> = [];
  if (experimentId === "produce-unkeyed-burst") {
    for (let index = 0; index < 3; index += 1) {
      const message = await operations.produce({ type: "no_key" });
      if (message.partition !== null && message.offset !== null) {
        routes.push({
          messageId: message.messageId,
          partition: message.partition,
          offset: message.offset,
        });
      }
    }
  }

  const epochs: NonNullable<
    ScenarioExperimentObservations["loadBalancing"]
  >["epochs"] = [];
  if (experimentId === "grow-consumer-group") {
    // This lesson intentionally models four members independently of the
    // raw-control consumer pool, which can be capped below four.
    for (let epoch = 1; epoch <= 4; epoch += 1) {
      const memberIds = Array.from(
        { length: epoch },
        (_, index) => `consumer-${index + 1}`,
      );
      const assignments = memberIds.map((consumerId, memberIndex) => ({
        consumerId,
        partitions: Array.from(
          { length: run.partitionCount },
          (_, partition) => partition,
        ).filter((partition) => partition % epoch === memberIndex),
      }));
      epochs.push({
        id: `assignment-epoch-${epoch}`,
        provenance: "simulated",
        epoch,
        memberIds,
        assignments,
        idleConsumerIds: assignments
          .filter((assignment) => assignment.partitions.length === 0)
          .map((assignment) => assignment.consumerId),
      });
    }
  }

  return { loadBalancing: { epochs, routes } };
}
