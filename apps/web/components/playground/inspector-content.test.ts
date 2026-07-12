import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import {
  playgroundMessage,
  runSnapshot,
} from "@/lib/client/run-snapshot-test-fixtures";
import type { EntityDetailModel } from "@/lib/client/scenario-experience/model";
import { resolveInspectorContent } from "./inspector-content";

describe("resolveInspectorContent", () => {
  const run = runSnapshot();
  const message = playgroundMessage();
  const event = runtimeEvent();
  const detail = entityDetail();
  const onPreviousMessage = vi.fn();
  const onNextMessage = vi.fn();
  const base = {
    run,
    focus: null,
    showGuidedView: false,
    selectedTopologyNode: null,
    entityDetail: null,
    selectedEvent: null,
    selectedMessage: null,
    onPreviousMessage,
    onNextMessage,
  } satisfies Parameters<typeof resolveInspectorContent>[0];

  it.each([
    {
      name: "empty content without a run",
      overrides: { run: null },
      expected: { kind: "empty" },
    },
    {
      name: "free-explore topology selection",
      overrides: {
        focus: { kind: "entity" as const, id: "partition-1" },
        selectedTopologyNode: { type: "partition" as const, partition: 1 },
        entityDetail: detail,
      },
      expected: {
        kind: "topology",
        snapshot: run,
        selectedNode: { type: "partition", partition: 1 },
      },
    },
    {
      name: "guided evidence entity",
      overrides: {
        focus: { kind: "entity" as const, id: detail.entityId },
        showGuidedView: true,
        selectedTopologyNode: { type: "topic" as const },
        entityDetail: detail,
      },
      expected: { kind: "entity", detail },
    },
    {
      name: "selected runtime event and related message",
      overrides: {
        focus: { kind: "event" as const, id: event.eventId },
        selectedEvent: event,
        selectedMessage: message,
      },
      expected: {
        kind: "event",
        snapshot: run,
        event,
        relatedMessage: message,
      },
    },
    {
      name: "message fallback",
      overrides: {
        focus: { kind: "message" as const, id: message.messageId },
        selectedMessage: message,
      },
      expected: {
        kind: "message",
        snapshot: run,
        message,
        onPreviousMessage,
        onNextMessage,
      },
    },
  ])("resolves $name", ({ overrides, expected }) => {
    expect(resolveInspectorContent({ ...base, ...overrides })).toEqual(
      expected,
    );
  });
});

function runtimeEvent(): RuntimeEvent {
  return {
    eventId: "event-1",
    runId: "run-1",
    sequence: 1,
    occurredAt: "2026-07-11T00:00:00.000Z",
    type: "run.started",
  };
}

function entityDetail(): EntityDetailModel {
  return {
    entityId: "evidence-1",
    title: "Evidence",
    summary: "Observed evidence",
    provenance: "simulated",
    facts: [],
    focus: { kind: "entity", id: "evidence-1" },
  };
}
