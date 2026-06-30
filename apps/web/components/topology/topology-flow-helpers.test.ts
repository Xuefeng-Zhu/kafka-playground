import { describe, expect, it } from "vitest";
import {
  assignmentHandleTop,
  scenarioFlowNodeId,
  topologyEndpointId,
  topologyMetrics,
} from "./topology-flow-helpers";

describe("topology flow helpers", () => {
  it("uses compact metrics for narrow topology layouts", () => {
    expect(topologyMetrics("auto", true)).toEqual({
      producer: { x: 26, y: 116 },
      producerWidth: 170,
      topic: { x: 26, y: 320 },
      topicWidth: 332,
      consumerGroup: { x: 26, y: 610 },
      consumerGroupWidth: 332,
    });
  });

  it("keeps wide auto and spread layouts distinct", () => {
    expect(topologyMetrics("auto", false)).toMatchObject({
      producer: { x: 28, y: 214 },
      topic: { x: 312, y: 124 },
      consumerGroup: { x: 860, y: 182 },
    });
    expect(topologyMetrics("spread", false)).toMatchObject({
      producer: { x: 24, y: 236 },
      topic: { x: 344, y: 112 },
      consumerGroup: { x: 950, y: 172 },
    });
  });

  it("spreads assignment handles across the partition lane edge", () => {
    expect(assignmentHandleTop(0, 1)).toBe(50);
    expect(assignmentHandleTop(0, 3)).toBe(40);
    expect(assignmentHandleTop(1, 3)).toBe(50);
    expect(assignmentHandleTop(2, 3)).toBe(60);
  });

  it("maps scenario endpoints to React Flow node ids", () => {
    const scenarioNodeIds = new Set(["retry-topic"]);

    expect(scenarioFlowNodeId("retry-topic")).toBe("scenario-retry-topic");
    expect(topologyEndpointId("retry-topic", scenarioNodeIds)).toBe(
      "scenario-retry-topic",
    );
    expect(topologyEndpointId("topic", scenarioNodeIds)).toBe("topic");
  });
});
