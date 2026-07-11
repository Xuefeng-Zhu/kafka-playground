import "server-only";
import type {
  KeyStrategy,
  PlaygroundMessage,
  RemoteKafkaConfig,
  UserSelectableKafkaMode,
  RuntimeEvent,
  ScenarioExperimentId,
} from "@kplay/contracts";
import {
  DemoKafkaRuntimeAdapter,
  createKafkaRuntimeAdapter,
  createUserConfiguredKafkaRuntimeAdapter,
  sanitizeKafkaError,
  type ConsumedMessage,
  type KafkaRuntimeAdapter,
  type KafkaRuntimeDiagnostics,
} from "@kplay/kafka-runtime";
import {
  SCENARIOS,
  createHeaders,
  createPlaygroundValue,
  createResourceNames,
  createRunId,
  evaluateScenarioProcessing,
  findScenario,
} from "@kplay/scenario-engine";
import { ApiError } from "./api-errors";
import { getServerEnv } from "./env";
import { logger } from "./logger";
import {
  boundMessages,
  requeueMessagesForConsumer,
  scheduleMessageProcessing,
} from "./playground-message-lifecycle";
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
  private readonly adapter: KafkaRuntimeAdapter = new DemoKafkaRuntimeAdapter();
  private readonly envAdapter: KafkaRuntimeAdapter = createKafkaRuntimeAdapter(
    this.env,
    this.diagnostics,
  );
  private readonly runs = new PlaygroundRunRegistry();
  private readonly inFlightExperiments = new Map<string, Promise<void>>();
  private readonly runMutationTails = new Map<string, Promise<void>>();
  private readonly reservedExperimentIds = new Map<
    string,
    ScenarioExperimentId
  >();
  private readonly bufferedExperimentEvents = new Map<
    string,
    BufferedRuntimeEvent[]
  >();
  private readonly cleanupRequestedRunIds = new Set<string>();
  private readonly cleanupOperations = new Map<string, Promise<void>>();
  private shutdownStarted = false;

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
    if (activeRun && activeRun.status !== "stopped") {
      throw new ApiError(
        "RUN_ALREADY_ACTIVE",
        "Only one scenario run can be active.",
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
      this.runs.deleteSessionRun(sessionId);
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
    if (!run || run.status === "stopped") return null;
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
      await this.produceMessage(run, override);
      return this.snapshot(runId, sessionId);
    });
  }

  private async produceMessage(run: InternalRun, override?: KeyStrategy) {
    const keyStrategy = override ?? run.keyStrategy;
    const eventId = crypto.randomUUID();
    const messageKey = run.keyState.next(keyStrategy);
    const value = createPlaygroundValue({
      eventId,
      runId: run.runId,
      scenarioId: run.scenarioId,
      sequence: run.keyState.currentSequence,
      userId: messageKey,
    });
    const headers = createHeaders({
      runId: run.runId,
      eventId,
      scenarioId: run.scenarioId,
      sequence: run.keyState.currentSequence,
      keyStrategy,
    });
    const now = new Date().toISOString();
    const message: PlaygroundMessage = {
      messageId: eventId,
      runId: run.runId,
      topic: run.topicName,
      partition: null,
      offset: null,
      key: messageKey,
      value,
      headers,
      timestamp: null,
      state: "producing",
      assignedConsumerId: null,
      committedOffset: null,
      createdAt: now,
      updatedAt: now,
    };
    run.messages.push(message);
    boundMessages(run);
    this.emit(run, "message.producing", {
      messageId: eventId,
      actor: "producer",
    });
    let delivery;
    try {
      delivery = await run.adapter.produce({
        runId: run.runId,
        topicName: run.topicName,
        key: messageKey,
        value,
        headers,
        keyStrategy,
      });
    } catch (error) {
      message.state = "failed";
      message.updatedAt = new Date().toISOString();
      run.messageCounts.failed += 1;
      this.emit(run, "run.error", {
        messageId: eventId,
        actor: "producer",
        message: "Message production failed.",
      });
      throw error;
    }
    message.partition = delivery.partition;
    message.offset = delivery.offset;
    message.timestamp = delivery.timestamp;
    message.state = "produced";
    message.updatedAt = new Date().toISOString();
    run.latestPartitionOffsets[String(delivery.partition)] = delivery.offset;
    run.messageCounts[String(delivery.partition)] =
      (run.messageCounts[String(delivery.partition)] ?? 0) + 1;
    run.messageCounts.produced += 1;
    this.emit(run, "message.produced", {
      messageId: eventId,
      topic: delivery.topic,
      partition: delivery.partition,
      offset: delivery.offset,
      key: messageKey,
      kafkaTimestamp: delivery.timestamp,
      actor: "producer",
    });
    if (run.mode === "demo") this.maybeDeliverMessage(run, message);
    return message;
  }

  async addConsumer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    return this.mutateRun(runId, async () => {
      const run = this.requireRun(runId, sessionId);
      await this.addConsumerToRun(run);
      return this.snapshot(runId, sessionId);
    });
  }

  private async addConsumerToRun(run: InternalRun) {
    const consumerLimit = this.consumerLimit(run);
    if (this.activeConsumers(run).length >= consumerLimit) {
      throw new ApiError(
        "CONSUMER_LIMIT_REACHED",
        `This scenario supports at most ${consumerLimit} consumers.`,
        409,
      );
    }
    const consumerId = this.nextConsumerId(run);
    this.emit(run, "consumer.starting", { consumerId, actor: consumerId });
    run.consumers.push({
      consumerId,
      status: "starting",
      assignments: [],
      processedCount: 0,
      committedCount: 0,
    });
    if (run.mode !== "demo") {
      try {
        const handle = await run.adapter.createConsumer(run, consumerId, {
          onAssigned: (assignments) =>
            this.applyConsumerAssignment(run.runId, consumerId, assignments),
          onRevoked: (assignments) =>
            this.applyConsumerRevocation(run.runId, consumerId, assignments),
          onMessage: (message) =>
            this.handleConsumedMessage(run.runId, consumerId, message),
          onError: (error) => {
            if (
              this.cleanupRequestedRunIds.has(run.runId) ||
              !this.findRun(run.runId)
            ) {
              return;
            }
            logger.error(
              { runId: run.runId, consumerId, error },
              "Kafka consumer error",
            );
            this.emit(run, "run.error", {
              message: error.message,
              actor: consumerId,
            });
          },
        });
        run.consumerHandles.set(consumerId, handle);
      } catch (error) {
        run.consumers = run.consumers.filter(
          (consumer) => consumer.consumerId !== consumerId,
        );
        this.emit(run, "run.error", {
          actor: consumerId,
          message: "Consumer failed to start.",
        });
        throw error;
      }
    }
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (consumer) consumer.status = "running";
    this.emit(run, "consumer.started", { consumerId, actor: consumerId });
    if (run.mode === "demo") {
      this.rebalanceAndDeliverProducedMessages(run);
    }
  }

  async stopConsumer(
    runId: string,
    consumerId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, () =>
      this.stopConsumerFromRun(runId, consumerId, sessionId),
    );
  }

  private async stopConsumerFromRun(
    runId: string,
    consumerId: string,
    sessionId: string,
  ) {
    const run = this.requireRun(runId, sessionId);
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer)
      throw new ApiError(
        "CONSUMER_NOT_FOUND",
        "The consumer does not exist.",
        404,
      );
    if (consumer.status === "crashed") {
      throw new ApiError(
        "CONSUMER_ALREADY_CRASHED",
        "The consumer has already crashed.",
        409,
      );
    }
    consumer.status = "stopping";
    this.emit(run, "consumer.stopping", { consumerId, actor: consumerId });
    await this.disconnectConsumerHandle(
      run,
      consumerId,
      "Consumer disconnect failed",
    );
    if (run.mode === "demo" && consumer.assignments.length > 0) {
      this.emitConsumerRevocation(run, consumerId, consumer.assignments);
    }
    run.consumers = run.consumers.filter(
      (item) => item.consumerId !== consumerId,
    );
    this.emit(run, "consumer.stopped", { consumerId, actor: consumerId });
    if (run.mode === "demo") {
      requeueMessagesForConsumer(run, consumerId);
      this.rebalanceAndDeliverProducedMessages(run);
    }
    return this.snapshot(runId, sessionId);
  }

  async crashConsumer(
    runId: string,
    consumerId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    return this.mutateRun(runId, () =>
      this.crashConsumerInRun(runId, consumerId, sessionId),
    );
  }

  private async crashConsumerInRun(
    runId: string,
    consumerId: string,
    sessionId: string,
  ) {
    const run = this.requireRun(runId, sessionId);
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer)
      throw new ApiError(
        "CONSUMER_NOT_FOUND",
        "The consumer does not exist.",
        404,
      );
    if (consumer.status === "crashed") return this.snapshot(runId, sessionId);

    this.emit(run, "consumer.crashing", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} is crashing.`,
    });
    await this.disconnectConsumerHandle(
      run,
      consumerId,
      "Consumer crash disconnect failed",
    );
    const assignments = consumer.assignments;
    if (assignments.length > 0) {
      this.emitConsumerRevocation(run, consumerId, assignments);
    }
    consumer.assignments = [];
    consumer.status = "crashed";
    requeueMessagesForConsumer(run, consumerId);
    this.emit(run, "consumer.crashed", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} crashed before a graceful shutdown.`,
    });

    if (run.mode === "demo") {
      this.rebalanceAndDeliverProducedMessages(run);
    }
    return this.snapshot(runId, sessionId);
  }

  async runExperiment(
    runId: string,
    experimentId: string,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    const run = this.requireRun(runId, sessionId);
    const reservedExperimentId = this.reservedExperimentIds.get(runId);
    if (
      this.cleanupRequestedRunIds.has(runId) ||
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
            this.cleanupRequestedRunIds.has(runId) ||
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
      prepareObservations: () =>
        prepareScenarioExperimentObservations({
          run,
          experimentId,
          operations: {
            produce: (keyStrategy) => this.produceMessage(run, keyStrategy),
            addConsumer: () => this.addConsumerToRun(run),
            processMessage: (messageId, expectedConsumerId, options) =>
              this.processMessageInRun(
                run,
                messageId,
                expectedConsumerId,
                options,
              ),
            consumerLimit: this.consumerLimit(run),
            activeConsumers: () => this.activeConsumers(run),
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
    this.runs.deleteSessionRun(sessionId);
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
    const cleanupBehavior = options.cleanupBehavior ?? "reject";
    if (cleanupBehavior !== "allow" && this.cleanupRequestedRunIds.has(runId)) {
      return cleanupBehavior === "skip"
        ? Promise.resolve(undefined as T)
        : Promise.reject(this.cleanupInProgressError());
    }
    const previous = this.runMutationTails.get(runId);
    let release: () => void = () => undefined;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.runMutationTails.set(runId, current);

    const execute = async () => {
      if (previous) await previous;
      try {
        if (
          cleanupBehavior !== "allow" &&
          this.cleanupRequestedRunIds.has(runId)
        ) {
          if (cleanupBehavior === "skip") return undefined as T;
          throw this.cleanupInProgressError();
        }
        return await operation();
      } finally {
        release();
        if (this.runMutationTails.get(runId) === current) {
          this.runMutationTails.delete(runId);
        }
      }
    };
    return execute();
  }

  private cleanupInProgressError() {
    return new ApiError(
      "RUN_CLEANUP_IN_PROGRESS",
      "The scenario run is being cleaned up.",
      409,
    );
  }

  private resumeScenarioExperimentTimers(
    run: InternalRun,
    checkpoint: ScenarioExperimentCheckpoint,
    sessionId: string,
  ) {
    if (this.cleanupRequestedRunIds.has(run.runId)) {
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
          this.processMessage(runId, scheduledMessageId, expectedConsumerId),
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
    const bufferedEvents = this.bufferedExperimentEvents.get(run.runId);
    if (bufferedEvents) {
      bufferedEvents.push({ type, payload: structuredClone(payload) });
      return;
    }
    emitRuntimeEvent(run, type, payload, this.env.EVENT_HISTORY_LIMIT);
  }

  private nextConsumerId(run: InternalRun) {
    const used = new Set(run.consumers.map((consumer) => consumer.consumerId));
    for (let index = 1; ; index += 1) {
      const candidate = `consumer-${index}`;
      if (!used.has(candidate)) return candidate;
    }
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

  private activeConsumers(run: InternalRun) {
    return run.consumers.filter((consumer) => consumer.status !== "crashed");
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

  private rebalance(run: InternalRun) {
    const active = this.activeConsumers(run);
    active.forEach((consumer) => {
      if (consumer.assignments.length > 0) {
        this.emit(run, "consumer.partitions_revoked", {
          consumerId: consumer.consumerId,
          assignments: consumer.assignments,
          actor: consumer.consumerId,
        });
      }
      consumer.assignments = [];
      consumer.status = "running";
    });
    for (let partition = 0; partition < run.partitionCount; partition += 1) {
      const consumer = active[partition % Math.max(active.length, 1)];
      if (consumer)
        consumer.assignments.push({ topic: run.topicName, partition });
    }
    active.forEach((consumer) => {
      if (consumer.assignments.length > 0) {
        this.emit(run, "consumer.partitions_assigned", {
          consumerId: consumer.consumerId,
          assignments: consumer.assignments,
          actor: consumer.consumerId,
        });
      } else {
        consumer.status = "idle";
        this.emit(run, "consumer.idle", {
          consumerId: consumer.consumerId,
          message: "No partition assignment is available for this consumer.",
          actor: consumer.consumerId,
        });
      }
    });
  }

  private async disconnectConsumerHandle(
    run: InternalRun,
    consumerId: string,
    failureMessage: string,
  ) {
    const handle = run.consumerHandles.get(consumerId);
    if (!handle) return;
    await handle.disconnect().catch((error) => {
      logger.warn({ err: error, runId: run.runId, consumerId }, failureMessage);
    });
    run.consumerHandles.delete(consumerId);
  }

  private emitConsumerRevocation(
    run: InternalRun,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    this.emit(run, "consumer.partitions_revoked", {
      consumerId,
      assignments,
      actor: consumerId,
    });
  }

  private rebalanceAndDeliverProducedMessages(run: InternalRun) {
    this.rebalance(run);
    for (const message of run.messages.filter(
      (item) => item.state === "produced",
    )) {
      this.maybeDeliverMessage(run, message);
    }
  }

  private maybeDeliverMessage(run: InternalRun, message: PlaygroundMessage) {
    if (
      message.partition === null ||
      message.offset === null ||
      message.state !== "produced"
    )
      return;
    const consumer = run.consumers.find((candidate) =>
      candidate.assignments.some(
        (assignment) => assignment.partition === message.partition,
      ),
    );
    if (!consumer) return;
    message.state = "received";
    message.assignedConsumerId = consumer.consumerId;
    message.updatedAt = new Date().toISOString();
    run.messageCounts.received += 1;
    this.emit(run, "message.received", {
      messageId: message.messageId,
      consumerId: consumer.consumerId,
      topic: run.topicName,
      partition: message.partition,
      offset: message.offset,
      actor: consumer.consumerId,
    });
    scheduleMessageProcessing(
      run,
      message,
      consumer.consumerId,
      (runId, messageId, expectedConsumerId) =>
        this.processMessage(runId, messageId, expectedConsumerId),
    );
  }

  private async handleConsumedMessage(
    runId: string,
    consumerId: string,
    consumed: ConsumedMessage,
  ) {
    if (this.cleanupRequestedRunIds.has(runId)) return;
    const run = this.findRun(runId);
    if (!run) return;
    const messageId =
      consumed.headers["x-playground-event-id"] ?? crypto.randomUUID();
    let message = run.messages.find((item) => item.messageId === messageId);
    if (!message) {
      const now = new Date().toISOString();
      message = {
        messageId,
        runId,
        topic: consumed.topic,
        partition: consumed.partition,
        offset: consumed.offset,
        key: consumed.key,
        value: consumed.value ?? {},
        headers: consumed.headers,
        timestamp: consumed.timestamp,
        state: "produced",
        assignedConsumerId: null,
        committedOffset: null,
        createdAt: now,
        updatedAt: now,
      };
      run.messages.push(message);
      boundMessages(run);
    }
    if (message.state !== "produced") return;
    message.partition = consumed.partition;
    message.offset = consumed.offset;
    message.timestamp = consumed.timestamp;
    message.headers = consumed.headers;
    message.assignedConsumerId = consumerId;
    message.state = "received";
    message.updatedAt = new Date().toISOString();
    run.messageCounts.received += 1;
    this.emit(run, "message.received", {
      messageId: message.messageId,
      consumerId,
      topic: consumed.topic,
      partition: consumed.partition,
      offset: consumed.offset,
      actor: consumerId,
    });
    await new Promise((resolve) =>
      setTimeout(resolve, run.processingLatencyMs),
    );
    if (this.cleanupRequestedRunIds.has(runId)) return;
    await this.processMessage(runId, message.messageId, consumerId);
  }

  private processMessage(
    runId: string,
    messageId: string,
    expectedConsumerId?: string,
    options: { commit?: boolean } = {},
  ) {
    return this.mutateRun(
      runId,
      async () => {
        const run = this.findRun(runId);
        if (!run) return;
        await this.processMessageInRun(
          run,
          messageId,
          expectedConsumerId,
          options,
        );
      },
      { cleanupBehavior: "skip" },
    );
  }

  private async processMessageInRun(
    run: InternalRun,
    messageId: string,
    expectedConsumerId?: string,
    options: { commit?: boolean } = {},
  ) {
    const message = run.messages.find((item) => item.messageId === messageId);
    if (
      !message ||
      message.partition === null ||
      message.offset === null ||
      !message.assignedConsumerId
    )
      return;
    if (expectedConsumerId && message.assignedConsumerId !== expectedConsumerId)
      return;
    if (!["received", "processing"].includes(message.state)) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === message.assignedConsumerId,
    );
    if (!consumer) return;
    message.state = "processing";
    message.updatedAt = new Date().toISOString();
    this.emit(run, "message.processing_started", {
      messageId,
      consumerId: consumer.consumerId,
      actor: consumer.consumerId,
    });
    const scenarioOutcome = evaluateScenarioProcessing({
      scenarioId: run.scenarioId,
      sequence: Number(message.value.sequence ?? 0),
      value: message.value,
    });
    if (scenarioOutcome) {
      message.state = "failed";
      message.updatedAt = new Date().toISOString();
      run.messageCounts.failed += 1;
      this.emit(run, "message.processing_failed", {
        messageId,
        consumerId: consumer.consumerId,
        message: scenarioOutcome.message,
        actor: consumer.consumerId,
      });
      return;
    }
    message.state = "processed";
    consumer.processedCount += 1;
    run.messageCounts.processed += 1;
    this.emit(run, "message.processing_completed", {
      messageId,
      consumerId: consumer.consumerId,
      actor: consumer.consumerId,
    });
    if (options.commit === false) return;
    const committedOffset = String(Number(message.offset) + 1);
    message.state = "commit_requested";
    this.emit(run, "offset.commit_requested", {
      consumerId: consumer.consumerId,
      groupId: run.consumerGroupId,
      topic: run.topicName,
      partition: message.partition,
      committedOffset,
      messageId,
      actor: consumer.consumerId,
    });
    try {
      const handle = run.consumerHandles.get(consumer.consumerId);
      if (handle) {
        await handle.commit({
          topic: run.topicName,
          partition: message.partition,
          offset: committedOffset,
        });
      }
      message.state = "committed";
      message.committedOffset = committedOffset;
      message.updatedAt = new Date().toISOString();
      consumer.committedCount += 1;
      run.messageCounts.committed += 1;
      run.latestCommittedOffsets[String(message.partition)] = committedOffset;
      this.emit(run, "offset.committed", {
        consumerId: consumer.consumerId,
        groupId: run.consumerGroupId,
        topic: run.topicName,
        partition: message.partition,
        committedOffset,
        messageId,
        actor: consumer.consumerId,
      });
    } catch (error) {
      message.state = "failed";
      run.messageCounts.failed += 1;
      this.emit(run, "offset.commit_failed", {
        consumerId: consumer.consumerId,
        groupId: run.consumerGroupId,
        topic: run.topicName,
        partition: message.partition,
        attemptedOffset: committedOffset,
        messageId,
        errorCode: error instanceof Error ? error.name : "COMMIT_FAILED",
        actor: consumer.consumerId,
      });
    }
  }

  private cleanup(run: InternalRun) {
    const existingCleanup = this.cleanupOperations.get(run.runId);
    if (existingCleanup) return existingCleanup;

    this.cleanupRequestedRunIds.add(run.runId);
    clearProducerTimer(run);
    run.producerStatus = "stopped";
    for (const timer of run.processingTimers.values()) clearTimeout(timer);
    run.processingTimers.clear();
    const pendingMutations = this.runMutationTails.get(run.runId);
    const cleanup = this.performCleanup(run, pendingMutations);
    const trackedCleanup = cleanup.finally(() => {
      this.cleanupRequestedRunIds.delete(run.runId);
      this.cleanupOperations.delete(run.runId);
    });
    this.cleanupOperations.set(run.runId, trackedCleanup);
    return trackedCleanup;
  }

  private async performCleanup(
    run: InternalRun,
    pendingMutations: Promise<void> | undefined,
  ) {
    const inFlightExperiment = this.inFlightExperiments.get(run.runId);
    if (inFlightExperiment) await inFlightExperiment;
    if (pendingMutations) await pendingMutations;

    clearProducerTimer(run);
    run.producerStatus = "stopped";
    for (const timer of run.processingTimers.values()) clearTimeout(timer);
    run.processingTimers.clear();
    for (const [consumerId, handle] of run.consumerHandles) {
      await handle.disconnect().catch((error) => {
        logger.warn(
          { err: error, runId: run.runId, consumerId },
          "Consumer cleanup failed",
        );
      });
    }
    run.consumerHandles.clear();
    run.scenarioState = null;
    run.virtualTimeMs = 0;
    run.inFlightExperimentId = null;
    run.completedExperimentIds.clear();
    run.status = "cleaning";
    run.cleanupStatus = "requested";
    this.emit(run, "resource.cleanup_started", {
      message: "Runtime cleanup started.",
    });
    const result = await run.adapter.deleteRunResources(run).catch((error) => {
      const sanitized = sanitizeKafkaError(error);
      return {
        status: "failed" as const,
        steps: [
          {
            name: "adapter.cleanup",
            status: "failed" as const,
            message: sanitized.message,
          },
        ],
      };
    });
    run.cleanupStatus = result.status;
    run.consumers = [];
    run.status = "stopped";
    this.emit(
      run,
      result.status === "failed"
        ? "resource.cleanup_failed"
        : "resource.cleanup_completed",
      { message: `Cleanup ${result.status}.` },
    );
    this.emit(run, "run.stopped", { message: "Run stopped." });
    run.subscribers.clear();
  }

  private applyConsumerAssignment(
    runId: string,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    if (this.cleanupRequestedRunIds.has(runId)) return;
    const run = this.findRun(runId);
    if (!run) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = assignments;
    consumer.status = assignments.length > 0 ? "running" : "idle";
    if (assignments.length > 0) {
      this.emit(run, "consumer.partitions_assigned", {
        consumerId,
        assignments,
        actor: consumerId,
      });
    } else {
      this.emit(run, "consumer.idle", {
        consumerId,
        message: "Kafka assigned no partitions to this consumer.",
        actor: consumerId,
      });
    }
  }

  private applyConsumerRevocation(
    runId: string,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    if (this.cleanupRequestedRunIds.has(runId)) return;
    const run = this.findRun(runId);
    if (!run) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = [];
    consumer.status = "running";
    this.emit(run, "consumer.partitions_revoked", {
      consumerId,
      assignments,
      actor: consumerId,
    });
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
