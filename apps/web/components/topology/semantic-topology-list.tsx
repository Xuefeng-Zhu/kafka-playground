"use client";

import { ArrowDown, ArrowUp } from "lucide-react";
import { Fragment, useMemo, type ReactNode } from "react";
import type { RunSnapshot } from "@kplay/contracts";
import {
  EvidenceValueDisplay,
  evidenceScopeText,
} from "@/components/learning/evidence-value";
import { ProvenanceBadge } from "@/components/learning/provenance";
import {
  currentTasksForConsumer,
  hasActiveConsumerTaskDuration,
} from "@/lib/client/current-consumer-task";
import type { ScenarioExploreTopologyProjection } from "@/lib/client/scenario-experience/explore-topology";
import type {
  CausalGraphNode,
  Provenance,
} from "@/lib/client/scenario-experience/model";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { deriveRuntimeTopologyState } from "@/lib/client/runtime-topology-state";
import {
  topologyProvenance,
  type RuntimeTopologyProvenance,
} from "@/lib/client/topology-provenance";
import { useLiveTaskClock } from "@/lib/client/use-live-task-clock";
import {
  ConsumerCard,
  PartitionLane,
  ProducerCard,
  messagesForPartition,
} from "./topology-cards";

export function SemanticTopologyList({
  snapshot,
  scenarioTopology = null,
  selectedMessageId,
  selectedNode,
  selectedScenarioNodeId,
  onSelectMessage,
  onSelectNode,
}: {
  snapshot: RunSnapshot;
  scenarioTopology?: ScenarioExploreTopologyProjection | null;
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  selectedScenarioNodeId: string | null;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
}) {
  const {
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    partitions,
  } = useMemo(() => deriveRuntimeTopologyState(snapshot), [snapshot]);
  const provenance = topologyProvenance(snapshot);
  const taskNowMs = useLiveTaskClock(hasActiveConsumerTaskDuration(snapshot));
  const sharedNodeProps = {
    activeConsumerId,
    activePartition,
    assignmentByPartition,
    onSelectMessage,
    onSelectNode,
    partitions,
    selectedMessageId,
    selectedNode,
    selectedScenarioNodeId,
    snapshot,
    taskNowMs,
  };

  return (
    <ol
      aria-label="Kafka runtime topology"
      className="space-y-3 p-3 sm:p-4"
      data-testid="semantic-topology-list"
    >
      {scenarioTopology ? (
        <ProjectedSemanticTopology
          projection={scenarioTopology}
          sharedNodeProps={sharedNodeProps}
        />
      ) : (
        <CoreSemanticTopology
          provenance={provenance}
          sharedNodeProps={sharedNodeProps}
        />
      )}
    </ol>
  );
}

type SharedNodeProps = {
  activeConsumerId: string | null;
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
  partitions: number[];
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  selectedScenarioNodeId: string | null;
  snapshot: RunSnapshot;
  taskNowMs: number;
};

function ProjectedSemanticTopology({
  projection,
  sharedNodeProps,
}: {
  projection: ScenarioExploreTopologyProjection;
  sharedNodeProps: SharedNodeProps;
}) {
  const edgesBySource = new Map<
    string,
    ScenarioExploreTopologyProjection["edges"][number][]
  >();
  const nodeTitles = new Map(
    projection.nodes.map((node) => [node.id, node.title]),
  );

  for (const edge of projection.edges) {
    const outgoing = edgesBySource.get(edge.source);
    if (outgoing) outgoing.push(edge);
    else edgesBySource.set(edge.source, [edge]);
  }

  return projection.nodes.map((node) => (
    <Fragment key={node.id}>
      <TopologyStep provenance={node.provenance}>
        <ProjectedTopologyNode node={node} {...sharedNodeProps} />
      </TopologyStep>
      {(edgesBySource.get(node.id) ?? []).map((edge) => (
        <ScenarioTopologyConnector
          key={edge.id}
          edge={edge}
          sourceTitle={node.title}
          targetTitle={nodeTitles.get(edge.target) ?? edge.target}
        />
      ))}
      {projection.coreProducerTopicRoute?.source === node.id ? (
        <TopologyConnector
          label={projection.coreProducerTopicRoute.label}
          provenance={projection.coreProducerTopicRoute.provenance}
          testId="semantic-core-edge-producer-topic"
        />
      ) : null}
    </Fragment>
  ));
}

function CoreSemanticTopology({
  provenance,
  sharedNodeProps,
}: {
  provenance: RuntimeTopologyProvenance;
  sharedNodeProps: SharedNodeProps;
}) {
  return (
    <>
      <TopologyStep provenance={provenance}>
        <SharedCoreNode entityId="producer" {...sharedNodeProps} />
      </TopologyStep>
      <TopologyConnector
        label="Routes records to the topic"
        provenance={provenance}
        testId="semantic-core-edge-producer-topic"
      />
      <TopologyStep provenance={provenance}>
        <SharedCoreNode entityId="topic" {...sharedNodeProps} />
      </TopologyStep>
      <TopologyConnector
        label="Partitions are assigned to the group"
        provenance={provenance}
        testId="semantic-core-edge-topic-consumer-group"
      />
      <TopologyStep provenance={provenance}>
        <SharedCoreNode entityId="consumerGroup" {...sharedNodeProps} />
      </TopologyStep>
    </>
  );
}

function ProjectedTopologyNode({
  node,
  ...sharedNodeProps
}: SharedNodeProps & {
  node: ScenarioExploreTopologyProjection["nodes"][number];
}) {
  if (isCoreEntityId(node.entityId)) {
    return <SharedCoreNode entityId={node.entityId} {...sharedNodeProps} />;
  }

  const selected =
    sharedNodeProps.selectedScenarioNodeId === node.entityId ||
    (sharedNodeProps.selectedNode?.type === "scenarioNode" &&
      sharedNodeProps.selectedNode.nodeId === node.entityId);

  return (
    <button
      type="button"
      aria-label={`Inspect ${node.title}`}
      aria-pressed={selected}
      className={`min-h-11 w-full rounded-2xl border-[3px] p-4 text-left shadow-[6px_6px_0_rgba(15,118,110,0.14)] transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-sky-200 ${
        selected
          ? "border-sky-700 bg-sky-100"
          : "border-teal-700 bg-[#fffdf5] hover:bg-teal-50"
      }`}
      data-node-kind={node.nodeKind}
      data-provenance={node.provenance}
      data-testid={`semantic-scenario-node-${node.entityId}`}
      onClick={() =>
        sharedNodeProps.onSelectNode({
          type: "scenarioNode",
          nodeId: node.entityId,
        })
      }
    >
      <span className="flex flex-wrap items-start justify-between gap-2">
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
            {node.title}
          </span>
          <span className="mt-1 block break-words text-xs font-semibold leading-5 text-[#466778] [overflow-wrap:anywhere]">
            {node.description}
          </span>
        </span>
        <span className="rounded-full border-2 border-teal-700 bg-teal-50 px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-teal-800">
          Scenario step
        </span>
      </span>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {node.state ? <ScenarioNodeState state={node.state} /> : null}
        {node.metric ? (
          <EvidenceValueDisplay
            value={node.metric}
            showProvenance={node.metric.provenance !== node.provenance}
          />
        ) : null}
      </div>
    </button>
  );
}

function SharedCoreNode({
  entityId,
  activeConsumerId,
  activePartition,
  assignmentByPartition,
  onSelectMessage,
  onSelectNode,
  partitions,
  selectedMessageId,
  selectedNode,
  snapshot,
  taskNowMs,
}: SharedNodeProps & { entityId: CoreEntityId }) {
  if (entityId === "producer") {
    return (
      <ProducerCard
        status={snapshot.producerStatus}
        selected={selectedNode?.type === "producer"}
        onSelect={() => onSelectNode({ type: "producer" })}
      />
    );
  }

  if (entityId === "topic") {
    return (
      <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[6px_6px_0_rgba(15,118,110,0.14)]">
        <button
          type="button"
          aria-label="Inspect topic"
          aria-pressed={selectedNode?.type === "topic"}
          onClick={() => onSelectNode({ type: "topic" })}
          className={`mb-3 min-h-11 w-full rounded-2xl border-2 px-3 py-2 text-center focus:outline-none focus:ring-4 focus:ring-sky-200 ${
            selectedNode?.type === "topic"
              ? "border-teal-700 bg-teal-100"
              : "border-transparent hover:border-teal-700 hover:bg-teal-50"
          }`}
        >
          <span className="block text-xs font-extrabold uppercase tracking-[0.14em] text-teal-700">
            Topic
          </span>
          <span className="mt-1 block break-all font-extrabold text-[#123047]">
            {snapshot.topicName}
          </span>
          <span className="block text-xs font-semibold text-[#466778]">
            {snapshot.partitionCount} partitions
          </span>
        </button>
        <div className="space-y-3">
          {partitions.map((partition) => (
            <PartitionLane
              key={partition}
              partition={partition}
              messages={messagesForPartition(
                snapshot.recentMessages,
                partition,
              )}
              selectedMessageId={selectedMessageId}
              selected={
                selectedNode?.type === "partition" &&
                selectedNode.partition === partition
              }
              active={activePartition === partition}
              latestOffset={snapshot.latestPartitionOffsets[String(partition)]}
              committedOffset={
                snapshot.latestCommittedOffsets[String(partition)]
              }
              owner={assignmentByPartition.get(partition)}
              messageCount={snapshot.messageCounts[String(partition)] ?? 0}
              provenance={topologyProvenance(snapshot)}
              onSelect={() => onSelectNode({ type: "partition", partition })}
              onSelectMessage={onSelectMessage}
            />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[6px_6px_0_rgba(15,118,110,0.14)]">
      <button
        type="button"
        aria-label="Inspect consumer group"
        aria-pressed={selectedNode?.type === "consumerGroup"}
        onClick={() => onSelectNode({ type: "consumerGroup" })}
        className={`mb-3 min-h-11 w-full rounded-2xl border-2 px-3 py-2 text-center focus:outline-none focus:ring-4 focus:ring-sky-200 ${
          selectedNode?.type === "consumerGroup"
            ? "border-teal-700 bg-teal-100"
            : "border-transparent hover:border-teal-700 hover:bg-teal-50"
        }`}
      >
        <span className="block text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#123047]">
          Consumer Group
        </span>
        <span className="mt-1 block break-all text-xs font-semibold text-[#466778]">
          {snapshot.consumerGroupId}
        </span>
        <span className="block text-xs text-[#466778]">
          {snapshot.consumers.length} consumers
        </span>
      </button>
      <div className="space-y-2">
        {snapshot.consumers.length === 0 ? (
          <p className="rounded-2xl border-[3px] border-dashed border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold text-[#466778]">
            Add consumers to reveal partition ownership.
          </p>
        ) : (
          snapshot.consumers.map((consumer) => (
            <ConsumerCard
              key={consumer.consumerId}
              consumer={consumer}
              currentTasks={currentTasksForConsumer(
                snapshot,
                consumer.consumerId,
                taskNowMs,
              )}
              active={activeConsumerId === consumer.consumerId}
              selected={
                selectedNode?.type === "consumer" &&
                selectedNode.consumerId === consumer.consumerId
              }
              onSelect={() =>
                onSelectNode({
                  type: "consumer",
                  consumerId: consumer.consumerId,
                })
              }
            />
          ))
        )}
      </div>
    </section>
  );
}

function TopologyStep({
  provenance,
  children,
}: {
  provenance: Provenance;
  children: ReactNode;
}) {
  return (
    <li className="relative">
      <div className="absolute right-2 top-2 z-10">
        <ProvenanceBadge provenance={provenance} />
      </div>
      <div className="pt-9">{children}</div>
    </li>
  );
}

function ScenarioTopologyConnector({
  edge,
  sourceTitle,
  targetTitle,
}: {
  edge: ScenarioExploreTopologyProjection["edges"][number];
  sourceTitle: string;
  targetTitle: string;
}) {
  const isFeedback = edge.kind === "feedback";
  const DirectionIcon = isFeedback ? ArrowUp : ArrowDown;
  return (
    <li
      aria-label={`${sourceTitle} ${isFeedback ? "back to" : "to"} ${targetTitle}: ${edge.label}. ${humanize(edge.kind)}. ${humanize(edge.provenance)}.`}
      className={`flex min-h-11 items-center gap-3 rounded-xl border-l-[3px] border-dashed px-3 py-2 ${
        isFeedback
          ? "border-violet-600 bg-violet-50"
          : edge.active
            ? "border-emerald-600 bg-emerald-50"
            : "border-teal-700 bg-[#fffdf5]/80"
      }`}
      data-direction={isFeedback ? "backward" : "forward"}
      data-edge-kind={edge.kind}
      data-provenance={edge.provenance}
      data-testid={`semantic-scenario-edge-${edge.id}`}
    >
      <DirectionIcon
        className={`shrink-0 ${isFeedback ? "text-violet-700" : "text-teal-700"}`}
        data-testid={`semantic-edge-direction-${edge.id}`}
        size={18}
        aria-hidden
      />
      <span className="min-w-0 flex-1">
        <span className="block break-words text-xs font-black leading-5 text-[#123047] [overflow-wrap:anywhere]">
          {edge.label}
        </span>
        <span className="block break-words text-xs font-semibold leading-4 text-[#466778] [overflow-wrap:anywhere]">
          {sourceTitle} {isFeedback ? "↩ back to" : "→"} {targetTitle} ·{" "}
          {humanize(edge.kind)} · {evidenceScopeText(edge.scope)}
        </span>
      </span>
      {edge.active ? (
        <span className="rounded-full border-2 border-emerald-600 bg-emerald-100 px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-emerald-900">
          Active route
        </span>
      ) : null}
      <ProvenanceBadge provenance={edge.provenance} />
    </li>
  );
}

function TopologyConnector({
  label,
  provenance,
  testId,
}: {
  label: string;
  provenance: Provenance;
  testId: string;
}) {
  return (
    <li
      aria-label={`${label}. ${humanize(provenance)}.`}
      className="flex min-h-11 flex-wrap items-center justify-center gap-2 text-center text-xs font-extrabold text-teal-800"
      data-provenance={provenance}
      data-testid={testId}
    >
      <ArrowDown size={18} aria-hidden />
      <span>{label}</span>
      <ProvenanceBadge provenance={provenance} />
    </li>
  );
}

function ScenarioNodeState({ state }: { state: CausalGraphNode["state"] }) {
  if (!state) return null;
  return (
    <span className="rounded-full border-2 border-sky-700 bg-sky-50 px-2 py-1 text-xs font-black uppercase tracking-[0.08em] text-sky-900">
      {humanize(state)}
    </span>
  );
}

type CoreEntityId = "producer" | "topic" | "consumerGroup";

function isCoreEntityId(entityId: string): entityId is CoreEntityId {
  return ["producer", "topic", "consumerGroup"].includes(entityId);
}

function humanize(value: string) {
  return value.replaceAll("-", " ");
}
