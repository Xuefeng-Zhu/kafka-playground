import type { RuntimeEvent } from "@kplay/contracts";
import { describe, expect, it } from "vitest";
import {
  evidenceFocusForRuntimeEvent,
  experimentTransitionTrail,
  relatedGraphFocus,
} from "./definition-helpers";
import type { EntityDetailModel } from "./model";

const transition = (
  overrides: Partial<
    Extract<RuntimeEvent, { type: "scenario.experiment.transition" }>
  > = {},
): Extract<RuntimeEvent, { type: "scenario.experiment.transition" }> => ({
  eventId: "transition-1",
  runId: "run-1",
  sequence: 2,
  occurredAt: new Date(0).toISOString(),
  type: "scenario.experiment.transition",
  scenarioId: "partitioning",
  experimentId: "produce-keyed-record",
  entityIds: ["route-a-1"],
  provenance: "simulated",
  virtualTimeMs: 100,
  transition: "key.hashed",
  step: {
    id: "route-key-a",
    index: 1,
    total: 3,
    label: "Route key A",
  },
  ...overrides,
});

describe("scenario experience interaction helpers", () => {
  it("projects only the selected experiment's SSE transition trail", () => {
    const events: RuntimeEvent[] = [
      transition(),
      transition({
        eventId: "transition-contrast",
        sequence: 3,
        experimentId: "grow-consumer-group",
        virtualTimeMs: 200,
        step: {
          id: "assign-consumers",
          index: 1,
          total: 1,
          label: "Assign three consumers",
        },
      }),
      {
        eventId: "primary-rerun-started",
        runId: "run-1",
        sequence: 4,
        occurredAt: new Date(0).toISOString(),
        type: "scenario.experiment.started",
        scenarioId: "partitioning",
        experimentId: "produce-keyed-record",
        entityIds: ["scenario-partitioning"],
        provenance: "simulated",
        virtualTimeMs: 300,
        step: {
          id: "experiment-started",
          index: 0,
          total: 3,
          label: "Experiment started",
        },
      },
      transition({
        eventId: "transition-rerun-1",
        sequence: 5,
        virtualTimeMs: 400,
      }),
    ];

    expect(
      experimentTransitionTrail(events, "partitioning", "produce-keyed-record"),
    ).toEqual([
      expect.objectContaining({
        id: "transition-rerun-1",
        stepLabel: "Route key A",
        virtualTimeMs: 400,
        provenance: "simulated",
        focus: { kind: "event", id: "transition-rerun-1" },
      }),
    ]);
  });

  it("maps message and entity-only transition selections into evidence focus", () => {
    const details: Record<string, EntityDetailModel> = {
      "route-a-1": {
        entityId: "route-a-1",
        title: "Routing record",
        summary: "Key A routing evidence.",
        provenance: "simulated",
        graphEntityId: "key-router",
        facts: [],
        focus: {
          kind: "entity",
          id: "route-a-1",
          graphEntityId: "key-router",
        },
      },
    };
    const entityEvent = transition();
    expect(
      evidenceFocusForRuntimeEvent(
        { kind: "event", id: entityEvent.eventId },
        entityEvent,
        details,
      ),
    ).toEqual({
      kind: "entity",
      id: "route-a-1",
      graphEntityId: "key-router",
    });

    const messageEvent = transition({
      eventId: "transition-message",
      entityIds: ["message-a-1"],
      messageId: "message-a-1",
      partition: 0,
      offset: "4",
    });
    expect(
      evidenceFocusForRuntimeEvent(
        { kind: "event", id: messageEvent.eventId },
        messageEvent,
        details,
      ),
    ).toEqual({
      kind: "message",
      id: "message-a-1",
      partition: 0,
      offset: "4",
    });
  });

  it("prefers a matching evidence entity over a synthetic message reference", () => {
    const details: Record<string, EntityDetailModel> = {
      "delivery-2": {
        entityId: "delivery-2",
        title: "Second delivery",
        summary: "The same offset was redelivered.",
        provenance: "simulated",
        graphEntityId: "consumer-delivery",
        facts: [],
        focus: {
          kind: "entity",
          id: "delivery-2",
          graphEntityId: "consumer-delivery",
        },
      },
    };
    const duplicateEvent = transition({
      eventId: "duplicate-transition",
      entityIds: ["delivery-2"],
      messageId: "duplicate-message-42",
      partition: 1,
      offset: "42",
    });

    expect(
      evidenceFocusForRuntimeEvent(
        { kind: "event", id: duplicateEvent.eventId },
        duplicateEvent,
        details,
      ),
    ).toEqual({
      kind: "entity",
      id: "delivery-2",
      graphEntityId: "consumer-delivery",
    });
  });

  it("resolves an event evidence entity through its graph alias", () => {
    const details: Record<string, EntityDetailModel> = {
      "schema-attempt-v2": {
        entityId: "schema-attempt-v2",
        title: "Schema v2 attempt",
        summary: "The compatible schema passed the gate.",
        provenance: "simulated",
        graphEntityId: "compatibility-gate",
        facts: [],
        focus: {
          kind: "entity",
          id: "schema-attempt-v2",
          graphEntityId: "compatibility-gate",
        },
      },
    };
    const schemaEvent = transition({
      entityIds: ["schema-attempt-v2"],
    });
    const evidenceFocus = evidenceFocusForRuntimeEvent(
      { kind: "event", id: schemaEvent.eventId },
      schemaEvent,
      details,
    );

    expect(
      relatedGraphFocus(evidenceFocus, schemaEvent, ["compatibility-gate"]),
    ).toEqual({ kind: "entity", id: "compatibility-gate" });
  });
});
