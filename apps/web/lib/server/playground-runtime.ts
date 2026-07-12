import "server-only";
import {
  isIncompleteCleanupStatus,
  type KeyStrategy,
  type RemoteKafkaConfig,
  type UserSelectableKafkaMode,
  type RuntimeEvent,
  type ScenarioExperimentId,
} from "@kplay/contracts";
import {
  DemoKafkaRuntimeAdapter,
  createKafkaRuntimeAdapter,
  createUserConfiguredKafkaRuntimeAdapter,
  type KafkaRuntimeAdapter,
  type KafkaRuntimeDiagnostics,
} from "@kplay/kafka-runtime";
import {
  SCENARIOS,
  createResourceNames,
  createRunId,
  findScenario,
} from "@kplay/scenario-engine";
import { ApiError } from "./api-errors";
import { getServerEnv } from "./env";
import { logger } from "./logger";
import { cleanupPlaygroundRun } from "./playground-cleanup";
import { scheduleMessageProcessing } from "./playground-message-lifecycle";
import { clearProducerTimer, restartProducerTimer } from "./producer-scheduler";
import {
  emitRuntimeEvent,
  subscribeToRun,
  type RuntimeSubscriber,
} from "./runtime-event-hub";
import {
  createInternalRun,
  createRunSnapshot,
  type InternalRun,
} from "./playground-runtime-state";
import {
  DEFAULT_SESSION_ID,
  PlaygroundRunRegistry,
} from "./playground-run-registry";
import { PlaygroundRunLifecycle } from "./playground-run-lifecycle";
import { PlaygroundRuntimeConsumers } from "./playground-runtime-consumers";
import {
  PlaygroundRuntimeMessages,
  type PlaygroundRuntimeMessageDependencies,
} from "./playground-runtime-messages";
import {
  scenarioExperimentPrerequisite,
  supportsScenarioExperiment,
} from "./scenario-experiments";
import { executeScenarioExperiment } from "./scenario-experiment-execution";
import { prepareScenarioExperimentObservations } from "./scenario-experiment-observations";
import {
  captureScenarioExperimentCheckpoint,
  restoreScenarioExperimentCheckpoint,
  restoreScenarioExperimentProducerStatus,
  suspendScenarioExperimentTimers,
  type ScenarioExperimentCheckpoint,
} from "./scenario-experiment-transaction";

type BufferedRuntimeEvent = {
  type: RuntimeEvent["type"];
  payload: Record<string, unknown>;
};

export type PlaygroundRuntimeDependencies = {
  demoAdapter?: KafkaRuntimeAdapter;
  runRegistry?: PlaygroundRunRegistry;
  createMessages?: (
    dependencies: PlaygroundRuntimeMessageDependencies,
  ) => PlaygroundRuntimeMessages;
};

export class PlaygroundRuntime {
  private readonly env = getServerEnv();
  private readonly diagnostics: KafkaRuntimeDiagnostics = {
    onConsumerCallbackError: (event) => {
      logger.warn(
        {
          operation: event.operation,
          error: event.error,
        },
        "Kafka consumer callback failed",
      );
    },
    onDisconnectError: (event) => {
      logger.warn(
        {
          operation: event.operation,
          error: event.error,
        },
        "Kafka disconnect cleanup failed",
      );
    },
  };
  private readonly adapter: KafkaRuntimeAdapter;
  private readonly envAdapter: KafkaRuntimeAdapter = createKafkaRuntimeAdapter(
    this.env,
    this.diagnostics,
  );
  private readonly runs: PlaygroundRunRegistry;
  private readonly inFlightExperiments = new Map<string, Promise<void>>();
  private readonly runLifecycle = new PlaygroundRunLifecycle();
  private readonly reservedExperimentIds = new Map<
    string,
    ScenarioExperimentId
  >();
  private readonly bufferedExperimentEvents = new Map<
    string,
    BufferedRuntimeEvent[]
  >();
  private readonly messages: PlaygroundRuntimeMessages;
  private readonly consumers: PlaygroundRuntimeConsumers;
  private shutdownStarted = false;

  constructor(dependencies: PlaygroundRuntimeDependencies = {}) {
    this.adapter = dependencies.demoAdapter ?? new DemoKafkaRuntimeAdapter();
    this.runs = dependencies.runRegistry ?? new PlaygroundRunRegistry();
    const createMessages =
      dependencies.createMessages ??
      ((messageDependencies) =>
        new PlaygroundRuntimeMessages(messageDependencies));
    this.messages = createMessages({
      emit: (run, type, payload) => this.emit(run, type, payload),
      findRun: (runId) => this.findRun(runId),
      isCleanupRequested: (runId) =>
        this.runLifecycle.isCleanupRequested(runId),
      isMutationUnavailable: (run) => isRunMutationUnavailable(run),
      mutateRun: (runId, operation, options) =>
        this.mutateRun(runId, operation, options),
    });
    this.consumers = new PlaygroundRuntimeConsumers({
      emit: (run, type, payload) => this.emit(run, type, payload),
      findRun: (runId) => this.findRun(runId),
      isCleanupRequested: (runId) =>
        this.runLifecycle.isCleanupRequested(runId),
      isMutationUnavailable: (run) => isRunMutationUnavailable(run),
      consumerLimit: (run) => this.consumerLimit(run),
      deliverMessage: (run, message) => this.messages.deliver(run, message),
      handleConsumedMessage: (runId, consumerId, message) =>
        this.messages.handleConsumed(runId, consumerId, message),
    });
  }

  scenarios() {
    return SCENARIOS;
  }

  connection() {
    return this.envAdapter.testConnection();
  }

  testConnection(input: {
    mode: UserSelectableKafkaMode;
    remoteKafkaConfig?: RemoteKafkaConfig;
  }) {
    if (input.mode === "remote" && input.remoteKafkaConfig) {
      return createUserConfiguredKafkaRuntimeAdapter(
        input.remoteKafkaConfig,
        this.diagnostics,
      ).testConnection();
    }
    return this.adapter.testConnection();
  }

  async createRun(
    scenarioId: string,
    options: {
      mode?: UserSelectableKafkaMode;
      remoteKafkaConfig?: RemoteKafkaConfig;
    } = {},
    sessionId = DEFAULT_SESSION_ID,
  ) {
    const activeRun = this.runs.getSessionRun(sessionId);
    const previousCleanupIncomplete =
      activeRun && isIncompleteCleanupStatus(activeRun.cleanupStatus);
    if (
      activeRun &&
      (activeRun.status !== "stopped" || previousCleanupIncomplete)
    ) {
      throw new ApiError(
        "RUN_ALREADY_ACTIVE",
        previousCleanupIncomplete
          ? "The previous run still has resources that require cleanup."
          : "Only one scenario run can be active.",
        409,
      );
    }
    if (activeRun?.status === "stopped") {
      this.runs.deleteSessionRun(sessionId);
    }
    const scenario = findScenario(scenarioId);
    if (!scenario || scenario.disabled) {
      throw new ApiError(
        "SCENARIO_NOT_AVAILABLE",
        "This scenario is not available.",
        404,
      );
    }
    const adapter = this.createAdapterForRun(options);
    const runId = createRunId();
    const names = createResourceNames({
      prefix: this.env.KAFKA_TOPIC_PREFIX,
      scenarioId,
    });
    const run = createInternalRun({
      runId,
      adapter,
      mode: adapter.mode,
      scenario,
      names,
    });
    this.runs.setSessionRun(sessionId, run);
    this.emit(run, "topic.creating", {
      message: `Creating topic ${run.topicName}`,
    });
    try {
      await run.adapter.createRun(run);
      run.status = "running";
      this.emit(run, "topic.created", {
        message: `Topic created with ${scenario.topic.partitions} partitions.`,
      });
      this.emit(run, "run.started", { message: `${scenario.title} started.` });
      return this.snapshot(run.runId, sessionId);
    } catch (error) {
      if (isConfigurationError(error)) {
        logger.warn(
          { err: error, runId: run.runId },
          "Scenario run blocked by incomplete Kafka configuration",
        );
        this.runs.deleteSessionRun(sessionId);
        throw error;
      }
      logger.error(
        { err: error, runId: run.runId },
        "Failed to start scenario run",
      );
      run.status = "error";
      this.emit(run, "run.error", { message: "Failed to start run." });
      await this.cleanup(run);
      if (!isIncompleteCleanupStatus(run.cleanupStatus)) {
        this.runs.deleteSessionRun(sessionId);
      }
      throw error;
    }
  }

  snapshot(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.requireRun(runId, sessionId);
    return createRunSnapshot(
      run,
      this.consumerLimit(run),
      this.env.TIMELINE_DISPLAY_LIMIT,
    );
  }

  activeSnapshot(sessionId = DEFAULT_SESSION_ID) {
    const run = this.runs.getSessionRun(sessionId);
    if (
      !run ||
      (run.status === "stopped" &&
        !isIncompleteCleanupStatus(run.cleanupStatus))
    ) {
      return null;
    }
    return this.snapshot(run.runId, sessionId);
  }

  async updateSettings(
    runId: string,
    settings: Partial<
      Pick<
        InternalRun,
        "productionRate" | "keyStrategy" | "processingLatencyMs"
      >
    >,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      const scenario = this.scenarioForRun(run);
      if (settings.productionRate !== undefined) {
        if (
          settings.productionRate >
          Math.min(this.env.MAX_PRODUCE_RATE, scenario.limits.maxProduceRate)
        ) {
          throw new ApiError(
            "RATE_LIMIT_EXCEEDED",
            "Production rate exceeds the configured maximum.",
            429,
          );
        }
        run.productionRate = settings.productionRate;
        if (run.producerStatus === "running") {
          restartProducerTimer(run, (id) =>
            this.produceOne(id, undefined, sessionId),
          );
        }
      }
      if (settings.keyStrategy) run.keyStrategy = settings.keyStrategy;
      if (settings.processingLatencyMs !== undefined) {
        if (
          settings.processingLatencyMs <
            scenario.limits.minProcessingLatencyMs ||
          settings.processingLatencyMs > scenario.limits.maxProcessingLatencyMs
        ) {
          throw new ApiError(
            "LATENCY_OUT_OF_RANGE",
            "Processing latency is outside this scenario's limits.",
            400,
          );
        }
        run.processingLatencyMs = settings.processingLatencyMs;
      }
      return this.snapshot(runId, sessionId);
    });
  }

  async startProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      if (run.producerStatus === "running")
        return this.snapshot(runId, sessionId);
      run.producerStatus = "starting";
      this.emit(run, "producer.starting", { actor: "producer" });
      run.producerStatus = "running";
      this.emit(run, "producer.started", { actor: "producer" });
      restartProducerTimer(run, (id) =>
        this.produceOne(id, undefined, sessionId),
      );
      return this.snapshot(runId, sessionId);
    });
  }

  async pauseProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      clearProducerTimer(run);
      run.producerStatus = "paused";
      this.emit(run, "producer.paused", { actor: "producer" });
      return this.snapshot(runId, sessionId);
    });
  }

  async stopProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      clearProducerTimer(run);
      run.producerStatus = "stopped";
      this.emit(run, "producer.stopped", { actor: "producer" });
      return this.snapshot(runId, sessionId);
    });
  }

  async produceOne(
    runId: string,
    override?: KeyStrategy,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      await this.messages.produce(run, override);
      return this.snapshot(runId, sessionId);
    });
  }

  async addConsumer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      await this.addConsumerToRun(run);
      return this.snapshot(runId, sessionId);
    });
  }

  private async addConsumerToRun(run: InternalRun) {
    await this.consumers.add(run);
  }

  async stopConsumer(
    runId: string,
    consumerId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      await this.consumers.stop(run, consumerId);
      return this.snapshot(runId, sessionId);
    });
  }

  async crashConsumer(
    runId: string,
    consumerId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      await this.consumers.crash(run, consumerId);
      return this.snapshot(runId, sessionId);
    });
  }

  async runExperiment(
    runId: string,
    experimentId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    const run = this.requireRun(runId, sessionId);
    const reservedExperimentId = this.reservedExperimentIds.get(runId);
    if (
      this.runLifecycle.isCleanupRequested(runId) ||
      run.mode !== "demo" ||
      !run.scenarioState ||
      !supportsScenarioExperiment(run.scenarioState, experimentId) ||
      run.inFlightExperimentId ||
      reservedExperimentId
    ) {
      throw new ApiError(
        "SCENARIO_EXPERIMENT_UNAVAILABLE",
        run.inFlightExperimentId || reservedExperimentId
          ? `Experiment ${run.inFlightExperimentId ?? reservedExperimentId} is already running.`
          : run.mode !== "demo"
            ? "Teaching experiments are unavailable for remote Kafka runs because their deterministic evidence is demo-only."
            : "This experiment is unavailable for the active scenario.",
        409,
      );
    }
    const validatedExperimentId = experimentId;

    const prerequisite = scenarioExperimentPrerequisite(
      run.scenarioState,
      validatedExperimentId,
    );
    if (prerequisite && !run.completedExperimentIds.has(prerequisite)) {
      throw new ApiError(
        "SCENARIO_EXPERIMENT_UNAVAILABLE",
        `Complete experiment ${prerequisite} before running ${experimentId}.`,
        409,
      );
    }

    this.reservedExperimentIds.set(runId, validatedExperimentId);
    let resolveExperiment: (() => void) | undefined;
    const experimentCompleted = new Promise<void>((resolve) => {
      resolveExperiment = resolve;
    });
    this.inFlightExperiments.set(runId, experimentCompleted);
    try {
      return await this.mutateRun(
        runId,
        async () => {
          const currentRun = this.requireRun(runId, sessionId);
          if (
            this.runLifecycle.isCleanupRequested(runId) ||
            currentRun.mode !== "demo" ||
            !currentRun.scenarioState ||
            !supportsScenarioExperiment(
              currentRun.scenarioState,
              experimentId,
            ) ||
            currentRun.inFlightExperimentId
          ) {
            throw new ApiError(
              "SCENARIO_EXPERIMENT_UNAVAILABLE",
              "This experiment is unavailable for the active scenario.",
              409,
            );
          }
          const currentPrerequisite = scenarioExperimentPrerequisite(
            currentRun.scenarioState,
            validatedExperimentId,
          );
          if (
            currentPrerequisite &&
            !currentRun.completedExperimentIds.has(currentPrerequisite)
          ) {
            throw new ApiError(
              "SCENARIO_EXPERIMENT_UNAVAILABLE",
              `Complete experiment ${currentPrerequisite} before running ${validatedExperimentId}.`,
              409,
            );
          }
          return this.executeScenarioExperimentForRun(
            currentRun,
            validatedExperimentId,
            sessionId,
          );
        },
        { cleanupBehavior: "allow" },
      );
    } finally {
      if (this.reservedExperimentIds.get(runId) === validatedExperimentId) {
        this.reservedExperimentIds.delete(runId);
      }
      resolveExperiment?.();
      if (this.inFlightExperiments.get(runId) === experimentCompleted) {
        this.inFlightExperiments.delete(runId);
      }
    }
  }

  private async executeScenarioExperimentForRun(
    run: InternalRun,
    experimentId: ScenarioExperimentId,
    sessionId: string,
  ) {
    return executeScenarioExperiment({
      run,
      experimentId,
      isCleanupSuperseded: () =>
        this.runLifecycle.isCleanupRequested(run.runId) ||
        isRunMutationUnavailable(run),
      prepareObservations: () =>
        prepareScenarioExperimentObservations({
          run,
          experimentId,
          operations: {
            produce: (keyStrategy) => this.messages.produce(run, keyStrategy),
            addConsumer: () => this.addConsumerToRun(run),
            processMessage: (messageId, expectedConsumerId, options) =>
              this.messages.processInRun(
                run,
                messageId,
                expectedConsumerId,
                options,
              ),
            consumerLimit: this.consumerLimit(run),
            activeConsumers: () => this.consumers.active(run),
          },
        }),
      emit: (type, payload) => this.emit(run, type, payload),
      beginEventBuffer: () => this.bufferedExperimentEvents.set(run.runId, []),
      discardEventBuffer: () => this.bufferedExperimentEvents.delete(run.runId),
      flushEventBuffer: () => this.flushBufferedExperimentEvents(run),
      captureCheckpoint: () => captureScenarioExperimentCheckpoint(run),
      restoreCheckpoint: (checkpoint) =>
        restoreScenarioExperimentCheckpoint(run, checkpoint),
      suspendTimers: () => suspendScenarioExperimentTimers(run),
      restoreProducerStatus: (checkpoint) =>
        restoreScenarioExperimentProducerStatus(run, checkpoint.producerStatus),
      resumeTimers: (checkpoint) =>
        this.resumeScenarioExperimentTimers(run, checkpoint, sessionId),
      snapshot: () => this.snapshot(run.runId, sessionId),
    });
  }

  async reset(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.requireRun(runId, sessionId);
    await this.cleanup(run);
    if (!isIncompleteCleanupStatus(run.cleanupStatus)) {
      this.runs.deleteSessionRun(sessionId);
    }
    return { cleanupStatus: run.cleanupStatus };
  }

  async deleteRun(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.runs.getSessionRun(sessionId);
    if (!run || run.runId !== runId) {
      return { cleanupStatus: "completed" as const };
    }
    return this.reset(runId, sessionId);
  }

  subscribe(
    runId: string,
    lastEventId: number | null,
    subscriber: RuntimeSubscriber,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    const run = this.requireRun(runId, sessionId);
    return subscribeToRun(
      run,
      this.snapshot(runId, sessionId),
      lastEventId,
      subscriber,
    );
  }

  async shutdown() {
    if (this.shutdownStarted) return;
    this.shutdownStarted = true;
    for (const run of this.runs.values()) {
      await this.cleanup(run).catch((error) =>
        logger.error(
          { err: error, runId: run.runId },
          "Runtime shutdown cleanup failed",
        ),
      );
    }
    this.runs.clear();
    await this.adapter.shutdown();
    await this.envAdapter.shutdown();
  }

  private requireRun(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.runs.getOwnedRun(runId, sessionId);
    if (!run) {
      throw new ApiError(
        "RUN_NOT_FOUND",
        "The scenario run does not exist.",
        404,
      );
    }
    return run;
  }

  private findRun(runId: string) {
    return this.runs.findRun(runId);
  }

  private mutateRun<T>(
    runId: string,
    operation: () => T | Promise<T>,
    options: {
      cleanupBehavior?: "allow" | "reject" | "skip";
    } = {},
  ): Promise<T> {
    return this.runLifecycle.mutate(runId, operation, {
      cleanupBehavior: options.cleanupBehavior,
      cleanupInProgressError: () => this.cleanupInProgressError(),
      mutationUnavailableError: () => this.mutationUnavailableError(runId),
    });
  }

  private cleanupInProgressError() {
    return new ApiError(
      "RUN_CLEANUP_IN_PROGRESS",
      "The scenario run is being cleaned up.",
      409,
    );
  }

  private mutationUnavailableError(runId: string) {
    const run = this.findRun(runId);
    if (!run || !isRunMutationUnavailable(run)) {
      return null;
    }
    return new ApiError(
      "RUN_NOT_ACTIVE",
      "The scenario run cannot accept mutations until cleanup succeeds. Retry cleanup before starting a new run.",
      409,
    );
  }

  private resumeScenarioExperimentTimers(
    run: InternalRun,
    checkpoint: ScenarioExperimentCheckpoint,
    sessionId: string,
  ) {
    if (
      this.runLifecycle.isCleanupRequested(run.runId) ||
      isRunMutationUnavailable(run)
    ) {
      clearProducerTimer(run);
      run.producerStatus = "stopped";
      for (const timer of run.processingTimers.values()) clearTimeout(timer);
      run.processingTimers.clear();
      return;
    }
    for (const messageId of checkpoint.pendingProcessingMessageIds) {
      if (run.processingTimers.has(messageId)) continue;
      const message = run.messages.find((item) => item.messageId === messageId);
      if (
        !message?.assignedConsumerId ||
        !["received", "processing"].includes(message.state)
      ) {
        continue;
      }
      scheduleMessageProcessing(
        run,
        message,
        message.assignedConsumerId,
        (runId, scheduledMessageId, expectedConsumerId) =>
          this.messages.process(runId, scheduledMessageId, expectedConsumerId),
      );
    }
    if (run.producerStatus === "running") {
      restartProducerTimer(run, (runId) =>
        this.produceOne(runId, undefined, sessionId),
      );
    }
  }

  private flushBufferedExperimentEvents(run: InternalRun) {
    const events = this.bufferedExperimentEvents.get(run.runId) ?? [];
    this.bufferedExperimentEvents.delete(run.runId);
    for (const event of events) {
      emitRuntimeEvent(
        run,
        event.type,
        event.payload,
        this.env.EVENT_HISTORY_LIMIT,
      );
    }
  }

  private emit(
    run: InternalRun,
    type: RuntimeEvent["type"],
    payload: Record<string, unknown> = {},
  ) {
    if (this.runLifecycle.isCleanupRequested(run.runId)) return;
    const bufferedEvents = this.bufferedExperimentEvents.get(run.runId);
    if (bufferedEvents) {
      bufferedEvents.push({ type, payload: structuredClone(payload) });
      return;
    }
    emitRuntimeEvent(run, type, payload, this.env.EVENT_HISTORY_LIMIT);
  }

  private emitImmediately(
    run: InternalRun,
    type: RuntimeEvent["type"],
    payload: Record<string, unknown> = {},
  ) {
    emitRuntimeEvent(run, type, payload, this.env.EVENT_HISTORY_LIMIT);
  }

  private scenarioForRun(run: InternalRun) {
    const scenario = findScenario(run.scenarioId);
    if (!scenario)
      throw new ApiError(
        "SCENARIO_NOT_AVAILABLE",
        "This scenario is not available.",
        404,
      );
    return scenario;
  }

  private consumerLimit(run: InternalRun) {
    return Math.min(
      this.env.MAX_CONSUMERS_PER_RUN,
      this.scenarioForRun(run).limits.maxConsumers,
    );
  }

  private createAdapterForRun(options: {
    mode?: UserSelectableKafkaMode;
    remoteKafkaConfig?: RemoteKafkaConfig;
  }) {
    if (options.mode === "remote" && options.remoteKafkaConfig) {
      return createUserConfiguredKafkaRuntimeAdapter(
        options.remoteKafkaConfig,
        this.diagnostics,
      );
    }
    return this.adapter;
  }

  private cleanup(run: InternalRun) {
    return this.runLifecycle.cleanup(
      run.runId,
      (pendingMutations, retainRequestUntil) => {
        this.bufferedExperimentEvents.delete(run.runId);
        const inFlightExperiment = this.inFlightExperiments.get(run.runId);
        const pendingRunScopedWork = this.messages.cancelRunScopedWork(
          run.runId,
        );
        retainRequestUntil(
          inFlightExperiment,
          pendingMutations,
          pendingRunScopedWork,
        );
        return cleanupPlaygroundRun({
          run,
          inFlightExperiment,
          pendingMutations,
          pendingRunScopedWork,
          emit: (type, payload) => this.emitImmediately(run, type, payload),
        });
      },
    );
  }
}

function isConfigurationError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    [
      "AIVEN_CONFIGURATION_MISSING",
      "REMOTE_KAFKA_CONFIGURATION_MISSING",
    ].includes(String(error.code))
  );
}

function isRunMutationUnavailable(run: InternalRun) {
  return (
    run.status === "stopped" || isIncompleteCleanupStatus(run.cleanupStatus)
  );
}
