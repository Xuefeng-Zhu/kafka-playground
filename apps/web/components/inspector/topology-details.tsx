import type { RunSnapshot } from "@kplay/contracts";
import type { TopologySelection } from "@/lib/client/topology-selection";
import { deriveScenarioTopology } from "@/lib/client/scenario-topology";
import { keyStrategyLabel } from "@/lib/client/key-strategy-label";

export function TopologyDetails({
  snapshot,
  selectedNode,
}: {
  snapshot: RunSnapshot;
  selectedNode: TopologySelection;
}) {
  if (selectedNode.type === "producer") {
    return (
      <>
        <TopologyHeader
          title="Producer"
          detail="Source node for keyed messages"
          tone="teal"
        />
        <DetailSection
          title="Producer Metrics"
          rows={[
            ["Status", snapshot.producerStatus],
            ["Run status", snapshot.status],
            ["Rate", `${snapshot.productionRate} messages/sec`],
            ["Key strategy", keyStrategyLabel(snapshot.keyStrategy, "detail")],
            ["Recent messages", String(snapshot.recentMessages.length)],
          ]}
        />
      </>
    );
  }

  if (selectedNode.type === "topic") {
    return (
      <>
        <TopologyHeader title="Topic" detail={snapshot.topicName} tone="teal" />
        <DetailSection
          title="Topic Metrics"
          rows={[
            ["Partitions", String(snapshot.partitionCount)],
            ["Consumer group", snapshot.consumerGroupId],
            ["Total observed messages", String(totalMessages(snapshot))],
            [
              "Latest offsets",
              partitionRecord(
                snapshot.latestPartitionOffsets,
                snapshot.partitionCount,
              ),
            ],
            [
              "Committed offsets",
              partitionRecord(
                snapshot.latestCommittedOffsets,
                snapshot.partitionCount,
              ),
            ],
          ]}
        />
      </>
    );
  }

  if (selectedNode.type === "partition") {
    const partition = selectedNode.partition;
    const owner = snapshot.consumers.find((consumer) =>
      consumer.assignments.some(
        (assignment) => assignment.partition === partition,
      ),
    );
    return (
      <>
        <TopologyHeader
          title={`Partition ${partition}`}
          detail="Ownership and offset state"
          tone={partition === 0 ? "sky" : "violet"}
        />
        <DetailSection
          title="Partition Metrics"
          rows={[
            ["Owner", owner?.consumerId ?? "Unassigned"],
            [
              "Latest offset",
              snapshot.latestPartitionOffsets[String(partition)] ?? "None",
            ],
            [
              "Committed offset",
              snapshot.latestCommittedOffsets[String(partition)] ?? "None",
            ],
            [
              "Observed messages",
              String(snapshot.messageCounts[String(partition)] ?? 0),
            ],
            [
              "Recent lane messages",
              String(
                snapshot.recentMessages.filter(
                  (message) => message.partition === partition,
                ).length,
              ),
            ],
          ]}
        />
      </>
    );
  }

  if (selectedNode.type === "scenarioNode") {
    const scenarioNode = deriveScenarioTopology(snapshot).nodes.find(
      (node) => node.id === selectedNode.nodeId,
    );
    if (!scenarioNode) {
      return (
        <>
          <TopologyHeader
            title="Scenario overlay"
            detail="This overlay is no longer active in the current snapshot."
            tone="teal"
          />
          <div className="p-5 text-sm text-[#466778]">
            Select another topology node to inspect current run details.
          </div>
        </>
      );
    }

    return (
      <>
        <TopologyHeader
          title={scenarioNode.title}
          detail={scenarioNode.description}
          tone={scenarioNode.tone}
        />
        <DetailSection
          title={scenarioNode.eyebrow}
          rows={[
            [scenarioNode.metricLabel, scenarioNode.metricValue],
            ...scenarioNode.details,
          ]}
        />
      </>
    );
  }

  const consumer = snapshot.consumers.find(
    (item) => item.consumerId === selectedNode.consumerId,
  );
  return (
    <>
      <TopologyHeader
        title={selectedNode.consumerId}
        detail="Consumer group member"
        tone={
          consumer?.status === "crashed"
            ? "rose"
            : consumer?.assignments.length
              ? "emerald"
              : "amber"
        }
      />
      {consumer ? (
        <DetailSection
          title="Consumer Metrics"
          rows={[
            ["Status", consumer.status],
            [
              "Assignments",
              consumer.status === "crashed"
                ? "Crashed"
                : consumer.assignments.length
                  ? consumer.assignments
                      .map((assignment) => `P${assignment.partition}`)
                      .join(", ")
                  : "Idle",
            ],
            ["Processed", String(consumer.processedCount)],
            ["Committed", String(consumer.committedCount)],
            ["Group", snapshot.consumerGroupId],
          ]}
        />
      ) : (
        <div className="p-5 text-sm text-[#466778]">
          This consumer is no longer active in the current snapshot.
        </div>
      )}
    </>
  );
}

function TopologyHeader({
  title,
  detail,
  tone,
}: {
  title: string;
  detail: string;
  tone: "amber" | "emerald" | "rose" | "sky" | "teal" | "violet";
}) {
  const toneClass = {
    amber: "border-amber-500 bg-amber-100 text-amber-900",
    emerald: "border-emerald-500 bg-emerald-100 text-emerald-900",
    rose: "border-rose-500 bg-rose-100 text-rose-900",
    sky: "border-sky-500 bg-sky-50 text-sky-900",
    teal: "border-teal-700 bg-teal-100 text-teal-900",
    violet: "border-violet-500 bg-violet-50 text-violet-900",
  }[tone];
  return (
    <section className={`border-b-[3px] border-teal-700 p-5 ${toneClass}`}>
      <div className="text-sm font-semibold opacity-80">
        Selected topology node
      </div>
      <div className="mt-2 rounded-2xl border-[3px] border-current bg-[#fffdf5]/75 px-3 py-2 text-sm font-extrabold shadow-[7px_7px_0_rgba(15,118,110,0.12)]">
        {title}
      </div>
      <p className="mt-3 text-sm font-semibold opacity-85">{detail}</p>
    </section>
  );
}

function DetailSection({
  title,
  rows,
}: {
  title: string;
  rows: Array<[string, string]>;
}) {
  return (
    <section className="p-5">
      <h3 className="mb-3 kplay-section-title">{title}</h3>
      <dl className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([label, value], index) => (
          <div key={`${label}-${index}`} className="contents">
            <dt className="text-[#466778]">{label}</dt>
            <dd className="min-w-0 break-words font-semibold text-[#123047]">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function partitionRecord(
  record: Record<string, string>,
  partitionCount: number,
) {
  return Array.from(
    { length: partitionCount },
    (_, partition) => `P${partition}: ${record[String(partition)] ?? "none"}`,
  ).join(" / ");
}

function totalMessages(snapshot: RunSnapshot) {
  return snapshot.messageCounts.produced ?? 0;
}
