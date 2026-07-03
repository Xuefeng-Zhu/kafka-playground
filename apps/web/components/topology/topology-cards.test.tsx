import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaygroundMessage } from "@kplay/contracts";
import { PartitionLane } from "./topology-cards";

describe("PartitionLane", () => {
  it("labels message chips with global message identity instead of partition offset only", () => {
    const onSelectMessage = vi.fn();

    render(
      <PartitionLane
        partition={1}
        messages={[
          playgroundMessage({
            messageId: "message-global-8",
            partition: 1,
            offset: "2",
            sequence: 8,
          }),
        ]}
        selectedMessageId={null}
        selected={false}
        active={false}
        latestOffset="2"
        committedOffset="1"
        messageCount={1}
        onSelect={vi.fn()}
        onSelectMessage={onSelectMessage}
      />,
    );

    const messageChip = screen.getByRole("button", {
      name: "m8@2 | P1@2 | message-global-8",
    });

    expect(messageChip.textContent).toBe("m8@2");
    fireEvent.click(messageChip);
    expect(onSelectMessage).toHaveBeenCalledWith("message-global-8");
  });
});

function playgroundMessage({
  messageId,
  partition,
  offset,
  sequence,
}: {
  messageId: string;
  partition: number;
  offset: string;
  sequence: number;
}): PlaygroundMessage {
  return {
    messageId,
    runId: "run-1",
    topic: "topic",
    partition,
    offset,
    key: null,
    value: {
      runId: "run-1",
      scenarioId: "fan-out-load-balancing",
      type: "fanout.activity",
      userId: "anonymous",
      sequence,
      createdAt: "2026-07-02T12:00:00.000Z",
      payload: {},
    },
    headers: {
      "x-playground-sequence": String(sequence),
    },
    timestamp: "2026-07-02T12:00:00.000Z",
    state: "produced",
    assignedConsumerId: null,
    committedOffset: null,
    createdAt: "2026-07-02T12:00:00.000Z",
    updatedAt: "2026-07-02T12:00:00.000Z",
  };
}
