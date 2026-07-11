export function ownersByPartition(
  assignments: readonly { consumerId: string; partitions: readonly number[] }[],
) {
  const owners = new Map<number, string>();
  for (const assignment of assignments) {
    for (const partition of assignment.partitions) {
      owners.set(partition, assignment.consumerId);
    }
  }
  return owners;
}
