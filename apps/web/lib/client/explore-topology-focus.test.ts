import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import {
  consumerSnapshot,
  playgroundMessage,
  runSnapshot,
} from "./run-snapshot-test-fixtures";
import {
  focusForTopologySelection,
  resolveExploreTopologyFocus,
} from "./explore-topology-focus";

describe("Explore topology focus", () => {
  it("maps every core topology selection to a stable FocusRef", () => {
    expect(focusForTopologySelection({ type: "producer" })).toEqual({
      kind: "entity",
      id: "producer",
    });
    expect(focusForTopologySelection({ type: "consumerGroup" })).toEqual({
      kind: "entity",
      id: "consumerGroup",
    });
    expect(
      focusForTopologySelection({ type: "partition", partition: 2 }),
    ).toEqual({ kind: "entity", id: "partition-2" });
    expect(
      focusForTopologySelection({
        type: "consumer",
        consumerId: "consumer-long-id",
      }),
    ).toEqual({ kind: "entity", id: "consumer:consumer-long-id" });
  });

  it("highlights a recent message and its partition from message focus", () => {
    const snapshot = runSnapshot({
      recentMessages: [
        playgroundMessage({ messageId: "message-42", partition: 1 }),
      ],
    });

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "message", id: "message-42" },
        selectedEvent: null,
      }),
    ).toEqual({
      selectedMessageId: "message-42",
      selectedCoreNode: { type: "partition", partition: 1 },
      selectedScenarioNodeId: null,
    });
  });

  it("resolves event message and partition references without replacing event focus", () => {
    const snapshot = runSnapshot({
      recentMessages: [
        playgroundMessage({ messageId: "message-42", partition: 1 }),
      ],
    });
    const event = experimentEvent({
      messageId: "message-42",
      partition: 1,
    });

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "event", id: event.eventId },
        selectedEvent: event,
      }),
    ).toEqual({
      selectedMessageId: "message-42",
      selectedCoreNode: { type: "partition", partition: 1 },
      selectedScenarioNodeId: null,
    });
  });

  it("resolves partition-only runtime events to core partition focus", () => {
    const snapshot = runSnapshot();
    const event = experimentEvent({ partition: 1 });

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "event", id: event.eventId },
        selectedEvent: event,
      }).selectedCoreNode,
    ).toEqual({ type: "partition", partition: 1 });
  });

  it("resolves consumer runtime events to existing core consumers", () => {
    const snapshot = runSnapshot({
      consumers: [consumerSnapshot({ consumerId: "consumer-1" })],
    });
    const event = consumerStartedEvent();

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "event", id: event.eventId },
        selectedEvent: event,
      }).selectedCoreNode,
    ).toEqual({ type: "consumer", consumerId: "consumer-1" });
  });

  it("resolves runtime event evidence entities through graph aliases", () => {
    const snapshot = runSnapshot();
    const event = experimentEvent({ entityIds: ["routing-evidence-1"] });

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "event", id: event.eventId },
        selectedEvent: event,
        entityDetails: {
          "routing-evidence-1": {
            entityId: "routing-evidence-1",
            title: "Routing evidence",
            summary: "A routed record",
            provenance: "simulated",
            graphEntityId: "topic",
            facts: [],
            focus: { kind: "entity", id: "routing-evidence-1" },
          },
        },
      }).selectedCoreNode,
    ).toEqual({ type: "topic" });
  });

  it("resolves evidence entities through graph aliases", () => {
    const snapshot = runSnapshot();
    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "schema-attempt-v2" },
        selectedEvent: null,
        entityDetails: {
          "schema-attempt-v2": {
            entityId: "schema-attempt-v2",
            title: "Compatible schema",
            summary: "Accepted by the gate",
            provenance: "simulated",
            graphEntityId: "topic",
            facts: [],
            focus: { kind: "entity", id: "schema-attempt-v2" },
          },
        },
      }),
    ).toEqual({
      selectedMessageId: null,
      selectedCoreNode: { type: "topic" },
      selectedScenarioNodeId: null,
    });
  });

  it("maps consumers and the group only when they exist in core topology", () => {
    const snapshot = runSnapshot({
      consumers: [consumerSnapshot({ consumerId: "consumer-1" })],
    });

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "consumer:consumer-1" },
        selectedEvent: null,
      }).selectedCoreNode,
    ).toEqual({ type: "consumer", consumerId: "consumer-1" });
    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "consumer-group" },
        selectedEvent: null,
      }).selectedCoreNode,
    ).toEqual({ type: "consumerGroup" });
  });

  it("does not fabricate a topology node for scenario-only or stale entities", () => {
    const snapshot = runSnapshot();
    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "compatibility-gate" },
        selectedEvent: null,
      }),
    ).toEqual({
      selectedMessageId: null,
      selectedCoreNode: null,
      selectedScenarioNodeId: null,
    });
    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "consumer:missing" },
        selectedEvent: null,
      }),
    ).toEqual({
      selectedMessageId: null,
      selectedCoreNode: null,
      selectedScenarioNodeId: null,
    });
  });

  it("selects scenario graph entities without fabricating a core node", () => {
    const snapshot = runSnapshot();

    expect(
      resolveExploreTopologyFocus({
        snapshot,
        focus: { kind: "entity", id: "schema-attempt-v2" },
        selectedEvent: null,
        entityDetails: {
          "schema-attempt-v2": {
            entityId: "schema-attempt-v2",
            title: "Compatible schema",
            summary: "Accepted by the gate",
            provenance: "simulated",
            graphEntityId: "compatibility-gate",
            facts: [],
            focus: { kind: "entity", id: "schema-attempt-v2" },
          },
        },
        scenarioNodeIds: new Set(["compatibility-gate"]),
      }),
    ).toEqual({
      selectedMessageId: null,
      selectedCoreNode: null,
      selectedScenarioNodeId: "compatibility-gate",
    });
  });
});

type ExperimentTransitionEvent = Extract<
  RuntimeEvent,
  { type: "scenario.experiment.transition" }
>;

function experimentEvent(
  overrides: Partial<ExperimentTransitionEvent> = {},
): ExperimentTransitionEvent {
  return {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: "2026-07-09T00:00:00.000Z",
    type: "scenario.experiment.transition",
    scenarioId: "partitioning",
    experimentId: "produce-keyed-record",
    entityIds: ["partition-1"],
    provenance: "simulated",
    virtualTimeMs: 100,
    transition: "key.hashed",
    step: {
      id: "route-message",
      index: 1,
      total: 1,
      label: "Route message",
    },
    ...overrides,
  } satisfies ExperimentTransitionEvent;
}

function consumerStartedEvent(): RuntimeEvent {
  return {
    eventId: "consumer-event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: "2026-07-09T00:00:00.000Z",
    type: "consumer.started",
    consumerId: "consumer-1",
  };
}
