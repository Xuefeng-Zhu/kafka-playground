import { describe, expect, it, vi } from "vitest";
import { startConsumerRun, type ConsumerRunSource } from "./consumer-handlers";
import type { PlaygroundConsumerCallbacks } from "./index";

describe("consumer handlers", () => {
  it("only forwards object JSON payloads as consumed message values", async () => {
    const onMessage = vi.fn<PlaygroundConsumerCallbacks["onMessage"]>();
    const consumer = consumerSource([
      '{"eventId":"one"}',
      '["array"]',
      '"primitive"',
      "42",
      "null",
      "not-json",
    ]);

    await startConsumerRun(
      consumer,
      Promise.resolve(),
      {
        onAssigned: () => undefined,
        onRevoked: () => undefined,
        onMessage,
        onError: () => undefined,
      },
      {},
      () => ({ code: "Error", message: "failure" }),
    );

    await vi.waitFor(() => expect(onMessage).toHaveBeenCalledTimes(6));
    expect(onMessage.mock.calls.map(([message]) => message.value)).toEqual([
      { eventId: "one" },
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it("bounds startup when no lifecycle event reports readiness", async () => {
    vi.useFakeTimers();
    const onError = vi.fn<PlaygroundConsumerCallbacks["onError"]>();

    try {
      const startup = startConsumerRun(
        consumerSource([]),
        new Promise<void>(() => undefined),
        {
          onAssigned: () => undefined,
          onRevoked: () => undefined,
          onMessage: async () => undefined,
          onError,
        },
        {},
        (error) => ({
          code: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : "failure",
        }),
        1_000,
      );
      const rejection = expect(startup).rejects.toThrow(
        "Kafka consumer did not join its group within 1000ms.",
      );

      await vi.advanceTimersByTimeAsync(1_000);
      await rejection;
      await vi.waitFor(() =>
        expect(onError).toHaveBeenCalledWith({
          code: "ConsumerStartupTimeoutError",
          message: "Kafka consumer did not join its group within 1000ms.",
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

function consumerSource(values: string[]): ConsumerRunSource {
  return {
    async run({ eachMessage }) {
      for (const [index, value] of values.entries()) {
        await eachMessage({
          topic: "topic",
          partition: 0,
          message: {
            offset: index,
            key: null,
            value,
            headers: { "x-playground-event-id": `message-${index}` },
            timestamp: null,
          },
        });
      }
    },
  };
}
