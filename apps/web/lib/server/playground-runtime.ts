import "server-only";
import type {
  ConsumerSnapshot,
  KeyStrategy,
  PlaygroundMessage,
  ProducerStatus,
  RunSnapshot,
  RuntimeEvent,
  RunStatus,
} from "@kplay/contracts";
import {
  createKafkaRuntimeAdapter,
  type ConsumedMessage,
  type CreateRunInput,
  type KafkaRuntimeAdapter,
  type PlaygroundConsumerHandle,
} from "@kplay/kafka-runtime";
import {
  KeyStrategyState,
  SCENARIOS,
  createHeaders,
  createPlaygroundValue,
  createResourceNames,
  createRunId,
  defaultKeyStrategyForScenario,
  defaultProcessingLatencyForScenario,
  evaluateScenarioProcessing,
  findScenario,
} from "@kplay/scenario-engine";
import { ApiError } from "./api-errors";
import { getServerEnv } from "./env";
import { logger } from "./logger";

type Subscriber = {
  id: string;
  enqueue: (
    event: RuntimeEvent | { type: "snapshot"; snapshot: RunSnapshot },
  ) => void;
};

type InternalRun = CreateRunInput & {
  mode: "demo" | "aiven";
  status: RunStatus;
  producerStatus: ProducerStatus;
  productionRate: number;
  keyStrategy: KeyStrategy;
  processingLatencyMs: number;
  consumers: ConsumerSnapshot[];
  messages: PlaygroundMessage[];
  events: RuntimeEvent[];
  latestPartitionOffsets: Record<string, string>;
  latestCommittedOffsets: Record<string, string>;
  messageCounts: Record<string, number>;
  cleanupStatus: RunSnapshot["cleanupStatus"];
  sequence: number;
  keyState: KeyStrategyState;
  producerTimer: NodeJS.Timeout | null;
  producerTickInFlight: boolean;
  producerTimerGeneration: number;
  processingTimers: Map<string, NodeJS.Timeout>;
  consumerHandles: Map<string, PlaygroundConsumerHandle>;
  subscribers: Map<string, Subscriber>;
};

export class PlaygroundRuntime {
  private readonly env = getServerEnv();
  private readonly adapter: KafkaRuntimeAdapter = createKafkaRuntimeAdapter(
    this.env,
  );
  private activeRun: InternalRun | null = null;
  private shutdownStarted = false;

  scenarios() {
    return SCENARIOS;
  }

  connection() {
    return this.adapter.testConnection();
  }

  async createRun(scenarioId: string) {
    if (this.activeRun && this.activeRun.status !== "stopped") {
      throw new ApiError(
        "RUN_ALREADY_ACTIVE",
        "Only one scenario run can be active.",
        409,
      );
    }
    const scenario = findScenario(scenarioId);
    if (!scenario || scenario.disabled) {
      throw new ApiError(
        "SCENARIO_NOT_AVAILABLE",
        "This scenario is not available.",
        404,
      );
    }
    const runId = createRunId();
    const names = createResourceNames({
      prefix: this.env.KAFKA_TOPIC_PREFIX,
      scenarioId,
    });
    const run: InternalRun = {
      runId,
      scenarioId,
      mode: this.adapter.mode,
      partitionCount: scenario.topic.partitions,
      topicName: names.topicName,
      consumerGroupId: names.consumerGroupId,
      status: "starting",
      producerStatus: "stopped",
      productionRate: 1,
      keyStrategy: defaultKeyStrategyForScenario(scenario.id),
      processingLatencyMs: defaultProcessingLatencyForScenario(scenario.id),
      consumers: [],
      messages: [],
      events: [],
      latestPartitionOffsets: {},
      latestCommittedOffsets: {},
      messageCounts: {
        produced: 0,
        received: 0,
        processed: 0,
        committed: 0,
        failed: 0,
      },
      cleanupStatus: "not_requested",
      sequence: 0,
      keyState: new KeyStrategyState(),
      producerTimer: null,
      producerTickInFlight: false,
      producerTimerGeneration: 0,
      processingTimers: new Map(),
      consumerHandles: new Map(),
      subscribers: new Map(),
    };
    this.activeRun = run;
    this.emit("topic.creating", { message: `Creating topic ${run.topicName}` });
    try {
      await this.adapter.createRun(run);
      run.status = "running";
      this.emit("topic.created", {
        message: `Topic created with ${scenario.topic.partitions} partitions.`,
      });
      this.emit("run.started", { message: `${scenario.title} started.` });
      return this.snapshot(run.runId);
    } catch (error) {
      logger.error(
        { err: error, runId: run.runId },
        "Failed to start scenario run",
      );
      run.status = "error";
      this.emit("run.error", { message: "Failed to start run." });
      await this.cleanup(run);
      throw error;
    }
  }

  snapshot(runId: string) {
    const run = this.requireRun(runId);
    const recentEvents = run.events.slice(-this.env.TIMELINE_DISPLAY_LIMIT);
    return {
      runId: run.runId,
      scenarioId: run.scenarioId,
      mode: run.mode,
      status: run.status,
      topicName: run.topicName,
      partitionCount: run.partitionCount,
      consumerLimit: this.consumerLimit(run),
      consumerGroupId: run.consumerGroupId,
      producerStatus: run.producerStatus,
      productionRate: run.productionRate,
      keyStrategy: run.keyStrategy,
      processingLatencyMs: run.processingLatencyMs,
      consumers: run.consumers,
      latestPartitionOffsets: run.latestPartitionOffsets,
      latestCommittedOffsets: run.latestCommittedOffsets,
      messageCounts: run.messageCounts,
      recentMessages: run.messages.slice(-100),
      recentEvents,
      cleanupStatus: run.cleanupStatus,
      sequence: run.sequence,
    } satisfies RunSnapshot;
  }

  activeSnapshot() {
    if (!this.activeRun || this.activeRun.status === "stopped") return null;
    return this.snapshot(this.activeRun.runId);
  }

  async updateSettings(
    runId: string,
    settings: Partial<
      Pick<
        InternalRun,
        "productionRate" | "keyStrategy" | "processingLatencyMs"
      >
    >,
  ) {
    const run = this.requireRun(runId);
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
      if (run.producerStatus === "running") this.restartProducerTimer(run);
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
    return this.snapshot(runId);
  }

  async startProducer(runId: string) {
    const run = this.requireRun(runId);
    if (run.producerStatus === "running") return this.snapshot(runId);
    run.producerStatus = "starting";
    this.emit("producer.starting", { actor: "producer" });
    run.producerStatus = "running";
    this.emit("producer.started", { actor: "producer" });
    this.restartProducerTimer(run);
    return this.snapshot(runId);
  }

  async pauseProducer(runId: string) {
    const run = this.requireRun(runId);
    this.clearProducerTimer(run);
    run.producerStatus = "paused";
    this.emit("producer.paused", { actor: "producer" });
    return this.snapshot(runId);
  }

  async stopProducer(runId: string) {
    const run = this.requireRun(runId);
    this.clearProducerTimer(run);
    run.producerStatus = "stopped";
    this.emit("producer.stopped", { actor: "producer" });
    return this.snapshot(runId);
  }

  async produceOne(runId: string, override?: KeyStrategy) {
    const run = this.requireRun(runId);
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
    this.boundMessages(run);
    this.emit("message.producing", { messageId: eventId, actor: "producer" });
    let delivery;
    try {
      delivery = await this.adapter.produce({
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
      this.emit("run.error", {
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
    this.emit("message.produced", {
      messageId: eventId,
      topic: delivery.topic,
      partition: delivery.partition,
      offset: delivery.offset,
      key: messageKey,
      kafkaTimestamp: delivery.timestamp,
      actor: "producer",
    });
    if (run.mode === "demo") this.maybeDeliverMessage(run, message);
    return this.snapshot(runId);
  }

  async addConsumer(runId: string) {
    const run = this.requireRun(runId);
    const consumerLimit = this.consumerLimit(run);
    if (this.activeConsumers(run).length >= consumerLimit) {
      throw new ApiError(
        "CONSUMER_LIMIT_REACHED",
        `This scenario supports at most ${consumerLimit} consumers.`,
        409,
      );
    }
    const consumerId = this.nextConsumerId(run);
    this.emit("consumer.starting", { consumerId, actor: consumerId });
    run.consumers.push({
      consumerId,
      status: "starting",
      assignments: [],
      processedCount: 0,
      committedCount: 0,
    });
    if (run.mode === "aiven") {
      const handle = await this.adapter.createConsumer(run, consumerId, {
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
          this.emit("run.error", { message: error.message, actor: consumerId });
        },
      });
      run.consumerHandles.set(consumerId, handle);
    }
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (consumer) consumer.status = "running";
    this.emit("consumer.started", { consumerId, actor: consumerId });
    if (run.mode === "demo") {
      this.rebalance(run);
      for (const message of run.messages.filter(
        (item) => item.state === "produced",
      )) {
        this.maybeDeliverMessage(run, message);
      }
    }
    return this.snapshot(runId);
  }

  async stopConsumer(runId: string, consumerId: string) {
    const run = this.requireRun(runId);
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
    this.emit("consumer.stopping", { consumerId, actor: consumerId });
    const handle = run.consumerHandles.get(consumerId);
    if (handle) {
      await handle.disconnect().catch((error) => {
        logger.warn(
          { err: error, runId, consumerId },
          "Consumer disconnect failed",
        );
      });
      run.consumerHandles.delete(consumerId);
    }
    if (run.mode === "demo" && consumer.assignments.length > 0) {
      this.emit("consumer.partitions_revoked", {
        consumerId,
        assignments: consumer.assignments,
        actor: consumerId,
      });
    }
    run.consumers = run.consumers.filter(
      (item) => item.consumerId !== consumerId,
    );
    this.emit("consumer.stopped", { consumerId, actor: consumerId });
    if (run.mode === "demo") {
      this.requeueMessagesForConsumer(run, consumerId);
      this.rebalance(run);
      for (const message of run.messages.filter(
        (item) => item.state === "produced",
      )) {
        this.maybeDeliverMessage(run, message);
      }
    }
    return this.snapshot(runId);
  }

  async crashConsumer(runId: string, consumerId: string) {
    const run = this.requireRun(runId);
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer)
      throw new ApiError(
        "CONSUMER_NOT_FOUND",
        "The consumer does not exist.",
        404,
      );
    if (consumer.status === "crashed") return this.snapshot(runId);

    this.emit("consumer.crashing", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} is crashing.`,
    });
    const handle = run.consumerHandles.get(consumerId);
    if (handle) {
      await handle.disconnect().catch((error) => {
        logger.warn(
          { err: error, runId, consumerId },
          "Consumer crash disconnect failed",
        );
      });
      run.consumerHandles.delete(consumerId);
    }
    const assignments = consumer.assignments;
    if (assignments.length > 0) {
      this.emit("consumer.partitions_revoked", {
        consumerId,
        assignments,
        actor: consumerId,
      });
    }
    consumer.assignments = [];
    consumer.status = "crashed";
    this.requeueMessagesForConsumer(run, consumerId);
    this.emit("consumer.crashed", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} crashed before a graceful shutdown.`,
    });

    if (run.mode === "demo") {
      this.rebalance(run);
      for (const message of run.messages.filter(
        (item) => item.state === "produced",
      )) {
        this.maybeDeliverMessage(run, message);
      }
    }
    return this.snapshot(runId);
  }

  async reset(runId: string) {
    const run = this.requireRun(runId);
    await this.cleanup(run);
    this.activeRun = null;
    return { cleanupStatus: run.cleanupStatus };
  }

  async deleteRun(runId: string) {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      return { cleanupStatus: "completed" as const };
    }
    return this.reset(runId);
  }

  subscribe(runId: string, lastEventId: number | null, subscriber: Subscriber) {
    const run = this.requireRun(runId);
    run.subscribers.set(subscriber.id, subscriber);
    subscriber.enqueue({ type: "snapshot", snapshot: this.snapshot(runId) });
    const missed = lastEventId
      ? run.events.filter((event) => event.sequence > lastEventId)
      : [];
    for (const event of missed) subscriber.enqueue(event);
    return () => {
      run.subscribers.delete(subscriber.id);
    };
  }

  async shutdown() {
    if (this.shutdownStarted) return;
    this.shutdownStarted = true;
    if (this.activeRun) {
      await this.cleanup(this.activeRun).catch((error) =>
        logger.error({ err: error }, "Runtime shutdown cleanup failed"),
      );
    }
    await this.adapter.shutdown();
  }

  private requireRun(runId: string) {
    if (!this.activeRun || this.activeRun.runId !== runId) {
      throw new ApiError(
        "RUN_NOT_FOUND",
        "The scenario run does not exist.",
        404,
      );
    }
    return this.activeRun;
  }

  private emit(
    type: RuntimeEvent["type"],
    payload: Record<string, unknown> = {},
  ) {
    if (!this.activeRun) return;
    const run = this.activeRun;
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
    if (run.events.length > this.env.EVENT_HISTORY_LIMIT) {
      run.events.splice(0, run.events.length - this.env.EVENT_HISTORY_LIMIT);
    }
    for (const subscriber of run.subscribers.values())
      subscriber.enqueue(event);
  }

  private restartProducerTimer(run: InternalRun) {
    this.clearProducerTimer(run);
    if (!run.producerTickInFlight) {
      this.scheduleProducerTick(run);
    }
  }

  private scheduleProducerTick(run: InternalRun) {
    if (run.producerStatus !== "running" || run.producerTimer) return;
    const generation = run.producerTimerGeneration;
    const intervalMs = Math.max(100, Math.floor(1000 / run.productionRate));
    run.producerTimer = setTimeout(async () => {
      run.producerTimer = null;
      if (
        run.producerStatus !== "running" ||
        run.producerTimerGeneration !== generation
      ) {
        return;
      }
      run.producerTickInFlight = true;
      try {
        await this.produceOne(run.runId);
      } catch (error) {
        logger.error(
          { err: error, runId: run.runId },
          "Automatic production failed",
        );
      } finally {
        run.producerTickInFlight = false;
        if (run.producerStatus === "running") {
          this.scheduleProducerTick(run);
        }
      }
    }, intervalMs);
  }

  private clearProducerTimer(run: InternalRun) {
    run.producerTimerGeneration += 1;
    if (run.producerTimer) clearTimeout(run.producerTimer);
    run.producerTimer = null;
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

  private rebalance(run: InternalRun) {
    const active = this.activeConsumers(run);
    active.forEach((consumer) => {
      if (consumer.assignments.length > 0) {
        this.emit("consumer.partitions_revoked", {
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
        this.emit("consumer.partitions_assigned", {
          consumerId: consumer.consumerId,
          assignments: consumer.assignments,
          actor: consumer.consumerId,
        });
      } else {
        consumer.status = "idle";
        this.emit("consumer.idle", {
          consumerId: consumer.consumerId,
          message: "No partition assignment is available for this consumer.",
          actor: consumer.consumerId,
        });
      }
    });
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
    this.emit("message.received", {
      messageId: message.messageId,
      consumerId: consumer.consumerId,
      topic: run.topicName,
      partition: message.partition,
      offset: message.offset,
      actor: consumer.consumerId,
    });
    const timer = setTimeout(() => {
      if (run.processingTimers.get(message.messageId) === timer) {
        run.processingTimers.delete(message.messageId);
      }
      void this.processMessage(
        run.runId,
        message.messageId,
        consumer.consumerId,
      );
    }, run.processingLatencyMs);
    const previousTimer = run.processingTimers.get(message.messageId);
    if (previousTimer) clearTimeout(previousTimer);
    run.processingTimers.set(message.messageId, timer);
  }

  private requeueMessagesForConsumer(run: InternalRun, consumerId: string) {
    for (const message of run.messages) {
      if (
        message.assignedConsumerId === consumerId &&
        ["received", "processing", "processed", "commit_requested"].includes(
          message.state,
        )
      ) {
        const timer = run.processingTimers.get(message.messageId);
        if (timer) {
          clearTimeout(timer);
          run.processingTimers.delete(message.messageId);
        }
        message.state = "produced";
        message.assignedConsumerId = null;
        message.updatedAt = new Date().toISOString();
      }
    }
  }

  private async handleConsumedMessage(
    runId: string,
    consumerId: string,
    consumed: ConsumedMessage,
  ) {
    const run = this.activeRun;
    if (!run || run.runId !== runId) return;
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
      this.boundMessages(run);
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
    this.emit("message.received", {
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
  ) {
    const run = this.activeRun;
    if (!run || run.runId !== runId) return;
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
    this.emit("message.processing_started", {
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
      this.emit("message.processing_failed", {
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
    this.emit("message.processing_completed", {
      messageId,
      consumerId: consumer.consumerId,
      actor: consumer.consumerId,
    });
    const committedOffset = String(Number(message.offset) + 1);
    message.state = "commit_requested";
    this.emit("offset.commit_requested", {
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
      this.emit("offset.committed", {
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
      this.emit("offset.commit_failed", {
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

  private async cleanup(run: InternalRun) {
    this.clearProducerTimer(run);
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
    run.status = "cleaning";
    run.cleanupStatus = "requested";
    this.emit("resource.cleanup_started", {
      message: "Runtime cleanup started.",
    });
    const result = await this.adapter
      .deleteRunResources(run)
      .catch((error) => ({
        status: "failed" as const,
        steps: [
          {
            name: "adapter.cleanup",
            status: "failed" as const,
            message: String(error),
          },
        ],
      }));
    run.cleanupStatus = result.status;
    run.consumers = [];
    run.status = "stopped";
    this.emit(
      result.status === "failed"
        ? "resource.cleanup_failed"
        : "resource.cleanup_completed",
      { message: `Cleanup ${result.status}.` },
    );
    this.emit("run.stopped", { message: "Run stopped." });
    run.subscribers.clear();
  }

  private boundMessages(run: InternalRun) {
    if (run.messages.length > 500)
      run.messages.splice(0, run.messages.length - 500);
  }

  private applyConsumerAssignment(
    runId: string,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    const run = this.activeRun;
    if (!run || run.runId !== runId) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = assignments;
    consumer.status = assignments.length > 0 ? "running" : "idle";
    if (assignments.length > 0) {
      this.emit("consumer.partitions_assigned", {
        consumerId,
        assignments,
        actor: consumerId,
      });
    } else {
      this.emit("consumer.idle", {
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
    const run = this.activeRun;
    if (!run || run.runId !== runId) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = [];
    consumer.status = "running";
    this.emit("consumer.partitions_revoked", {
      consumerId,
      assignments,
      actor: consumerId,
    });
  }
}
