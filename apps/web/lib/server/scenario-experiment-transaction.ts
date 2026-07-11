import "server-only";
import type { ProducerStatus } from "@kplay/contracts";
import { DemoKafkaRuntimeAdapter } from "@kplay/kafka-runtime";
import type { InternalRun } from "./playground-runtime-state";

export type ScenarioExperimentCheckpoint = ReturnType<
  typeof captureScenarioExperimentCheckpoint
>;

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
