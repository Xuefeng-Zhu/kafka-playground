import "server-only";
import type { PlaygroundMessage, RuntimeEvent } from "@kplay/contracts";
import {
  KafkaConsumerStartupRollbackError,
  type ConsumedMessage,
} from "@kplay/kafka-runtime";
import { ApiError } from "./api-errors";
import { logger } from "./logger";
import { requeueMessagesForConsumer } from "./playground-message-lifecycle";
import type { InternalRun } from "./playground-runtime-state";

type PlaygroundRuntimeConsumerDependencies = {
  emit(
    run: InternalRun,
    type: RuntimeEvent["type"],
    payload?: Record<string, unknown>,
  ): void;
  findRun(runId: string): InternalRun | null;
  isCleanupRequested(runId: string): boolean;
  isMutationUnavailable(run: InternalRun): boolean;
  consumerLimit(run: InternalRun): number;
  deliverMessage(run: InternalRun, message: PlaygroundMessage): void;
  handleConsumedMessage(
    runId: string,
    consumerId: string,
    message: ConsumedMessage,
  ): Promise<void>;
};

export class PlaygroundRuntimeConsumers {
  constructor(
    private readonly dependencies: PlaygroundRuntimeConsumerDependencies,
  ) {}

  active(run: InternalRun) {
    return run.consumers.filter((consumer) => consumer.status !== "crashed");
  }

  async add(run: InternalRun) {
    const consumerLimit = this.dependencies.consumerLimit(run);
    if (this.active(run).length >= consumerLimit) {
      throw new ApiError(
        "CONSUMER_LIMIT_REACHED",
        `This scenario supports at most ${consumerLimit} consumers.`,
        409,
      );
    }
    const consumerId = this.nextConsumerId(run);
    this.dependencies.emit(run, "consumer.starting", {
      consumerId,
      actor: consumerId,
    });
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
            this.applyAssignment(run.runId, consumerId, assignments),
          onRevoked: (assignments) =>
            this.applyRevocation(run.runId, consumerId, assignments),
          onMessage: (message) =>
            this.dependencies.handleConsumedMessage(
              run.runId,
              consumerId,
              message,
            ),
          onError: (error) => {
            const currentRun = this.dependencies.findRun(run.runId);
            if (
              this.dependencies.isCleanupRequested(run.runId) ||
              !currentRun ||
              this.dependencies.isMutationUnavailable(currentRun)
            ) {
              return;
            }
            logger.error(
              { runId: run.runId, consumerId, error },
              "Kafka consumer error",
            );
            this.dependencies.emit(run, "run.error", {
              message: error.message,
              actor: consumerId,
            });
          },
        });
        run.consumerHandles.set(consumerId, handle);
        if (this.cleanupSuperseded(run)) {
          throw new ApiError(
            "RUN_CLEANUP_IN_PROGRESS",
            "Consumer startup was superseded by run cleanup.",
            409,
          );
        }
      } catch (error) {
        const cleanupRecoveryRequired =
          error instanceof KafkaConsumerStartupRollbackError;
        if (cleanupRecoveryRequired) {
          run.consumerHandles.set(consumerId, error.consumerHandle);
          run.cleanupStatus = "failed";
        }
        run.consumers = run.consumers.filter(
          (consumer) => consumer.consumerId !== consumerId,
        );
        this.dependencies.emit(run, "run.error", {
          actor: consumerId,
          message: cleanupRecoveryRequired
            ? "Consumer startup cleanup failed. Reset the run to retry cleanup."
            : "Consumer failed to start.",
        });
        throw error;
      }
    }
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (consumer) consumer.status = "running";
    this.dependencies.emit(run, "consumer.started", {
      consumerId,
      actor: consumerId,
    });
    if (run.mode === "demo") this.rebalanceAndDeliver(run);
  }

  async stop(run: InternalRun, consumerId: string) {
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) {
      throw new ApiError(
        "CONSUMER_NOT_FOUND",
        "The consumer does not exist.",
        404,
      );
    }
    if (consumer.status === "crashed") {
      throw new ApiError(
        "CONSUMER_ALREADY_CRASHED",
        "The consumer has already crashed.",
        409,
      );
    }
    consumer.status = "stopping";
    this.dependencies.emit(run, "consumer.stopping", {
      consumerId,
      actor: consumerId,
    });
    await this.disconnectHandle(run, consumerId, "Consumer disconnect failed");
    if (run.mode === "demo" && consumer.assignments.length > 0) {
      this.emitRevocation(run, consumerId, consumer.assignments);
    }
    run.consumers = run.consumers.filter(
      (item) => item.consumerId !== consumerId,
    );
    this.dependencies.emit(run, "consumer.stopped", {
      consumerId,
      actor: consumerId,
    });
    if (run.mode === "demo") {
      requeueMessagesForConsumer(run, consumerId);
      this.rebalanceAndDeliver(run);
    }
  }

  async crash(run: InternalRun, consumerId: string) {
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) {
      throw new ApiError(
        "CONSUMER_NOT_FOUND",
        "The consumer does not exist.",
        404,
      );
    }
    if (consumer.status === "crashed") return;

    this.dependencies.emit(run, "consumer.crashing", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} is crashing.`,
    });
    await this.disconnectHandle(
      run,
      consumerId,
      "Consumer crash disconnect failed",
    );
    const assignments = consumer.assignments;
    if (assignments.length > 0) {
      this.emitRevocation(run, consumerId, assignments);
    }
    consumer.assignments = [];
    consumer.status = "crashed";
    requeueMessagesForConsumer(run, consumerId);
    this.dependencies.emit(run, "consumer.crashed", {
      consumerId,
      actor: consumerId,
      message: `${consumerId} crashed before a graceful shutdown.`,
    });

    if (run.mode === "demo") this.rebalanceAndDeliver(run);
  }

  rebalanceAndDeliver(run: InternalRun) {
    this.rebalance(run);
    for (const message of run.messages.filter(
      (item) => item.state === "produced",
    )) {
      this.dependencies.deliverMessage(run, message);
    }
  }

  private nextConsumerId(run: InternalRun) {
    const used = new Set([
      ...run.consumerHandles.keys(),
      ...run.consumers.map((consumer) => consumer.consumerId),
    ]);
    for (let index = 1; ; index += 1) {
      const candidate = `consumer-${index}`;
      if (!used.has(candidate)) return candidate;
    }
  }

  private cleanupSuperseded(run: InternalRun) {
    return this.dependencies.isMutationUnavailable(run);
  }

  private rebalance(run: InternalRun) {
    const active = this.active(run);
    active.forEach((consumer) => {
      if (consumer.assignments.length > 0) {
        this.dependencies.emit(run, "consumer.partitions_revoked", {
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
      if (consumer) {
        consumer.assignments.push({ topic: run.topicName, partition });
      }
    }
    active.forEach((consumer) => {
      if (consumer.assignments.length > 0) {
        this.dependencies.emit(run, "consumer.partitions_assigned", {
          consumerId: consumer.consumerId,
          assignments: consumer.assignments,
          actor: consumer.consumerId,
        });
      } else {
        consumer.status = "idle";
        this.dependencies.emit(run, "consumer.idle", {
          consumerId: consumer.consumerId,
          message: "No partition assignment is available for this consumer.",
          actor: consumer.consumerId,
        });
      }
    });
  }

  private async disconnectHandle(
    run: InternalRun,
    consumerId: string,
    failureMessage: string,
  ) {
    const handle = run.consumerHandles.get(consumerId);
    if (!handle) return;
    try {
      await handle.disconnect();
      run.consumerHandles.delete(consumerId);
    } catch (error) {
      logger.warn({ err: error, runId: run.runId, consumerId }, failureMessage);
      throw error;
    }
  }

  private emitRevocation(
    run: InternalRun,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    this.dependencies.emit(run, "consumer.partitions_revoked", {
      consumerId,
      assignments,
      actor: consumerId,
    });
  }

  private applyAssignment(
    runId: string,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    if (this.dependencies.isCleanupRequested(runId)) return;
    const run = this.dependencies.findRun(runId);
    if (!run || this.dependencies.isMutationUnavailable(run)) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = assignments;
    consumer.status = assignments.length > 0 ? "running" : "idle";
    if (assignments.length > 0) {
      this.dependencies.emit(run, "consumer.partitions_assigned", {
        consumerId,
        assignments,
        actor: consumerId,
      });
    } else {
      this.dependencies.emit(run, "consumer.idle", {
        consumerId,
        message: "Kafka assigned no partitions to this consumer.",
        actor: consumerId,
      });
    }
  }

  private applyRevocation(
    runId: string,
    consumerId: string,
    assignments: Array<{ topic: string; partition: number }>,
  ) {
    if (this.dependencies.isCleanupRequested(runId)) return;
    const run = this.dependencies.findRun(runId);
    if (!run || this.dependencies.isMutationUnavailable(run)) return;
    const consumer = run.consumers.find(
      (item) => item.consumerId === consumerId,
    );
    if (!consumer) return;
    consumer.assignments = [];
    consumer.status = "running";
    this.dependencies.emit(run, "consumer.partitions_revoked", {
      consumerId,
      assignments,
      actor: consumerId,
    });
  }
}
