import type { ConsumerSnapshot, RunSnapshot } from "@kplay/contracts";

type PartitionAssignment = { consumerId: string };

export function partitionAssignments(
  consumers: readonly ConsumerSnapshot[],
): Map<number, PartitionAssignment> {
  const assignments = new Map<number, PartitionAssignment>();
  for (const consumer of consumers) {
    for (const assignment of consumer.assignments) {
      assignments.set(assignment.partition, {
        consumerId: consumer.consumerId,
      });
    }
  }
  return assignments;
}

export function deriveRuntimeTopologyState(snapshot: RunSnapshot) {
  const partitions = Array.from(
    { length: snapshot.partitionCount },
    (_, partition) => partition,
  );
  const assignmentByPartition = partitionAssignments(snapshot.consumers);
  const latestMessage = snapshot.recentMessages.at(-1) ?? null;
  const activePartition = latestMessage?.partition ?? null;
  const activeConsumerId =
    latestMessage?.assignedConsumerId ??
    (activePartition === null
      ? null
      : (assignmentByPartition.get(activePartition)?.consumerId ?? null));

  return {
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    latestMessage,
    partitions,
  };
}
