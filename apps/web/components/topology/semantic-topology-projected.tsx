import { Fragment } from "react";
import { EvidenceValueDisplay } from "@/components/learning/evidence-value";
import type { ScenarioExploreTopologyProjection } from "@/lib/client/scenario-experience/explore-topology";
import { SharedCoreNode } from "./semantic-topology-core";
import {
  ScenarioNodeState,
  ScenarioTopologyConnector,
  TopologyConnector,
  TopologyStep,
} from "./semantic-topology-primitives";
import type {
  CoreEntityId,
  SemanticTopologyNodeProps,
} from "./semantic-topology-types";

export function ProjectedSemanticTopology({
  projection,
  sharedNodeProps,
}: {
  projection: ScenarioExploreTopologyProjection;
  sharedNodeProps: SemanticTopologyNodeProps;
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

function ProjectedTopologyNode({
  node,
  ...sharedNodeProps
}: SemanticTopologyNodeProps & {
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

function isCoreEntityId(entityId: string): entityId is CoreEntityId {
  return ["producer", "topic", "consumerGroup"].includes(entityId);
}
