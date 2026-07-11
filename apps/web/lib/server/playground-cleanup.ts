import "server-only";
import {
  isIncompleteCleanupStatus,
  type CleanupResult,
  type RuntimeEvent,
} from "@kplay/contracts";
import { sanitizeKafkaError } from "@kplay/kafka-runtime";
import { logger } from "./logger";
import { clearProducerTimer } from "./producer-scheduler";
import type { InternalRun } from "./playground-runtime-state";

export async function cleanupPlaygroundRun({
  run,
  inFlightExperiment,
  pendingMutations,
  pendingRunScopedWork,
  emit,
}: {
  run: InternalRun;
  inFlightExperiment: Promise<void> | undefined;
  pendingMutations: Promise<void> | undefined;
  pendingRunScopedWork: Promise<void>;
  emit(type: RuntimeEvent["type"], payload: Record<string, unknown>): void;
}) {
  stopRunTimers(run);
  if (inFlightExperiment) await inFlightExperiment;
  await pendingRunScopedWork;
  if (pendingMutations) await pendingMutations;
  stopRunTimers(run);

  const consumerDisconnectSteps: CleanupResult["steps"] = [];
  for (const [consumerId, handle] of run.consumerHandles) {
    try {
      await handle.disconnect();
      run.consumerHandles.delete(consumerId);
      consumerDisconnectSteps.push({
        name: "consumer.disconnect",
        status: "completed",
        resourceName: consumerId,
      });
    } catch (error) {
      logger.warn(
        { err: error, runId: run.runId, consumerId },
        "Consumer cleanup failed",
      );
      consumerDisconnectSteps.push({
        name: "consumer.disconnect",
        status: "failed",
        resourceName: consumerId,
        message: sanitizeKafkaError(error).message,
      });
    }
  }

  run.scenarioState = null;
  run.virtualTimeMs = 0;
  run.inFlightExperimentId = null;
  run.completedExperimentIds.clear();
  run.status = "cleaning";
  run.cleanupStatus = "requested";
  emit("resource.cleanup_started", {
    message: "Runtime cleanup started.",
  });

  const consumerDisconnectFailed = consumerDisconnectSteps.some(
    (step) => step.status === "failed",
  );
  const adapterResult: CleanupResult = consumerDisconnectFailed
    ? {
        status: "failed",
        steps: [
          {
            name: "adapter.cleanup",
            status: "skipped",
            message:
              "Kafka resource cleanup was skipped until every consumer disconnects.",
          },
        ],
      }
    : await run.adapter.deleteRunResources(run).catch((error) => ({
        status: "failed" as const,
        steps: [
          {
            name: "adapter.cleanup",
            status: "failed" as const,
            message: sanitizeKafkaError(error).message,
          },
        ],
      }));
  const result = aggregateCleanupResults(
    consumerDisconnectSteps,
    adapterResult,
  );
  run.cleanupStatus = result.status;
  run.consumers = [];
  run.status = "stopped";
  emit(
    isIncompleteCleanupStatus(result.status)
      ? "resource.cleanup_failed"
      : "resource.cleanup_completed",
    { message: `Cleanup ${result.status}.` },
  );
  emit("run.stopped", { message: "Run stopped." });
  run.subscribers.clear();
}

export function aggregateCleanupResults(
  consumerDisconnectSteps: CleanupResult["steps"],
  adapterResult: CleanupResult,
): CleanupResult {
  const steps = [...consumerDisconnectSteps, ...adapterResult.steps];
  const hasFailure =
    isIncompleteCleanupStatus(adapterResult.status) ||
    steps.some((step) => step.status === "failed");
  if (!hasFailure) return { status: adapterResult.status, steps };

  const madeProgress = steps.some((step) =>
    ["completed", "requested"].includes(step.status),
  );
  return {
    status: madeProgress ? "partially_completed" : "failed",
    steps,
  };
}

function stopRunTimers(run: InternalRun) {
  clearProducerTimer(run);
  run.producerStatus = "stopped";
  for (const timer of run.processingTimers.values()) clearTimeout(timer);
  run.processingTimers.clear();
}
