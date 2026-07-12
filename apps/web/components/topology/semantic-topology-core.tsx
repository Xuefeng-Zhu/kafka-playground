import { currentTasksForConsumer } from "@/lib/client/current-consumer-task";
import type { RuntimeTopologyProvenance } from "@/lib/client/topology-provenance";
import { topologyProvenance } from "@/lib/client/topology-provenance";
import {
  ConsumerCard,
  PartitionLane,
  ProducerCard,
  messagesForPartition,
} from "./topology-cards";
import {
  TopologyConnector,
  TopologyStep,
} from "./semantic-topology-primitives";
import type {
  CoreEntityId,
  SemanticTopologyNodeProps,
} from "./semantic-topology-types";

export function CoreSemanticTopology({
  provenance,
  sharedNodeProps,
}: {
  provenance: RuntimeTopologyProvenance;
  sharedNodeProps: SemanticTopologyNodeProps;
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

export function SharedCoreNode({
  entityId,
  ...props
}: SemanticTopologyNodeProps & { entityId: CoreEntityId }) {
  if (entityId === "producer") {
    return (
      <ProducerCard
        status={props.snapshot.producerStatus}
        selected={props.selectedNode?.type === "producer"}
        onSelect={() => props.onSelectNode({ type: "producer" })}
      />
    );
  }
  if (entityId === "topic") return <SemanticTopicNode {...props} />;
  return <SemanticConsumerGroupNode {...props} />;
}

function SemanticTopicNode({
  activePartition,
  assignmentByPartition,
  onSelectMessage,
  onSelectNode,
  partitions,
  selectedMessageId,
  selectedNode,
  snapshot,
}: SemanticTopologyNodeProps) {
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
            messages={messagesForPartition(snapshot.recentMessages, partition)}
            selectedMessageId={selectedMessageId}
            selected={
              selectedNode?.type === "partition" &&
              selectedNode.partition === partition
            }
            active={activePartition === partition}
            latestOffset={snapshot.latestPartitionOffsets[String(partition)]}
            committedOffset={snapshot.latestCommittedOffsets[String(partition)]}
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

function SemanticConsumerGroupNode({
  activeConsumerId,
  onSelectNode,
  selectedNode,
  snapshot,
  taskNowMs,
}: SemanticTopologyNodeProps) {
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
