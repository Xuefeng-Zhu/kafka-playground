import "server-only";
import {
  isIncompleteCleanupStatus,
  type RunSnapshot,
  type RuntimeEvent,
  type ScenarioExperimentId,
  type ScenarioState,
} from "@kplay/contracts";
import { ApiError } from "./api-errors";
import type { InternalRun } from "./playground-runtime-state";
import {
  buildScenarioExperimentResult,
  type ScenarioExperimentObservations,
  type ScenarioExperimentTransition,
} from "./scenario-experiments";
import {
  ScenarioExperimentTransaction,
  type ScenarioExperimentCheckpoint,
} from "./scenario-experiment-transaction";

type ExecuteScenarioExperimentInput = {
  run: InternalRun;
  experimentId: ScenarioExperimentId;
  isCleanupSuperseded: () => boolean;
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

type ScenarioExperimentResult = {
  state: ScenarioState;
  transitions: ScenarioExperimentTransition[];
};

type ExecutionFailure = {
  error: unknown;
};

type ExperimentExecutionContext = {
  input: ExecuteScenarioExperimentInput;
  startedAtVirtualMs: number;
  transaction: ScenarioExperimentTransaction;
  totalSteps: number;
  failure?: ExecutionFailure;
  completedSnapshot?: RunSnapshot;
};

export async function executeScenarioExperiment(
  input: ExecuteScenarioExperimentInput,
) {
  assertExperimentAvailable(input.run);
  input.run.inFlightExperimentId = input.experimentId;
  const context = createExecutionContext(input);

  try {
    context.completedSnapshot = await performExperiment(context);
  } catch (error) {
    context.failure = { error };
    recoverFailedExperiment(context, error);
  } finally {
    finalizeExperiment(context);
  }

  return resolveExecutionResult(context);
}

function assertExperimentAvailable(run: InternalRun) {
  if (run.scenarioState) return;
  throw new ApiError(
    "SCENARIO_EXPERIMENT_UNAVAILABLE",
    "This experiment is unavailable for the active scenario.",
    409,
  );
}

function createExecutionContext(
  input: ExecuteScenarioExperimentInput,
): ExperimentExecutionContext {
  return {
    input,
    startedAtVirtualMs: input.run.virtualTimeMs,
    transaction: new ScenarioExperimentTransaction(input),
    totalSteps: 0,
  };
}

async function performExperiment(context: ExperimentExecutionContext) {
  initializeExperiment(context);
  const result = await prepareExperimentResult(context);
  applyExperimentTransitions(context, result.transitions);
  completeExperiment(context, result);
  return captureCompletedSnapshot(context);
}

function initializeExperiment(context: ExperimentExecutionContext) {
  const { input } = context;
  context.transaction.captureCheckpoint();
  context.transaction.suspendTimers();
  context.transaction.beginEventBuffer();

  const preview = buildScenarioExperimentResult({
    state: requireScenarioState(input.run),
    experimentId: input.experimentId,
    startedAtVirtualMs: context.startedAtVirtualMs,
  });
  context.totalSteps = preview.transitions.length;
  input.run.scenarioState = updateExperimentProgress(
    requireScenarioState(input.run),
    {
      status: "running",
      experimentId: input.experimentId,
      stepIndex: 0,
      totalSteps: context.totalSteps,
      startedAtVirtualMs: context.startedAtVirtualMs,
      completedAtVirtualMs: null,
      error: null,
    },
  );
  emitExperimentStarted(context);
}

function emitExperimentStarted(context: ExperimentExecutionContext) {
  const { run, experimentId, emit } = context.input;
  emit("scenario.experiment.started", {
    scenarioId: run.scenarioId,
    experimentId,
    entityIds: [`scenario-${run.scenarioId}`],
    provenance: "simulated",
    virtualTimeMs: run.virtualTimeMs,
    step: {
      id: "experiment-started",
      index: 0,
      total: context.totalSteps,
      label: "Experiment started",
    },
  });
}

async function prepareExperimentResult(
  context: ExperimentExecutionContext,
): Promise<ScenarioExperimentResult> {
  // Keep the per-run guard observable to concurrent requests without
  // introducing wall-clock time into deterministic scenario execution.
  await Promise.resolve();
  const observations = await context.input.prepareObservations();
  return buildScenarioExperimentResult({
    state: requireScenarioState(context.input.run),
    experimentId: context.input.experimentId,
    startedAtVirtualMs: context.startedAtVirtualMs,
    observations,
  });
}

function applyExperimentTransitions(
  context: ExperimentExecutionContext,
  transitions: ScenarioExperimentTransition[],
) {
  transitions.forEach((transition, index) => {
    applyExperimentTransition(context, transition, index);
  });
}

function applyExperimentTransition(
  context: ExperimentExecutionContext,
  transition: ScenarioExperimentTransition,
  index: number,
) {
  const { run, experimentId, emit } = context.input;
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
        totalSteps: context.totalSteps,
        startedAtVirtualMs: context.startedAtVirtualMs,
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
      total: context.totalSteps,
      label: transition.label,
    },
  });
}

function completeExperiment(
  context: ExperimentExecutionContext,
  result: ScenarioExperimentResult,
) {
  const { run, experimentId, emit } = context.input;
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
      index: context.totalSteps,
      total: context.totalSteps,
      label: lastStep?.label ?? "Experiment completed",
    },
  });
}

function captureCompletedSnapshot(context: ExperimentExecutionContext) {
  const { input } = context;
  if (cleanupSupersededExperiment(context)) {
    context.transaction.discardEventBuffer();
    return input.snapshot();
  }
  context.transaction.restoreProducerStatus();
  context.transaction.flushEventBuffer();
  return input.snapshot();
}

function recoverFailedExperiment(
  context: ExperimentExecutionContext,
  error: unknown,
) {
  context.transaction.discardEventBuffer();
  if (cleanupSupersededExperiment(context)) return;
  context.transaction.restoreCheckpoint();
  const failure = describeExperimentFailure(error);
  markExperimentFailed(context, failure);
  emitExperimentFailed(context, failure);
}

function describeExperimentFailure(error: unknown) {
  return {
    errorCode:
      error instanceof ApiError ? error.code : "SCENARIO_EXPERIMENT_FAILED",
    message:
      error instanceof Error ? error.message : "Experiment execution failed.",
  };
}

function markExperimentFailed(
  context: ExperimentExecutionContext,
  failure: ReturnType<typeof describeExperimentFailure>,
) {
  const { run, experimentId } = context.input;
  const stateForFailure =
    run.scenarioState ?? context.transaction.checkpoint?.scenarioState;
  if (!stateForFailure) return;
  run.scenarioState = updateExperimentProgress(stateForFailure, {
    status: "failed",
    experimentId,
    stepIndex: 0,
    totalSteps: context.totalSteps,
    startedAtVirtualMs: context.startedAtVirtualMs,
    completedAtVirtualMs: run.virtualTimeMs,
    error: { code: failure.errorCode, message: failure.message },
  });
}

function emitExperimentFailed(
  context: ExperimentExecutionContext,
  failure: ReturnType<typeof describeExperimentFailure>,
) {
  const { run, experimentId, emit } = context.input;
  context.transaction.attemptRecovery("emit failed event", () => {
    emit("scenario.experiment.failed", {
      scenarioId: run.scenarioId,
      experimentId,
      entityIds: [`scenario-${run.scenarioId}`],
      provenance: "simulated",
      virtualTimeMs: run.virtualTimeMs,
      errorCode: failure.errorCode,
      message: failure.message,
      step: {
        id: "experiment-failed",
        index: run.scenarioState?.experiment.stepIndex ?? 0,
        total: Math.max(context.totalSteps, 1),
        label: "Experiment failed",
      },
    });
  });
}

function finalizeExperiment(context: ExperimentExecutionContext) {
  if (!cleanupSupersededExperiment(context)) {
    context.transaction.finalizeCheckpoint();
  }
  context.transaction.finalizeEventBuffer();
  context.input.run.inFlightExperimentId = null;
}

function cleanupSupersededExperiment(context: ExperimentExecutionContext) {
  const { run } = context.input;
  return (
    context.input.isCleanupSuperseded() ||
    run.status === "cleaning" ||
    run.status === "stopped" ||
    isIncompleteCleanupStatus(run.cleanupStatus)
  );
}

function resolveExecutionResult(context: ExperimentExecutionContext) {
  if (context.failure) return throwExecutionFailure(context);
  if (context.transaction.recoveryFailures.length > 0) {
    throw new AggregateError(
      context.transaction.recoveryFailures,
      "Experiment finalization failed.",
      { cause: context.transaction.recoveryFailures[0] },
    );
  }
  if (!context.completedSnapshot) {
    throw new Error("Experiment completed without producing a snapshot.");
  }
  return context.completedSnapshot;
}

function throwExecutionFailure(context: ExperimentExecutionContext): never {
  const primaryError = context.failure?.error;
  if (context.transaction.recoveryFailures.length === 0) throw primaryError;
  throw new AggregateError(
    [primaryError, ...context.transaction.recoveryFailures],
    `${errorMessage(primaryError)} Experiment recovery also failed.`,
    { cause: primaryError },
  );
}

function updateExperimentProgress(
  state: ScenarioState,
  experiment: ScenarioState["experiment"],
): ScenarioState {
  return { ...state, experiment } as ScenarioState;
}

function requireScenarioState(run: InternalRun): ScenarioState {
  if (run.scenarioState) return run.scenarioState;
  throw new Error("Scenario experiment state is unavailable during execution.");
}

function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Experiment execution failed.";
}
