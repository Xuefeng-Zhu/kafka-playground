import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { RuntimeEvent } from "@kplay/contracts";
import { EventTimeline } from "./event-timeline";

describe("EventTimeline", () => {
  it("toggles all event filters off and back on", () => {
    render(
      <EventTimeline
        events={[messageProducedEvent(1), rebalanceEvent(2)]}
        hasSequenceGap={false}
        onSelect={vi.fn()}
      />,
    );

    const allFilter = screen.getByRole("button", { name: "All" });

    expect(allFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("message.produced")).not.toBeNull();
    expect(screen.queryByText("consumer.partitions_assigned")).not.toBeNull();

    fireEvent.click(allFilter);

    expect(allFilter.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("message.produced")).toBeNull();
    expect(screen.queryByText("consumer.partitions_assigned")).toBeNull();
    expect(
      screen.queryByText("Choose a filter to show timeline events."),
    ).not.toBeNull();

    fireEvent.click(allFilter);

    expect(allFilter.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("message.produced")).not.toBeNull();
    expect(screen.queryByText("consumer.partitions_assigned")).not.toBeNull();
  });

  it("shows task duration for commit-failed events", () => {
    render(
      <EventTimeline
        events={[messageReceivedEvent(1), commitFailedEvent(2)]}
        hasSequenceGap={false}
        onSelect={vi.fn()}
      />,
    );

    expect(
      screen.queryByText(
        "failed to commit offset 1 for topic partition 0 duration 2.4s",
      ),
    ).not.toBeNull();
  });

  it("highlights every event for the focused message and emits a stable event focus", () => {
    const onFocus = vi.fn();
    render(
      <EventTimeline
        events={[messageProducedEvent(1), messageReceivedEvent(2)]}
        focus={{ kind: "message", id: "message-1" }}
        hasSequenceGap={false}
        onFocus={onFocus}
      />,
    );

    const produced = screen.getByRole("button", {
      name: /message\.produced/i,
    });
    const received = screen.getByRole("button", {
      name: /message\.received/i,
    });

    expect(produced.getAttribute("aria-pressed")).toBe("true");
    expect(received.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(received);
    expect(onFocus).toHaveBeenCalledWith({ kind: "event", id: "event-2" });
  });
});

function eventBase(sequence: number) {
  return {
    eventId: `event-${sequence}`,
    runId: "run-1",
    sequence,
    occurredAt: "2026-07-02T12:00:00.000Z",
  };
}

function messageProducedEvent(sequence: number): RuntimeEvent {
  return {
    ...eventBase(sequence),
    type: "message.produced",
    messageId: "message-1",
    topic: "topic",
    partition: 0,
    offset: "0",
    key: "user-1",
    kafkaTimestamp: null,
  };
}

function rebalanceEvent(sequence: number): RuntimeEvent {
  return {
    ...eventBase(sequence),
    type: "consumer.partitions_assigned",
    consumerId: "consumer-1",
    assignments: [{ topic: "topic", partition: 0 }],
  };
}

function messageReceivedEvent(sequence: number): RuntimeEvent {
  return {
    ...eventBase(sequence),
    occurredAt: "2026-07-02T12:00:00.000Z",
    type: "message.received",
    messageId: "message-1",
    consumerId: "consumer-1",
    topic: "topic",
    partition: 0,
    offset: "0",
  };
}

function commitFailedEvent(sequence: number): RuntimeEvent {
  return {
    ...eventBase(sequence),
    occurredAt: "2026-07-02T12:00:02.400Z",
    type: "offset.commit_failed",
    messageId: "message-1",
    consumerId: "consumer-1",
    groupId: "group",
    topic: "topic",
    partition: 0,
    attemptedOffset: "1",
    errorCode: "COMMIT_FAILED",
  };
}
