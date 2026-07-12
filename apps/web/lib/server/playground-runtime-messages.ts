import "server-only";
import {
  addToKafkaOffset,
  type KeyStrategy,
  type PlaygroundMessage,
  type RuntimeEvent,
} from "@kplay/contracts";
import type { ConsumedMessage } from "@kplay/kafka-runtime";
import {
  createHeaders,
  createPlaygroundValue,
  evaluateScenarioProcessing,
} from "@kplay/scenario-engine";
import {
  boundMessages,
  scheduleMessageProcessing,
} from "./playground-message-lifecycle";
import type { InternalRun } from "./playground-runtime-state";
import {
  RunScopedWorkTracker,
  waitForAbortableDelay,
} from "./playground-run-scoped-work";
import { ApiError } from "./api-errors";

type MutateRun = <T>(
  runId: string,
  operation: () => T | Promise<T>,
  options?: { cleanupBehavior?: "allow" | "reject" | "skip" },
) => Promise<T>;

export type PlaygroundRuntimeMessageDependencies = {
  emit(
    run: InternalRun,
    type: RuntimeEvent["type"],
    payload?: Record<string, unknown>,
  ): void;
  findRun(runId: string): InternalRun | null;
  isCleanupRequested(runId: string): boolean;
  isMutationUnavailable(run: InternalRun): boolean;
  mutateRun: MutateRun;
};

export class PlaygroundRuntimeMessages {
  private readonly runScopedWork = new RunScopedWorkTracker();

  constructor(
    private readonly dependencies: PlaygroundRuntimeMessageDependencies,
  ) {}

  async produce(run: InternalRun, override?: KeyStrategy) {
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
    this.dependencies.emit(run, "message.producing", {
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
      if (this.cleanupSuperseded(run)) {
        throw new ApiError(
          "RUN_CLEANUP_IN_PROGRESS",
          "Message production was superseded by run cleanup.",
          409,
        );
      }
    } catch (error) {
      message.state = "failed";
      message.updatedAt = new Date().toISOString();
      run.messageCounts.failed += 1;
      this.dependencies.emit(run, "run.error", {
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
    this.dependencies.emit(run, "message.produced", {
      messageId: eventId,
      topic: delivery.topic,
      partition: delivery.partition,
      offset: delivery.offset,
      key: messageKey,
      kafkaTimestamp: delivery.timestamp,
      actor: "producer",
    });
    if (run.mode === "demo") this.deliver(run, message);
    return message;
  }

  deliver(run: InternalRun, message: PlaygroundMessage) {
    if (
      message.partition === null ||
      message.offset === null ||
      message.state !== "produced"
    ) {
      return;
    }
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
    this.dependencies.emit(run, "message.received", {
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
        this.process(runId, messageId, expectedConsumerId),
    );
  }

  handleConsumed(runId: string, consumerId: string, consumed: ConsumedMessage) {
    return this.runScopedWork.run(runId, (signal) =>
      this.processConsumed(runId, consumerId, consumed, signal),
    );
  }

  process(
    runId: string,
    messageId: string,
    expectedConsumerId?: string,
    options: { commit?: boolean } = {},
  ) {
    return this.dependencies.mutateRun(
      runId,
      async () => {
        const run = this.dependencies.findRun(runId);
        if (!run) return;
        await this.processInRun(run, messageId, expectedConsumerId, options);
      },
      { cleanupBehavior: "skip" },
    );
  }

  async processInRun(
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
    ) {
      return;
    }
    if (
      expectedConsumerId &&
      message.assignedConsumerId !== expectedConsumerId
    ) {
      return;
    }
    if (!["received", "processing"].includes(message.state)) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === message.assignedConsumerId,
    );
    if (!consumer) return;
    message.state = "processing";
    message.updatedAt = new Date().toISOString();
    this.dependencies.emit(run, "message.processing_started", {
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
      this.dependencies.emit(run, "message.processing_failed", {
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
    this.dependencies.emit(run, "message.processing_completed", {
      messageId,
      consumerId: consumer.consumerId,
      actor: consumer.consumerId,
    });
    if (options.commit === false) return;
    const committedOffset = addToKafkaOffset(message.offset, 1n);
    message.state = "commit_requested";
    this.dependencies.emit(run, "offset.commit_requested", {
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
      if (this.cleanupSuperseded(run)) return;
      message.state = "committed";
      message.committedOffset = committedOffset;
      message.updatedAt = new Date().toISOString();
      consumer.committedCount += 1;
      run.messageCounts.committed += 1;
      run.latestCommittedOffsets[String(message.partition)] = committedOffset;
      this.dependencies.emit(run, "offset.committed", {
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
      this.dependencies.emit(run, "offset.commit_failed", {
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

  cancelRunScopedWork(runId: string) {
    return this.runScopedWork.cancel(runId);
  }

  private cleanupSuperseded(run: InternalRun) {
    return this.dependencies.isMutationUnavailable(run);
  }

  private async processConsumed(
    runId: string,
    consumerId: string,
    consumed: ConsumedMessage,
    signal: AbortSignal,
  ) {
    if (this.dependencies.isCleanupRequested(runId)) return;
    const run = this.dependencies.findRun(runId);
    if (!run || this.dependencies.isMutationUnavailable(run)) return;
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
    this.dependencies.emit(run, "message.received", {
      messageId: message.messageId,
      consumerId,
      topic: consumed.topic,
      partition: consumed.partition,
      offset: consumed.offset,
      actor: consumerId,
    });
    const delayCompleted = await waitForAbortableDelay(
      run.processingLatencyMs,
      signal,
    );
    if (!delayCompleted || this.dependencies.isCleanupRequested(runId)) return;
    await this.process(runId, message.messageId, consumerId);
  }
}
