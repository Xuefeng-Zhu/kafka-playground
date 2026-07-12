import { describe, expect, it } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import type { FocusRef } from "./scenario-experience/model";
import { runtimeEventMatchesFocus } from "./runtime-event-focus";

describe("runtimeEventMatchesFocus", () => {
  it.each([
    {
      name: "canonical consumer alias",
      event: rebalanceEvent,
      focus: { kind: "entity", id: "consumer:consumer-1" },
    },
    {
      name: "raw consumer evidence ID",
      event: rebalanceEvent,
      focus: { kind: "entity", id: "consumer-1" },
    },
    {
      name: "assigned partition alias",
      event: rebalanceEvent,
      focus: { kind: "entity", id: "partition-2" },
    },
    {
      name: "direct partition alias",
      event: producedEvent,
      focus: { kind: "entity", id: "partition-1" },
    },
    {
      name: "explicit evidence ID",
      event: experimentEvent,
      focus: { kind: "entity", id: "routing-evidence-1" },
    },
    {
      name: "graph entity alias",
      event: experimentEvent,
      focus: {
        kind: "entity",
        id: "evidence-row-1",
        graphEntityId: "routing-evidence-1",
      },
    },
  ] satisfies Array<{
    name: string;
    event: RuntimeEvent;
    focus: FocusRef;
  }>)("matches $name", ({ event, focus }) => {
    expect(runtimeEventMatchesFocus(event, focus)).toBe(true);
  });

  it("does not associate unrelated entities", () => {
    expect(
      runtimeEventMatchesFocus(rebalanceEvent, {
        kind: "entity",
        id: "partition-1",
      }),
    ).toBe(false);
  });
});

const eventBase = {
  eventId: "event-1",
  runId: "run-1",
  sequence: 1,
  occurredAt: "2026-07-11T00:00:00.000Z",
} as const;

const rebalanceEvent = {
  ...eventBase,
  type: "consumer.partitions_assigned",
  consumerId: "consumer-1",
  assignments: [{ topic: "topic", partition: 2 }],
} satisfies RuntimeEvent;

const producedEvent = {
  ...eventBase,
  type: "message.produced",
  messageId: "message-1",
  topic: "topic",
  partition: 1,
  offset: "0",
  key: null,
  kafkaTimestamp: null,
} satisfies RuntimeEvent;

const experimentEvent = {
  ...eventBase,
  type: "scenario.experiment.transition",
  scenarioId: "partitioning",
  experimentId: "produce-keyed-record",
  entityIds: ["routing-evidence-1"],
  provenance: "simulated",
  virtualTimeMs: 100,
  transition: "key.hashed",
  step: { id: "route", index: 1, total: 1, label: "Route record" },
} satisfies RuntimeEvent;
