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
