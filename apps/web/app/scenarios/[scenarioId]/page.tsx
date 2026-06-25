import { notFound } from "next/navigation";
import { SCENARIOS } from "@kplay/scenario-engine";
import { PlaygroundWorkspace } from "@/components/playground-workspace";

export default async function ScenarioPage({
  params
}: {
  params: Promise<{ scenarioId: string }>;
}) {
  const { scenarioId } = await params;
  const scenario = SCENARIOS.find((item) => item.id === scenarioId && !item.disabled);
  if (!scenario) notFound();
  return <PlaygroundWorkspace scenarioId={scenario.id} />;
}
