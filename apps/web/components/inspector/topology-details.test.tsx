import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  consumerSnapshot,
  runSnapshot,
} from "@/lib/client/run-snapshot-test-fixtures";
import { TopologyDetails } from "./topology-details";

describe("TopologyDetails", () => {
  it("labels demo topology counts as simulated", () => {
    render(
      <TopologyDetails
        snapshot={runSnapshot({ mode: "demo" })}
        selectedNode={{ type: "topic" }}
        taskNowMs={0}
      />,
    );

    expect(screen.getByText("Total simulated messages")).not.toBeNull();
    expect(screen.queryByText("Total observed messages")).toBeNull();
  });

  it("labels remote topology counts as observed", () => {
    render(
      <TopologyDetails
        snapshot={runSnapshot({ mode: "remote" })}
        selectedNode={{ type: "partition", partition: 0 }}
        taskNowMs={0}
      />,
    );

    expect(screen.getByText("Observed messages")).not.toBeNull();
    expect(screen.queryByText("Simulated messages")).toBeNull();
  });

  it("shows consumer group ownership totals", () => {
    render(
      <TopologyDetails
        snapshot={runSnapshot({
          partitionCount: 2,
          consumers: [
            consumerSnapshot(),
            consumerSnapshot({
              consumerId: "consumer-2",
              assignments: [],
            }),
          ],
        })}
        selectedNode={{ type: "consumerGroup" }}
        taskNowMs={0}
      />,
    );

    expect(screen.getByText("Simulated group state")).not.toBeNull();
    expect(screen.getByText("1 of 2")).not.toBeNull();
    expect(screen.getByText("Idle members")).not.toBeNull();
  });
});
