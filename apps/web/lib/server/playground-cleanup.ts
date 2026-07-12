import "server-only";
import {
  isIncompleteCleanupStatus,
  type CleanupResult,
  type RuntimeEvent,
} from "@kplay/contracts";
import {
  cleanupAdapterWithinDeadline,
  DEFAULT_CLEANUP_OVERALL_TIMEOUT_MS,
  DEFAULT_CLEANUP_STEP_TIMEOUT_MS,
  disconnectConsumerWithinDeadline,
  waitForCleanupPrerequisite,
  type CleanupTimeouts,
} from "./playground-cleanup-deadlines";
import { clearProducerTimer } from "./producer-scheduler";
import type { InternalRun } from "./playground-runtime-state";

export async function cleanupPlaygroundRun({
  run,
  inFlightExperiment,
  pendingMutations,
  pendingRunScopedWork,
  emit,
  timeouts = {},
}: {
  run: InternalRun;
  inFlightExperiment: Promise<void> | undefined;
  pendingMutations: Promise<void> | undefined;
  pendingRunScopedWork: Promise<void>;
  emit(type: RuntimeEvent["type"], payload: Record<string, unknown>): void;
  timeouts?: Partial<CleanupTimeouts>;
}) {
  const cleanupTimeouts: CleanupTimeouts = {
    stepTimeoutMs: timeouts.stepTimeoutMs ?? DEFAULT_CLEANUP_STEP_TIMEOUT_MS,
    overallTimeoutMs:
      timeouts.overallTimeoutMs ?? DEFAULT_CLEANUP_OVERALL_TIMEOUT_MS,
  };
  const deadline = Date.now() + cleanupTimeouts.overallTimeoutMs;
  stopRunTimers(run);
  const prerequisiteResults = await Promise.all(
    [
      inFlightExperiment
        ? waitForCleanupPrerequisite({
            name: "experiment.settle",
            promise: inFlightExperiment,
            deadline,
            stepTimeoutMs: cleanupTimeouts.stepTimeoutMs,
          })
        : undefined,
      waitForCleanupPrerequisite({
        name: "work.cancel",
        promise: pendingRunScopedWork,
        deadline,
        stepTimeoutMs: cleanupTimeouts.stepTimeoutMs,
      }),
      pendingMutations
        ? waitForCleanupPrerequisite({
            name: "mutations.settle",
            promise: pendingMutations,
            deadline,
            stepTimeoutMs: cleanupTimeouts.stepTimeoutMs,
          })
        : undefined,
    ].filter((step) => step !== undefined),
  );
  const prerequisiteSteps = prerequisiteResults.filter(
    (step) => step.status === "failed",
  );
  stopRunTimers(run);

  const consumerDisconnectSteps = await Promise.all(
    [...run.consumerHandles].map(([consumerId, handle]) =>
      disconnectConsumerWithinDeadline({
        run,
        consumerId,
        handle,
        deadline,
        stepTimeoutMs: cleanupTimeouts.stepTimeoutMs,
      }),
    ),
  );

  run.scenarioState = null;
  run.virtualTimeMs = 0;
  run.inFlightExperimentId = null;
  run.completedExperimentIds.clear();
  run.status = "cleaning";
  run.cleanupStatus = "requested";
  emit("resource.cleanup_started", {
    message: "Runtime cleanup started.",
  });

  const prerequisiteFailed = prerequisiteSteps.some(
    (step) => step.status === "failed",
  );
  const consumerDisconnectFailed = consumerDisconnectSteps.some(
    (step) => step.status === "failed",
  );
  const adapterResult: CleanupResult =
    prerequisiteFailed || consumerDisconnectFailed
      ? {
          status: "failed",
          steps: [
            {
              name: "adapter.cleanup",
              status: "skipped",
              message:
                "Kafka resource cleanup was skipped until pending work settles and every consumer disconnects.",
            },
          ],
        }
      : await cleanupAdapterWithinDeadline({
          run,
          deadline,
          stepTimeoutMs: cleanupTimeouts.stepTimeoutMs,
        });
  const result = aggregateCleanupResults(
    [...prerequisiteSteps, ...consumerDisconnectSteps],
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
  return result;
}

function aggregateCleanupResults(
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
