import { describe, expect, it } from "vitest";
import {
  consumerSnapshot,
  playgroundMessage,
  runSnapshot,
} from "./run-snapshot-test-fixtures";
import { deriveRuntimeTopologyState } from "./runtime-topology-state";

describe("runtime topology state", () => {
  it("derives partitions, assignments, and the active owner once for every view", () => {
    const state = deriveRuntimeTopologyState(
      runSnapshot({
        partitionCount: 3,
        consumers: [
          consumerSnapshot({
            consumerId: "consumer-2",
            assignments: [{ topic: "kplay.test", partition: 2 }],
          }),
        ],
        recentMessages: [
          playgroundMessage({
            partition: 2,
            assignedConsumerId: null,
          }),
        ],
      }),
    );

    expect(state.partitions).toEqual([0, 1, 2]);
    expect(state.assignmentByPartition.get(2)).toEqual({
      consumerId: "consumer-2",
    });
    expect(state.activePartition).toBe(2);
    expect(state.activeConsumerId).toBe("consumer-2");
  });

  it("retains an explicitly active consumer while delivery is still pending", () => {
    const state = deriveRuntimeTopologyState(
      runSnapshot({
        recentMessages: [
          playgroundMessage({
            partition: null,
            assignedConsumerId: "consumer-1",
          }),
        ],
      }),
    );

    expect(state.activePartition).toBeNull();
    expect(state.activeConsumerId).toBe("consumer-1");
  });
});
