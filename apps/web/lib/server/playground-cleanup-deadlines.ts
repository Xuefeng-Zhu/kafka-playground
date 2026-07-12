import "server-only";
import type { CleanupResult } from "@kplay/contracts";
import {
  sanitizeKafkaError,
  type PlaygroundConsumerHandle,
} from "@kplay/kafka-runtime";
import { logger } from "./logger";
import type { InternalRun } from "./playground-runtime-state";

export const DEFAULT_CLEANUP_STEP_TIMEOUT_MS = 5_000;
export const DEFAULT_CLEANUP_OVERALL_TIMEOUT_MS = 10_000;

export type CleanupTimeouts = {
  stepTimeoutMs: number;
  overallTimeoutMs: number;
};

type SettledWithin<T> =
  | { status: "completed"; value: T }
  | { status: "failed"; error: unknown; timedOut: boolean };

type DisconnectOutcome =
  | { status: "completed" }
  | { status: "failed"; error: unknown };

const consumerDisconnectAttempts = new WeakMap<
  PlaygroundConsumerHandle,
  Promise<DisconnectOutcome>
>();
const adapterCleanupAttempts = new WeakMap<
  InternalRun,
  Promise<CleanupResult>
>();

export async function waitForCleanupPrerequisite({
  name,
  promise,
  deadline,
  stepTimeoutMs,
}: {
  name: string;
  promise: Promise<void>;
  deadline: number;
  stepTimeoutMs: number;
}): Promise<CleanupResult["steps"][number]> {
  const settled = await settleWithinDeadline(
    promise,
    deadline,
    stepTimeoutMs,
    name,
  );
  if (settled.status === "completed") {
    return { name, status: "completed" };
  }
  return {
    name,
    status: "failed",
    message: cleanupFailureMessage(settled),
  };
}

export async function disconnectConsumerWithinDeadline({
  run,
  consumerId,
  handle,
  deadline,
  stepTimeoutMs,
}: {
  run: InternalRun;
  consumerId: string;
  handle: PlaygroundConsumerHandle;
  deadline: number;
  stepTimeoutMs: number;
}): Promise<CleanupResult["steps"][number]> {
  let attempt = consumerDisconnectAttempts.get(handle);
  if (!attempt) {
    attempt = Promise.resolve()
      .then(() => handle.disconnect())
      .then(
        (): DisconnectOutcome => ({ status: "completed" }),
        (error: unknown): DisconnectOutcome => ({ status: "failed", error }),
      )
      .finally(() => consumerDisconnectAttempts.delete(handle));
    consumerDisconnectAttempts.set(handle, attempt);
    void attempt.then((outcome) => {
      if (
        outcome.status === "completed" &&
        run.consumerHandles.get(consumerId) === handle
      ) {
        run.consumerHandles.delete(consumerId);
      }
    });
  }

  const settled = await settleWithinDeadline(
    attempt,
    deadline,
    stepTimeoutMs,
    `consumer ${consumerId} disconnect`,
  );
  if (settled.status === "failed") {
    logger.warn(
      { err: settled.error, runId: run.runId, consumerId },
      "Consumer cleanup failed",
    );
    return {
      name: "consumer.disconnect",
      status: "failed",
      resourceName: consumerId,
      message: cleanupFailureMessage(settled),
    };
  }
  if (settled.value.status === "completed") {
    return {
      name: "consumer.disconnect",
      status: "completed",
      resourceName: consumerId,
    };
  }

  logger.warn(
    { err: settled.value.error, runId: run.runId, consumerId },
    "Consumer cleanup failed",
  );
  return {
    name: "consumer.disconnect",
    status: "failed",
    resourceName: consumerId,
    message: sanitizeKafkaError(settled.value.error).message,
  };
}

export async function cleanupAdapterWithinDeadline({
  run,
  deadline,
  stepTimeoutMs,
}: {
  run: InternalRun;
  deadline: number;
  stepTimeoutMs: number;
}): Promise<CleanupResult> {
  let attempt = adapterCleanupAttempts.get(run);
  if (!attempt) {
    attempt = Promise.resolve()
      .then(() => run.adapter.deleteRunResources(run))
      .finally(() => adapterCleanupAttempts.delete(run));
    adapterCleanupAttempts.set(run, attempt);
  }
  const settled = await settleWithinDeadline(
    attempt,
    deadline,
    stepTimeoutMs,
    "adapter cleanup",
  );
  if (settled.status === "completed") return settled.value;
  return {
    status: "failed",
    steps: [
      {
        name: "adapter.cleanup",
        status: "failed",
        message: cleanupFailureMessage(settled),
      },
    ],
  };
}

function settleWithinDeadline<T>(
  promise: Promise<T>,
  deadline: number,
  stepTimeoutMs: number,
  label: string,
): Promise<SettledWithin<T>> {
  const timeoutMs = Math.max(0, Math.min(stepTimeoutMs, deadline - Date.now()));
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: SettledWithin<T>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(
      () =>
        finish({
          status: "failed",
          error: new Error(`${label} timed out after ${timeoutMs} ms.`),
          timedOut: true,
        }),
      timeoutMs,
    );
    promise.then(
      (value) => finish({ status: "completed", value }),
      (error: unknown) => finish({ status: "failed", error, timedOut: false }),
    );
  });
}

function cleanupFailureMessage(
  failure: Extract<SettledWithin<unknown>, { status: "failed" }>,
) {
  return failure.timedOut
    ? failure.error instanceof Error
      ? failure.error.message
      : "Cleanup timed out."
    : sanitizeKafkaError(failure.error).message;
}
