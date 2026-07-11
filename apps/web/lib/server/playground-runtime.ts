import "server-only";
import type {
  KeyStrategy,
  PlaygroundMessage,
  RemoteKafkaConfig,
  UserSelectableKafkaMode,
  RuntimeEvent,
  ScenarioState,
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
  buildScenarioExperimentResult,
  scenarioExperimentPrerequisite,
  supportsScenarioExperiment,
  type ScenarioExperimentObservations,
} from "./scenario-experiments";

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
        settings.processingLatencyMs < scenario.limits.minProcessingLatencyMs ||
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
  }

  async startProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
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
  }

  async pauseProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.requireRun(runId, sessionId);
    clearProducerTimer(run);
    run.producerStatus = "paused";
    this.emit(run, "producer.paused", { actor: "producer" });
    return this.snapshot(runId, sessionId);
  }

  async stopProducer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.requireRun(runId, sessionId);
    clearProducerTimer(run);
    run.producerStatus = "stopped";
    this.emit(run, "producer.stopped", { actor: "producer" });
    return this.snapshot(runId, sessionId);
  }

  async produceOne(
    runId: string,
    override?: KeyStrategy,
    sessionId = DEFAULT_SESSION_ID,
  ) {
    const run = this.requireRun(runId, sessionId);
    const keyStrategy = override ?? run.keyStrategy;
    const eventId = crypto.randomUUID();
    const messageKey = run.keyState.next(keyStrategy);
    const value = createPlaygroundValue({
      eventId,
      runId,
      scenarioId: run.scenarioId,
      sequence: run.keyState.currentSequence,
      userId: messageKey,
    });
    const headers = createHeaders({
      runId,
      eventId,
      scenarioId: run.scenarioId,
      sequence: run.keyState.currentSequence,
      keyStrategy,
    });
    const now = new Date().toISOString();
    const message: PlaygroundMessage = {
      messageId: eventId,
      runId,
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
        runId,
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
    return this.snapshot(runId, sessionId);
  }

  async addConsumer(runId: string, sessionId = DEFAULT_SESSION_ID) {
    const run = this.requireRun(runId, sessionId);
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
    return this.snapshot(runId, sessionId);
  }

  async stopConsumer(
    runId: string,
    consumerId: string,
    sessionId = DEFAULT_SESSION_ID,
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
    if (
      this.cleanupRequestedRunIds.has(runId) ||
      run.mode !== "demo" ||
      !run.scenarioState ||
      !supportsScenarioExperiment(run.scenarioState, experimentId) ||
      run.inFlightExperimentId
    ) {
      throw new ApiError(
        "SCENARIO_EXPERIMENT_UNAVAILABLE",
        run.inFlightExperimentId
          ? `Experiment ${run.inFlightExperimentId} is already running.`
          : run.mode !== "demo"
            ? "Teaching experiments are unavailable for remote Kafka runs because their deterministic evidence is demo-only."
            : "This experiment is unavailable for the active scenario.",
        409,
      );
    }

    const prerequisite = scenarioExperimentPrerequisite(
      run.scenarioState,
      experimentId,
    );
    if (prerequisite && !run.completedExperimentIds.has(prerequisite)) {
      throw new ApiError(
        "SCENARIO_EXPERIMENT_UNAVAILABLE",
        `Complete experiment ${prerequisite} before running ${experimentId}.`,
        409,
      );
    }

    run.inFlightExperimentId = experimentId;
    let resolveExperiment: (() => void) | undefined;
    const experimentCompleted = new Promise<void>((resolve) => {
      resolveExperiment = resolve;
    });
    this.inFlightExperiments.set(runId, experimentCompleted);
    const startedAtVirtualMs = run.virtualTimeMs;
    let totalSteps = 0;

    try {
      const preview = buildScenarioExperimentResult({
        state: run.scenarioState,
        experimentId,
        startedAtVirtualMs,
      });
      totalSteps = preview.transitions.length;
      run.scenarioState = this.updateExperimentProgress(run.scenarioState, {
        status: "running",
        experimentId,
        stepIndex: 0,
        totalSteps,
        startedAtVirtualMs,
        completedAtVirtualMs: null,
        error: null,
      });
      this.emit(run, "scenario.experiment.started", {
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

      // Yield once without using wall-clock time. This keeps the per-run guard
      // observable to a concurrent request while all domain time stays virtual.
      await Promise.resolve();
      const observations = await this.prepareExperimentObservations(
        run,
        experimentId,
        sessionId,
      );
      const result = buildScenarioExperimentResult({
        state: run.scenarioState,
        experimentId,
        startedAtVirtualMs,
        observations,
      });

      result.transitions.forEach((transition, index) => {
        run.virtualTimeMs += transition.advanceMs;
        if (run.scenarioState) {
          run.scenarioState = this.updateExperimentProgress(
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
        this.emit(run, "scenario.experiment.transition", {
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
      this.emit(run, "scenario.experiment.completed", {
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
      return this.snapshot(runId, sessionId);
    } catch (error) {
      const errorCode =
        error instanceof ApiError ? error.code : "SCENARIO_EXPERIMENT_FAILED";
      const message =
        error instanceof Error ? error.message : "Experiment execution failed.";
      const failedEventTotalSteps = Math.max(totalSteps, 1);
      if (run.scenarioState) {
        run.scenarioState = this.updateExperimentProgress(run.scenarioState, {
          status: "failed",
          experimentId,
          stepIndex: run.scenarioState.experiment.stepIndex,
          totalSteps,
          startedAtVirtualMs,
          completedAtVirtualMs: run.virtualTimeMs,
          error: { code: errorCode, message },
        });
      }
      this.emit(run, "scenario.experiment.failed", {
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
      run.inFlightExperimentId = null;
      resolveExperiment?.();
      if (this.inFlightExperiments.get(runId) === experimentCompleted) {
        this.inFlightExperiments.delete(runId);
      }
    }
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

  private updateExperimentProgress(
    state: ScenarioState,
    experiment: ScenarioState["experiment"],
  ): ScenarioState {
    return { ...state, experiment } as ScenarioState;
  }

  private async prepareExperimentObservations(
    run: InternalRun,
    experimentId: string,
    sessionId: string,
  ): Promise<ScenarioExperimentObservations | undefined> {
    if (run.scenarioId === "partitioning") {
      const growGroup = experimentId === "grow-consumer-group";
      const produced: PlaygroundMessage[] = growGroup
        ? run.messages.filter((message) =>
            run.scenarioState?.scenarioId === "partitioning"
              ? run.scenarioState.routingTraces.some(
                  (trace) => trace.messageId === message.messageId,
                )
              : false,
          )
        : [];
      if (!growGroup) {
        for (const key of ["A", "B", "A"]) {
          await this.produceOne(
            run.runId,
            { type: "fixed", value: key },
            sessionId,
          );
          const message = run.messages.at(-1);
          if (message) produced.push(message);
        }
      }
      const simulateConsumerGrowth = growGroup && this.consumerLimit(run) < 3;
      if (!simulateConsumerGrowth) {
        const targetConsumerCount = growGroup ? 3 : 1;
        while (this.activeConsumers(run).length < targetConsumerCount) {
          await this.addConsumer(run.runId, sessionId);
        }
      }
      if (!simulateConsumerGrowth) {
        for (const message of produced) {
          const timer = run.processingTimers.get(message.messageId);
          if (timer) clearTimeout(timer);
          run.processingTimers.delete(message.messageId);
          if (message.assignedConsumerId) {
            await this.processMessage(
              run.runId,
              message.messageId,
              message.assignedConsumerId,
              { commit: growGroup || message !== produced.at(-1) },
            );
          }
        }
      }

      const assignmentEpoch =
        run.scenarioState?.scenarioId === "partitioning"
          ? run.scenarioState.assignmentEpoch + 1
          : 1;
      const experimentConsumers = simulateConsumerGrowth
        ? Array.from({ length: 3 }, (_, index) => ({
            consumerId: `guided-consumer-${index + 1}`,
            partitions: Array.from(
              { length: run.partitionCount },
              (_, partition) => partition,
            ).filter((partition) => partition % 3 === index),
          }))
        : this.activeConsumers(run).map((consumer) => ({
            consumerId: consumer.consumerId,
            partitions: consumer.assignments.map(
              (assignment) => assignment.partition,
            ),
          }));
      const partitionPositions =
        simulateConsumerGrowth &&
        run.scenarioState?.scenarioId === "partitioning"
          ? run.scenarioState.partitionPositions.map((position) => ({
              ...position,
            }))
          : Array.from({ length: run.partitionCount }, (_, partition) => {
              const partitionMessages = produced.filter(
                (message) => message.partition === partition,
              );
              const processed = partitionMessages
                .filter((message) =>
                  ["processed", "commit_requested", "committed"].includes(
                    message.state,
                  ),
                )
                .at(-1);
              return {
                id: `partition-${partition}-position`,
                provenance: "simulated" as const,
                partition,
                processedOffset: processed?.offset ?? null,
                committedOffset:
                  run.latestCommittedOffsets[String(partition)] ?? null,
              };
            });
      return {
        partitioning: {
          routingTraces: produced.flatMap((message, index) =>
            message.partition === null || message.offset === null
              ? []
              : [
                  {
                    id: `routing-${message.messageId}`,
                    provenance: "simulated" as const,
                    messageId: message.messageId,
                    key: message.key,
                    partition: message.partition,
                    offset: message.offset,
                    sequence: index + 1,
                  },
                ],
          ),
          partitionPositions,
          consumers: experimentConsumers.map((consumer) => ({
            id: `assignment-${consumer.consumerId}-${assignmentEpoch}`,
            provenance: "simulated" as const,
            consumerId: consumer.consumerId,
            partitions: consumer.partitions,
            status: consumer.partitions.length > 0 ? "running" : "idle",
            epoch: assignmentEpoch,
          })),
          assignmentEpoch,
        },
      };
    }

    if (run.scenarioId === "fan-out-load-balancing") {
      const routes: Array<{
        messageId: string;
        partition: number;
        offset: string;
      }> = [];
      if (experimentId === "produce-unkeyed-burst") {
        for (let index = 0; index < 3; index += 1) {
          await this.produceOne(run.runId, { type: "no_key" }, sessionId);
          const message = run.messages.at(-1);
          if (
            message &&
            message.partition !== null &&
            message.offset !== null
          ) {
            routes.push({
              messageId: message.messageId,
              partition: message.partition,
              offset: message.offset,
            });
          }
        }
      }
      const epochs: NonNullable<
        ScenarioExperimentObservations["loadBalancing"]
      >["epochs"] = [];
      if (experimentId === "grow-consumer-group") {
        // This experiment teaches a four-member assignment independently of
        // the raw-controls consumer pool. The pool can be capped below four
        // and can already contain user-created members, so mutating it here
        // would either exceed run capacity or skip the early assignment
        // epochs. Keep the authoritative lesson deterministic and explicitly
        // simulated while leaving real run capacity untouched.
        for (let epoch = 1; epoch <= 4; epoch += 1) {
          const memberIds = Array.from(
            { length: epoch },
            (_, index) => `consumer-${index + 1}`,
          );
          const assignments = memberIds.map((consumerId, memberIndex) => ({
            consumerId,
            partitions: Array.from(
              { length: run.partitionCount },
              (_, partition) => partition,
            ).filter((partition) => partition % epoch === memberIndex),
          }));
          epochs.push({
            id: `assignment-epoch-${epoch}`,
            provenance: "simulated",
            epoch,
            memberIds,
            assignments,
            idleConsumerIds: assignments
              .filter((assignment) => assignment.partitions.length === 0)
              .map((assignment) => assignment.consumerId),
          });
        }
      }
      return { loadBalancing: { epochs, routes } };
    }

    return undefined;
  }

  private emit(
    run: InternalRun,
    type: RuntimeEvent["type"],
    payload: Record<string, unknown> = {},
  ) {
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
    await this.processMessage(runId, message.messageId, consumerId);
  }

  private async processMessage(
    runId: string,
    messageId: string,
    expectedConsumerId?: string,
    options: { commit?: boolean } = {},
  ) {
    const run = this.findRun(runId);
    if (!run) return;
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
    const cleanup = this.performCleanup(run);
    const trackedCleanup = cleanup.finally(() => {
      this.cleanupRequestedRunIds.delete(run.runId);
      this.cleanupOperations.delete(run.runId);
    });
    this.cleanupOperations.set(run.runId, trackedCleanup);
    return trackedCleanup;
  }

  private async performCleanup(run: InternalRun) {
    const inFlightExperiment = this.inFlightExperiments.get(run.runId);
    if (inFlightExperiment) await inFlightExperiment;

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
