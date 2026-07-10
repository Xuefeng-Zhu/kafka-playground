import "server-only";
import type {
  ConsumerSnapshot,
  KafkaMode,
  KeyStrategy,
  PlaygroundMessage,
  ProducerStatus,
  RunSnapshot,
  RunStatus,
  RuntimeEvent,
  ScenarioState,
  ScenarioDefinition,
} from "@kplay/contracts";
import type {
  CreateRunInput,
  KafkaRuntimeAdapter,
  PlaygroundConsumerHandle,
} from "@kplay/kafka-runtime";
import {
  KeyStrategyState,
  defaultKeyStrategyForScenario,
  defaultProcessingLatencyForScenario,
} from "@kplay/scenario-engine";
import type { RuntimeSubscriber } from "./runtime-event-hub";
import { createInitialScenarioState } from "./scenario-experiments";

export type InternalRun = CreateRunInput & {
  mode: KafkaMode;
  adapter: KafkaRuntimeAdapter;
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
  subscribers: Map<string, RuntimeSubscriber>;
  scenarioState: ScenarioState | null;
  virtualTimeMs: number;
  inFlightExperimentId: string | null;
  completedExperimentIds: Set<string>;
};

export function createInternalRun({
  runId,
  adapter,
  mode,
  scenario,
  names,
}: {
  runId: string;
  adapter: KafkaRuntimeAdapter;
  mode: KafkaMode;
  scenario: ScenarioDefinition;
  names: Pick<CreateRunInput, "topicName" | "consumerGroupId">;
}): InternalRun {
  return {
    runId,
    scenarioId: scenario.id,
    mode,
    adapter,
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
    // Deterministic teaching state is a demo-only projection. Remote runs stay
    // on the observed broker renderer until a scenario has a matching remote
    // experiment implementation.
    scenarioState:
      mode === "demo" ? createInitialScenarioState(scenario.id) : null,
    virtualTimeMs: 0,
    inFlightExperimentId: null,
    completedExperimentIds: new Set(),
  };
}

export function createRunSnapshot(
  run: InternalRun,
  consumerLimit: number,
  timelineDisplayLimit: number,
): RunSnapshot {
  return {
    runId: run.runId,
    scenarioId: run.scenarioId,
    mode: run.mode,
    status: run.status,
    topicName: run.topicName,
    partitionCount: run.partitionCount,
    consumerLimit,
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
    recentEvents: run.events.slice(-timelineDisplayLimit),
    cleanupStatus: run.cleanupStatus,
    sequence: run.sequence,
    scenarioState: run.scenarioState,
  };
}
