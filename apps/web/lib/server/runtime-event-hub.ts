import "server-only";
import type { RunSnapshot, RuntimeEvent } from "@kplay/contracts";
import { logger } from "./logger";

export type RuntimeSubscriber = {
  id: string;
  enqueue: (
    event: RuntimeEvent | { type: "snapshot"; snapshot: RunSnapshot },
  ) => void;
};

export type RuntimeEventState = {
  runId: string;
  sequence: number;
  events: RuntimeEvent[];
  subscribers: Map<string, RuntimeSubscriber>;
};

export function subscribeToRun(
  run: RuntimeEventState,
  snapshot: RunSnapshot,
  lastEventId: number | null,
  subscriber: RuntimeSubscriber,
) {
  run.subscribers.set(subscriber.id, subscriber);
  if (!enqueueSafely(run, subscriber, { type: "snapshot", snapshot })) {
    return () => undefined;
  }

  const missed = lastEventId
    ? run.events.filter((event) => event.sequence > lastEventId)
    : [];
  for (const event of missed) {
    if (!enqueueSafely(run, subscriber, event)) {
      return () => undefined;
    }
  }

  return () => {
    run.subscribers.delete(subscriber.id);
  };
}

export function emitRuntimeEvent(
  run: RuntimeEventState,
  type: RuntimeEvent["type"],
  payload: Record<string, unknown>,
  eventHistoryLimit: number,
) {
  run.sequence += 1;
  const event = {
    eventId: crypto.randomUUID(),
    runId: run.runId,
    sequence: run.sequence,
    occurredAt: new Date().toISOString(),
    type,
    ...payload,
  } as RuntimeEvent;
  run.events.push(event);
  if (run.events.length > eventHistoryLimit) {
    run.events.splice(0, run.events.length - eventHistoryLimit);
  }
  for (const subscriber of run.subscribers.values()) {
    enqueueSafely(run, subscriber, event);
  }
}

function enqueueSafely(
  run: RuntimeEventState,
  subscriber: RuntimeSubscriber,
  event: RuntimeEvent | { type: "snapshot"; snapshot: RunSnapshot },
) {
  try {
    subscriber.enqueue(event);
    return true;
  } catch (error) {
    run.subscribers.delete(subscriber.id);
    logger.warn(
      { err: error, runId: run.runId, subscriberId: subscriber.id },
      "Removed failed runtime event subscriber",
    );
    return false;
  }
}
