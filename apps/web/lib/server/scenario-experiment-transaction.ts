import "server-only";
import type { ProducerStatus } from "@kplay/contracts";
import { DemoKafkaRuntimeAdapter } from "@kplay/kafka-runtime";
import type { InternalRun } from "./playground-runtime-state";

export type ScenarioExperimentCheckpoint = ReturnType<
  typeof captureScenarioExperimentCheckpoint
>;

type ScenarioExperimentTransactionOperations = {
  captureCheckpoint(): ScenarioExperimentCheckpoint;
  discardEventBuffer(): void;
  flushEventBuffer(): void;
  beginEventBuffer(): void;
  restoreCheckpoint(checkpoint: ScenarioExperimentCheckpoint): void;
  restoreProducerStatus(checkpoint: ScenarioExperimentCheckpoint): void;
  resumeTimers(checkpoint: ScenarioExperimentCheckpoint): void;
  suspendTimers(): void;
};

type EventBufferState = "not_started" | "initializing" | "open" | "finalized";

export class ScenarioExperimentTransaction {
  private checkpointValue?: ScenarioExperimentCheckpoint;
  private eventBufferState: EventBufferState = "not_started";
  private timerSuspensionAttempted = false;
  private checkpointRestored = false;
  private producerStatusRestored = false;
  readonly recoveryFailures: Error[] = [];

  constructor(
    private readonly operations: ScenarioExperimentTransactionOperations,
  ) {}

  get checkpoint() {
    return this.checkpointValue;
  }

  captureCheckpoint() {
    this.checkpointValue = this.operations.captureCheckpoint();
  }

  suspendTimers() {
    this.timerSuspensionAttempted = true;
    this.operations.suspendTimers();
  }

  beginEventBuffer() {
    this.eventBufferState = "initializing";
    this.operations.beginEventBuffer();
    this.eventBufferState = "open";
  }

  flushEventBuffer() {
    this.operations.flushEventBuffer();
    this.eventBufferState = "finalized";
  }

  discardEventBuffer(stage = "discard event buffer") {
    if (!this.hasUnfinalizedEventBuffer()) return;
    this.attemptRecovery(stage, () => {
      this.operations.discardEventBuffer();
      this.eventBufferState = "finalized";
    });
  }

  finalizeEventBuffer() {
    if (!this.hasUnfinalizedEventBuffer()) return;
    this.attemptRecovery("discard event buffer during finalization", () => {
      try {
        this.operations.discardEventBuffer();
      } finally {
        this.eventBufferState = "finalized";
      }
    });
  }

  restoreCheckpoint() {
    const checkpoint = this.checkpointValue;
    if (!checkpoint) return;
    this.attemptRecovery("restore checkpoint", () => {
      this.operations.restoreCheckpoint(checkpoint);
      this.checkpointRestored = true;
      this.producerStatusRestored = true;
    });
  }

  finalizeCheckpoint() {
    const checkpoint = this.checkpointValue;
    if (!checkpoint) return;
    if (!this.checkpointRestored && !this.producerStatusRestored) {
      this.attemptRecovery("restore producer status", () => {
        this.operations.restoreProducerStatus(checkpoint);
        this.producerStatusRestored = true;
      });
    }
    if (this.timerSuspensionAttempted) {
      this.attemptRecovery("resume timers", () => {
        this.operations.resumeTimers(checkpoint);
      });
    }
  }

  restoreProducerStatus() {
    const checkpoint = this.checkpointValue;
    if (!checkpoint) {
      throw new Error("Scenario experiment checkpoint is unavailable.");
    }
    this.operations.restoreProducerStatus(checkpoint);
    this.producerStatusRestored = true;
  }

  attemptRecovery(stage: string, operation: () => void) {
    try {
      operation();
    } catch (error) {
      this.recoveryFailures.push(
        new Error(`Experiment recovery failed to ${stage}.`, { cause: error }),
      );
    }
  }

  private hasUnfinalizedEventBuffer() {
    return (
      this.eventBufferState !== "not_started" &&
      this.eventBufferState !== "finalized"
    );
  }
}

export function captureScenarioExperimentCheckpoint(run: InternalRun) {
  return {
    producerStatus: run.producerStatus,
    pendingProcessingMessageIds: [...run.processingTimers.keys()],
    consumers: structuredClone(run.consumers),
    messages: structuredClone(run.messages),
    events: structuredClone(run.events),
    latestPartitionOffsets: structuredClone(run.latestPartitionOffsets),
    latestCommittedOffsets: structuredClone(run.latestCommittedOffsets),
    messageCounts: structuredClone(run.messageCounts),
    sequence: run.sequence,
    keyState: cloneKeyState(run.keyState),
    scenarioState: structuredClone(run.scenarioState),
    virtualTimeMs: run.virtualTimeMs,
    completedExperimentIds: new Set(run.completedExperimentIds),
    demoAdapterCheckpoint:
      run.adapter instanceof DemoKafkaRuntimeAdapter
        ? run.adapter.captureRunCheckpoint(run.topicName)
        : null,
  };
}

export function suspendScenarioExperimentTimers(run: InternalRun) {
  for (const timer of run.processingTimers.values()) clearTimeout(timer);
  run.processingTimers.clear();
  if (run.producerTimer) clearTimeout(run.producerTimer);
  run.producerTimer = null;
  run.producerTimerGeneration += 1;
  if (run.producerStatus === "running") run.producerStatus = "paused";
}

export function restoreScenarioExperimentCheckpoint(
  run: InternalRun,
  checkpoint: ScenarioExperimentCheckpoint,
) {
  for (const timer of run.processingTimers.values()) clearTimeout(timer);
  run.processingTimers.clear();
  run.producerStatus = checkpoint.producerStatus;
  run.consumers = structuredClone(checkpoint.consumers);
  run.messages = structuredClone(checkpoint.messages);
  run.events = structuredClone(checkpoint.events);
  run.latestPartitionOffsets = structuredClone(
    checkpoint.latestPartitionOffsets,
  );
  run.latestCommittedOffsets = structuredClone(
    checkpoint.latestCommittedOffsets,
  );
  run.messageCounts = structuredClone(checkpoint.messageCounts);
  run.sequence = checkpoint.sequence;
  run.keyState = cloneKeyState(checkpoint.keyState);
  run.scenarioState = structuredClone(checkpoint.scenarioState);
  run.virtualTimeMs = checkpoint.virtualTimeMs;
  run.completedExperimentIds = new Set(checkpoint.completedExperimentIds);
  if (
    checkpoint.demoAdapterCheckpoint &&
    run.adapter instanceof DemoKafkaRuntimeAdapter
  ) {
    run.adapter.restoreRunCheckpoint(
      run.topicName,
      checkpoint.demoAdapterCheckpoint,
    );
  }
}

export function restoreScenarioExperimentProducerStatus(
  run: InternalRun,
  producerStatus: ProducerStatus,
) {
  run.producerStatus = producerStatus;
}

function cloneKeyState<T extends object>(state: T): T {
  return Object.assign(
    Object.create(Object.getPrototypeOf(state)) as T,
    structuredClone(state),
  );
}
