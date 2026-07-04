import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ConsumerSnapshot, PlaygroundMessage } from "@kplay/contracts";
import type { ConsumerTask } from "@/lib/client/current-consumer-task";
import { ConsumerCard, PartitionLane } from "./topology-cards";

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

  it("keeps long message chip labels from shrinking", () => {
    render(
      <PartitionLane
        partition={0}
        messages={[
          playgroundMessage({
            messageId: "e1460733-4d74-4ee5-ae96-7e9feb02f08b",
            partition: 0,
            offset: "96",
            sequence: 290,
          }),
        ]}
        selectedMessageId={null}
        selected={false}
        active={false}
        latestOffset="96"
        committedOffset="96"
        messageCount={1}
        onSelect={vi.fn()}
        onSelectMessage={vi.fn()}
      />,
    );

    const messageChip = screen.getByRole("button", {
      name: "m290@96 | P0@96 | e1460733-4d74-4ee5-ae96-7e9feb02f08b",
    });

    expect(messageChip.textContent).toBe("m290@96");
    expect(messageChip.className).toContain("shrink-0");
    expect(messageChip.className).toContain("whitespace-nowrap");
  });
});

describe("ConsumerCard", () => {
  it("shows active task count without task details", () => {
    render(
      <ConsumerCard
        consumer={consumerSnapshot()}
        currentTasks={[consumerTask()]}
        selected={false}
        active={true}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("Working:")).not.toBeNull();
    expect(screen.getByText("1 task")).not.toBeNull();
    expect(
      screen.queryByText("message-1 | P1@22 | received | 2.0s"),
    ).toBeNull();
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

function consumerSnapshot(): ConsumerSnapshot {
  return {
    consumerId: "consumer-1",
    status: "running",
    assignments: [{ topic: "topic", partition: 1 }],
    processedCount: 0,
    committedCount: 0,
  };
}

function consumerTask(): ConsumerTask {
  return {
    messageId: "message-1",
    label: "message-1",
    partitionOffset: "P1@22",
    state: "received",
    idempotencyKey: null,
    duration: {
      status: "active",
      milliseconds: 2000,
      startedAt: "2026-07-02T12:00:00.000Z",
      endedAt: null,
    },
  };
}
