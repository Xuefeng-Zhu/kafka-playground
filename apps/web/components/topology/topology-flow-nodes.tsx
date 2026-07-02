"use client";

import { useEffect } from "react";
import type {
  ConsumerSnapshot,
  PlaygroundMessage,
  RunSnapshot,
} from "@kplay/contracts";
import {
  Handle,
  Position,
  useUpdateNodeInternals,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import type { ScenarioTopologyNode as ScenarioTopologyNodeModel } from "@/lib/client/scenario-topology";
import type { TopologySelection } from "@/lib/client/topology-selection";
import {
  ConsumerCard,
  PartitionLane,
  ProducerCard,
  messagesForPartition,
  toneForPartition,
} from "./topology-cards";
import {
  assignmentHandleTop,
  scenarioIconMap,
  scenarioToneClass,
} from "./topology-flow-helpers";

type TopologyCallbacks = {
  onSelectMessage: (messageId: string) => void;
  onSelectNode: (selection: TopologySelection) => void;
};

export type ProducerNodeData = TopologyCallbacks & {
  status: RunSnapshot["producerStatus"];
  selected: boolean;
};

export type TopicNodeData = TopologyCallbacks & {
  activePartition: number | null;
  assignmentByPartition: Map<number, { consumerId: string }>;
  messageCounts: RunSnapshot["messageCounts"];
  partitions: number[];
  recentMessages: PlaygroundMessage[];
  selectedMessageId: string | null;
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
};

export type ConsumerGroupNodeData = TopologyCallbacks & {
  activeConsumerId: string | null;
  consumers: ConsumerSnapshot[];
  partitions: number[];
  selectedNode: TopologySelection | null;
  snapshot: RunSnapshot;
};

export type ScenarioNodeData = TopologyCallbacks & {
  model: ScenarioTopologyNodeModel;
  selected: boolean;
};

const handleClass =
  "!h-3 !w-3 !border-2 !border-teal-700 !bg-[#fffdf5] !opacity-0";

export const topologyNodeTypes = {
  producer: ProducerFlowNode,
  topic: TopicFlowNode,
  consumerGroup: ConsumerGroupFlowNode,
  scenarioNode: ScenarioOverlayFlowNode,
} satisfies NodeTypes;

function ProducerFlowNode({ data }: NodeProps<Node<ProducerNodeData>>) {
  return (
    <div
      className="nodrag pointer-events-auto relative"
      data-testid="topology-node-producer"
    >
      <ProducerCard
        status={data.status}
        selected={data.selected}
        onSelect={() => data.onSelectNode({ type: "producer" })}
      />
      <Handle
        id="producer-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
    </div>
  );
}

function TopicFlowNode({ id, data }: NodeProps<Node<TopicNodeData>>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [data.partitions.length, id, updateNodeInternals]);

  return (
    <section
      className="nodrag pointer-events-auto relative rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
      data-testid="topology-node-topic"
    >
      <Handle
        id="topic-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <Handle
        id="topic-empty-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
      <button
        type="button"
        onClick={() => data.onSelectNode({ type: "topic" })}
        className={`mb-3 w-full rounded-2xl border-2 px-3 py-2 text-center focus:outline-none focus:ring-4 focus:ring-sky-200 ${
          data.selectedNode?.type === "topic"
            ? "border-teal-700 bg-teal-100 shadow-[0_0_0_5px_rgba(15,118,110,0.14)]"
            : "border-transparent hover:border-teal-700 hover:bg-teal-50"
        }`}
        aria-label="Inspect topic"
      >
        <div className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-teal-700">
          Topic
        </div>
        <div className="mt-1 break-words font-extrabold text-[#123047]">
          {data.snapshot.topicName}
        </div>
        <div className="text-xs font-semibold text-[#466778]">
          {data.snapshot.partitionCount} partitions
        </div>
      </button>
      <div className="space-y-3">
        {data.partitions.map((partition) => (
          <div key={partition} className="relative">
            <PartitionLane
              partition={partition}
              messages={messagesForPartition(data.recentMessages, partition)}
              selectedMessageId={data.selectedMessageId}
              selected={
                data.selectedNode?.type === "partition" &&
                data.selectedNode.partition === partition
              }
              active={data.activePartition === partition}
              onSelect={() =>
                data.onSelectNode({ type: "partition", partition })
              }
              onSelectMessage={data.onSelectMessage}
              latestOffset={
                data.snapshot.latestPartitionOffsets[String(partition)]
              }
              committedOffset={
                data.snapshot.latestCommittedOffsets[String(partition)]
              }
              owner={data.assignmentByPartition.get(partition)}
              messageCount={data.messageCounts[String(partition)] ?? 0}
            />
            <Handle
              id={`partition-${partition}-out`}
              type="source"
              position={Position.Right}
              className={handleClass}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function ConsumerGroupFlowNode({
  id,
  data,
}: NodeProps<Node<ConsumerGroupNodeData>>) {
  const updateNodeInternals = useUpdateNodeInternals();

  useEffect(() => {
    updateNodeInternals(id);
  }, [
    data.consumers,
    data.consumers.length,
    data.partitions.length,
    id,
    updateNodeInternals,
  ]);

  return (
    <section
      className="nodrag pointer-events-auto relative rounded-2xl border-[3px] border-teal-700 bg-[#fffdf5]/95 p-3 shadow-[7px_7px_0_rgba(15,118,110,0.14)]"
      data-testid="topology-node-consumer-group"
    >
      <Handle
        id="empty-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <div className="mb-3 min-w-0 text-center">
        <div className="text-[13px] font-extrabold uppercase tracking-[0.12em] text-[#123047]">
          Consumer Group
        </div>
        <div className="mt-1 truncate text-xs font-semibold text-[#466778]">
          {data.snapshot.consumerGroupId}
        </div>
        <div className="text-xs text-[#466778]">
          {data.consumers.length} consumers
        </div>
      </div>
      <div className="space-y-2">
        {data.consumers.length === 0 ? (
          <p className="rounded-2xl border-[3px] border-dashed border-teal-700 bg-[#fffdf5] p-3 text-xs font-semibold text-[#466778]">
            Add consumers to reveal partition ownership.
          </p>
        ) : (
          data.consumers.map((consumer) => (
            <div key={consumer.consumerId} className="relative">
              {consumer.assignments.map((assignment, index) => (
                <Handle
                  key={assignment.partition}
                  id={`partition-${assignment.partition}-in`}
                  type="target"
                  position={Position.Left}
                  className={handleClass}
                  style={{
                    top: `${assignmentHandleTop(
                      index,
                      consumer.assignments.length,
                    )}%`,
                  }}
                />
              ))}
              <ConsumerCard
                consumer={consumer}
                active={data.activeConsumerId === consumer.consumerId}
                selected={
                  data.selectedNode?.type === "consumer" &&
                  data.selectedNode.consumerId === consumer.consumerId
                }
                onSelect={() =>
                  data.onSelectNode({
                    type: "consumer",
                    consumerId: consumer.consumerId,
                  })
                }
              />
            </div>
          ))
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#466778]">
        <span>Group protocol: consumer (v3)</span>
        {data.partitions.map((partition) => (
          <span
            key={partition}
            className={`rounded-full border-2 px-2 py-0.5 font-extrabold ${toneForPartition(partition).chip}`}
          >
            P{partition}
          </span>
        ))}
      </div>
    </section>
  );
}

function ScenarioOverlayFlowNode({ data }: NodeProps<Node<ScenarioNodeData>>) {
  const { model } = data;
  const Icon = scenarioIconMap[model.icon];
  const tone = scenarioToneClass[model.tone];

  return (
    <div
      className="pointer-events-auto relative cursor-grab active:cursor-grabbing"
      data-testid={`topology-scenario-node-${model.id}`}
    >
      <button
        type="button"
        onClick={() =>
          data.onSelectNode({ type: "scenarioNode", nodeId: model.id })
        }
        aria-label={`Inspect ${model.title}`}
        className={`min-h-24 w-full rounded-xl border-[3px] bg-[#fffdf5]/95 p-3 text-left shadow-[6px_6px_0_rgba(15,118,110,0.13)] focus:outline-none focus:ring-4 focus:ring-sky-200 ${
          data.selected ? "ring-4 ring-sky-200" : ""
        } ${tone.border}`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`grid size-9 shrink-0 place-items-center rounded-xl border-2 bg-white ${tone.border} ${tone.text}`}
          >
            <Icon size={18} aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
              {model.eyebrow}
            </div>
            <div className="mt-0.5 text-sm font-extrabold leading-tight text-[#123047]">
              {model.title}
            </div>
          </div>
        </div>
        <div className="mt-2 line-clamp-2 text-xs font-semibold leading-snug text-[#466778]">
          {model.description}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate text-[10px] font-extrabold uppercase tracking-[0.12em] text-[#466778]">
            {model.metricLabel}
          </span>
          <span
            className={`max-w-24 truncate rounded-full border-2 px-2 py-0.5 text-xs font-extrabold ${tone.chip}`}
          >
            {model.metricValue}
          </span>
        </div>
      </button>
      <Handle
        id="left-in"
        type="target"
        position={Position.Left}
        className={handleClass}
      />
      <Handle
        id="left-out"
        type="source"
        position={Position.Left}
        className={handleClass}
        style={{ top: "68%" }}
      />
      <Handle
        id="right-in"
        type="target"
        position={Position.Right}
        className={handleClass}
        style={{ top: "32%" }}
      />
      <Handle
        id="right-out"
        type="source"
        position={Position.Right}
        className={handleClass}
      />
      <Handle
        id="top-in"
        type="target"
        position={Position.Top}
        className={handleClass}
      />
      <Handle
        id="top-out"
        type="source"
        position={Position.Top}
        className={handleClass}
        style={{ left: "64%" }}
      />
      <Handle
        id="bottom-in"
        type="target"
        position={Position.Bottom}
        className={handleClass}
        style={{ left: "36%" }}
      />
      <Handle
        id="bottom-out"
        type="source"
        position={Position.Bottom}
        className={handleClass}
      />
    </div>
  );
}
