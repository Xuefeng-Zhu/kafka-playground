import { countPayload, latestPayloadString } from "./scenario-metrics";
import {
  edge,
  model,
  node,
  type ScenarioTopologyContext,
  type ScenarioTopologyModel,
} from "./scenario-topology-model";

export function buildCooperativeRebalancingTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot } = context;
  const revocations = snapshot.recentEvents.filter(
    (event) => event.type === "consumer.partitions_revoked",
  ).length;
  const assignments = snapshot.consumers.reduce(
    (sum, consumer) => sum + consumer.assignments.length,
    0,
  );
  return model(
    [
      node({
        id: "rebalance-coordinator",
        title: "Rebalance coordinator",
        eyebrow: "Cooperative sticky",
        description: "Ownership moves incrementally as members change.",
        metricLabel: "Members",
        metricValue: String(snapshot.consumers.length),
        tone: "violet",
        icon: "rebalance",
        position: { x: 604, y: 32 },
        compactIndex: 0,
        details: [
          ["Members", String(snapshot.consumers.length)],
          ["Assignments", String(assignments)],
          ["Revocations", String(revocations)],
        ],
      }),
      node({
        id: "incremental-movement",
        title: "Incremental movement",
        eyebrow: "Reduced stop time",
        description: "Sticky assignment avoids full-group churn.",
        metricLabel: "Revokes",
        metricValue: String(revocations),
        tone: revocations > 0 ? "amber" : "emerald",
        icon: "balance",
        position: { x: 884, y: 404 },
        compactIndex: 1,
        details: [
          ["Revocations", String(revocations)],
          ["Assignments", String(assignments)],
          ["Strategy", "cooperative-sticky"],
        ],
      }),
    ],
    [
      edge("topic-to-rebalance", "topic", "rebalance-coordinator", "violet", {
        sourceHandle: "topic-empty-out",
        targetHandle: "left-in",
      }),
      edge(
        "rebalance-to-group",
        "rebalance-coordinator",
        "consumerGroup",
        "violet",
        {
          sourceHandle: "right-out",
          targetHandle: "empty-in",
          active: snapshot.consumers.length > 0,
        },
      ),
      edge(
        "rebalance-to-movement",
        "rebalance-coordinator",
        "incremental-movement",
        "amber",
        {
          sourceHandle: "bottom-out",
          targetHandle: "top-in",
          dashed: true,
          active: revocations > 0,
        },
      ),
    ],
  );
}

export function buildStreamsJoinsWindowsTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, latestMessage } = context;
  const late = countPayload(snapshot.recentMessages, "lateArrival", true);
  return model(
    [
      node({
        id: "orders-stream",
        title: "Orders stream",
        eyebrow: "Input A",
        description: "One side of the windowed join.",
        metricLabel: "Latest",
        metricValue:
          latestPayloadString(latestMessage, "streamName") ?? "orders",
        tone: "sky",
        icon: "stream",
        position: { x: 222, y: 32 },
        compactIndex: 0,
        details: [
          ["Stream", "orders"],
          ["Join key", latestPayloadString(latestMessage, "joinKey") ?? "none"],
          [
            "Window start",
            latestPayloadString(latestMessage, "windowStartSecond") ?? "0",
          ],
        ],
      }),
      node({
        id: "payments-stream",
        title: "Payments stream",
        eyebrow: "Input B",
        description: "The matching side for the join key.",
        metricLabel: "Late",
        metricValue: String(late),
        tone: late > 0 ? "amber" : "violet",
        icon: "stream",
        position: { x: 222, y: 408 },
        compactIndex: 1,
        details: [
          ["Stream", "payments"],
          ["Late arrivals", String(late)],
          ["Grace", "open while on time"],
        ],
      }),
      node({
        id: "window-state-store",
        title: "Window state store",
        eyebrow: "Join memory",
        description: "State holds records until the window closes.",
        metricLabel: "Key",
        metricValue: latestPayloadString(latestMessage, "joinKey") ?? "ready",
        tone: "emerald",
        icon: "projection",
        position: { x: 884, y: 404 },
        compactIndex: 2,
        details: [
          ["Join key", latestPayloadString(latestMessage, "joinKey") ?? "none"],
          [
            "Window end",
            latestPayloadString(latestMessage, "windowEndSecond") ?? "60",
          ],
          ["Late arrivals", String(late)],
        ],
      }),
    ],
    [
      edge("orders-to-state", "orders-stream", "window-state-store", "sky", {
        sourceHandle: "right-out",
        targetHandle: "left-in",
      }),
      edge(
        "payments-to-state",
        "payments-stream",
        "window-state-store",
        "violet",
        {
          sourceHandle: "right-out",
          targetHandle: "left-in",
        },
      ),
      edge("state-to-group", "window-state-store", "consumerGroup", "emerald", {
        sourceHandle: "right-out",
        targetHandle: "empty-in",
      }),
    ],
  );
}

export function buildAclLeastPrivilegeTopology(
  context: ScenarioTopologyContext,
): ScenarioTopologyModel {
  const { snapshot, latestMessage } = context;
  const denied = countPayload(snapshot.recentMessages, "authorized", false);
  return model(
    [
      node({
        id: "principal-identity",
        title: "Principal identity",
        eyebrow: "Credential",
        description: "Kafka evaluates the authenticated principal.",
        metricLabel: "Principal",
        metricValue: latestPayloadString(latestMessage, "principal") ?? "ready",
        tone: "sky",
        icon: "acl",
        position: { x: 222, y: 32 },
        compactIndex: 0,
        details: [
          [
            "Principal",
            latestPayloadString(latestMessage, "principal") ?? "none",
          ],
          [
            "Operation",
            latestPayloadString(latestMessage, "operation") ?? "none",
          ],
          [
            "Resource",
            latestPayloadString(latestMessage, "resource") ?? "secured.orders",
          ],
        ],
      }),
      node({
        id: "authorization-gate",
        title: "Authorization gate",
        eyebrow: "ACL check",
        description: "Least privilege blocks unsafe operations.",
        metricLabel: "Denied",
        metricValue: String(denied),
        tone: denied > 0 ? "rose" : "emerald",
        icon: "acl",
        position: { x: 604, y: 32 },
        compactIndex: 1,
        details: [
          ["Denied", String(denied)],
          [
            "Authorized",
            latestPayloadString(latestMessage, "authorized") ?? "ready",
          ],
          [
            "Resource",
            latestPayloadString(latestMessage, "resource") ?? "secured.orders",
          ],
        ],
      }),
    ],
    [
      edge(
        "principal-to-gate",
        "principal-identity",
        "authorization-gate",
        "sky",
        {
          sourceHandle: "right-out",
          targetHandle: "left-in",
        },
      ),
      edge(
        "producer-to-auth",
        "producer",
        "authorization-gate",
        denied > 0 ? "rose" : "emerald",
        {
          sourceHandle: "producer-out",
          targetHandle: "left-in",
          active: denied > 0,
        },
      ),
      edge(
        "auth-to-topic",
        "authorization-gate",
        "topic",
        denied > 0 ? "rose" : "emerald",
        {
          sourceHandle: "right-out",
          targetHandle: "topic-in",
        },
      ),
    ],
  );
}
