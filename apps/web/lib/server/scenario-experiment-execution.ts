import "server-only";
import type {
  RunSnapshot,
  RuntimeEvent,
  ScenarioExperimentId,
  ScenarioState,
} from "@kplay/contracts";
import { ApiError } from "./api-errors";
import type { InternalRun } from "./playground-runtime-state";
import {
  buildScenarioExperimentResult,
  type ScenarioExperimentObservations,
} from "./scenario-experiments";
import type { ScenarioExperimentCheckpoint } from "./scenario-experiment-transaction";

type ExecuteScenarioExperimentInput = {
  run: InternalRun;
  experimentId: ScenarioExperimentId;
  prepareObservations: () => Promise<
    ScenarioExperimentObservations | undefined
  >;
  emit: (type: RuntimeEvent["type"], payload: Record<string, unknown>) => void;
  beginEventBuffer: () => void;
  discardEventBuffer: () => void;
  flushEventBuffer: () => void;
  captureCheckpoint: () => ScenarioExperimentCheckpoint;
  restoreCheckpoint: (checkpoint: ScenarioExperimentCheckpoint) => void;
  suspendTimers: () => void;
  restoreProducerStatus: (checkpoint: ScenarioExperimentCheckpoint) => void;
  resumeTimers: (checkpoint: ScenarioExperimentCheckpoint) => void;
  snapshot: () => RunSnapshot;
};

export async function executeScenarioExperiment({
  run,
  experimentId,
  prepareObservations,
  emit,
  beginEventBuffer,
  discardEventBuffer,
  flushEventBuffer,
  captureCheckpoint,
  restoreCheckpoint,
  suspendTimers,
  restoreProducerStatus,
  resumeTimers,
  snapshot,
}: ExecuteScenarioExperimentInput) {
  if (!run.scenarioState) {
    throw new ApiError(
      "SCENARIO_EXPERIMENT_UNAVAILABLE",
      "This experiment is unavailable for the active scenario.",
      409,
    );
  }

  run.inFlightExperimentId = experimentId;
  const startedAtVirtualMs = run.virtualTimeMs;
  let checkpoint: ScenarioExperimentCheckpoint | undefined;
  let timerSuspensionAttempted = false;
  let eventBufferInitializationAttempted = false;
  let eventBufferFinalized = false;
  let totalSteps = 0;
  let checkpointRestored = false;

  try {
    checkpoint = captureCheckpoint();
    timerSuspensionAttempted = true;
    suspendTimers();
    eventBufferInitializationAttempted = true;
    beginEventBuffer();

    const preview = buildScenarioExperimentResult({
      state: run.scenarioState,
      experimentId,
      startedAtVirtualMs,
    });
    totalSteps = preview.transitions.length;
    run.scenarioState = updateExperimentProgress(run.scenarioState, {
      status: "running",
      experimentId,
      stepIndex: 0,
      totalSteps,
      startedAtVirtualMs,
      completedAtVirtualMs: null,
      error: null,
    });
    emit("scenario.experiment.started", {
      scenarioId: run.scenarioId,
      experimentId,
      entityIds: [`scenario-${run.scenarioId}`],
      provenance: "simulated",
      virtualTimeMs: run.virtualTimeMs,
      step: {
        id: "experiment-started",
        index: 0,
        total: totalSteps,
        label: "Experiment started",
      },
    });

    // Keep the per-run guard observable to concurrent requests without
    // introducing wall-clock time into deterministic scenario execution.
    await Promise.resolve();
    const observations = await prepareObservations();
    const result = buildScenarioExperimentResult({
      state: run.scenarioState,
      experimentId,
      startedAtVirtualMs,
      observations,
    });

    result.transitions.forEach((transition, index) => {
      run.virtualTimeMs += transition.advanceMs;
      if (run.scenarioState) {
        run.scenarioState = updateExperimentProgress(
          {
            ...run.scenarioState,
            revision: run.scenarioState.revision + 1,
            virtualTimeMs: run.virtualTimeMs,
          } as ScenarioState,
          {
            status: "running",
            experimentId,
            stepIndex: index + 1,
            totalSteps,
            startedAtVirtualMs,
            completedAtVirtualMs: null,
            error: null,
          },
        );
      }
      emit("scenario.experiment.transition", {
        scenarioId: run.scenarioId,
        experimentId,
        entityIds: transition.entityIds,
        provenance: transition.provenance,
        virtualTimeMs: run.virtualTimeMs,
        messageId: transition.messageId,
        partition: transition.partition,
        offset: transition.offset,
        transition: transition.transition,
        step: {
          id: transition.id,
          index: index + 1,
          total: totalSteps,
          label: transition.label,
        },
      });
    });

    run.scenarioState = result.state;
    run.virtualTimeMs = result.state.virtualTimeMs;
    run.completedExperimentIds.add(experimentId);
    const lastStep = result.transitions.at(-1);
    emit("scenario.experiment.completed", {
      scenarioId: run.scenarioId,
      experimentId,
      entityIds: [`scenario-${run.scenarioId}`],
      provenance: "simulated",
      virtualTimeMs: run.virtualTimeMs,
      step: {
        id: "experiment-completed",
        index: totalSteps,
        total: totalSteps,
        label: lastStep?.label ?? "Experiment completed",
      },
    });
    restoreProducerStatus(checkpoint);
    flushEventBuffer();
    eventBufferFinalized = true;
    return snapshot();
  } catch (error) {
    if (eventBufferInitializationAttempted && !eventBufferFinalized) {
      discardEventBuffer();
      eventBufferFinalized = true;
    }
    if (checkpoint) {
      restoreCheckpoint(checkpoint);
      checkpointRestored = true;
    }
    const errorCode =
      error instanceof ApiError ? error.code : "SCENARIO_EXPERIMENT_FAILED";
    const message =
      error instanceof Error ? error.message : "Experiment execution failed.";
    const failedEventTotalSteps = Math.max(totalSteps, 1);
    if (run.scenarioState) {
      run.scenarioState = updateExperimentProgress(run.scenarioState, {
        status: "failed",
        experimentId,
        stepIndex: 0,
        totalSteps,
        startedAtVirtualMs,
        completedAtVirtualMs: run.virtualTimeMs,
        error: { code: errorCode, message },
      });
    }
    emit("scenario.experiment.failed", {
      scenarioId: run.scenarioId,
      experimentId,
      entityIds: [`scenario-${run.scenarioId}`],
      provenance: "simulated",
      virtualTimeMs: run.virtualTimeMs,
      errorCode,
      message,
      step: {
        id: "experiment-failed",
        index: run.scenarioState?.experiment.stepIndex ?? 0,
        total: failedEventTotalSteps,
        label: "Experiment failed",
      },
    });
    throw error;
  } finally {
    try {
      if (checkpoint) {
        try {
          if (!checkpointRestored) restoreProducerStatus(checkpoint);
        } finally {
          if (timerSuspensionAttempted) resumeTimers(checkpoint);
        }
      }
    } finally {
      try {
        if (eventBufferInitializationAttempted && !eventBufferFinalized) {
          discardEventBuffer();
          eventBufferFinalized = true;
        }
      } finally {
        run.inFlightExperimentId = null;
      }
    }
  }
}

function updateExperimentProgress(
  state: ScenarioState,
  experiment: ScenarioState["experiment"],
): ScenarioState {
  return { ...state, experiment } as ScenarioState;
}
