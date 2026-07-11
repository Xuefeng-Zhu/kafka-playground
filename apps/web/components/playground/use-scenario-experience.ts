"use client";

import { useMemo } from "react";
import type {
  RunSnapshot,
  RuntimeEvent,
  ScenarioExperimentId,
} from "@kplay/contracts";
import {
  isScenarioExperienceSupported,
  resolveScenarioExperience,
  type ScenarioExperienceSnapshot,
} from "@/lib/client/scenario-experience";
import { experimentTransitionTrail } from "@/lib/client/scenario-experience/definition-helpers";

type UseScenarioExperienceOptions = {
  run: RunSnapshot | null;
  scenarioId: string;
  events: readonly RuntimeEvent[];
  pendingExperimentId: ScenarioExperimentId | null;
};

export function useScenarioExperience({
  run,
  scenarioId,
  events,
  pendingExperimentId,
}: UseScenarioExperienceOptions) {
  const experienceScenarioId = run?.scenarioId ?? null;
  const experienceScenarioState = run?.scenarioState;
  const experienceMode = run?.mode ?? null;
  const experiencePartitionCount = run?.partitionCount ?? null;
  const experienceTopicName = run?.topicName ?? null;
  const experienceRecentMessages = run?.recentMessages ?? null;
  const experienceCompletedExperimentIds = run?.completedExperimentIds ?? null;
  const experienceSnapshot = useMemo<ScenarioExperienceSnapshot | null>(() => {
    if (
      experienceScenarioId === null ||
      experienceMode === null ||
      experiencePartitionCount === null ||
      experienceTopicName === null ||
      experienceRecentMessages === null ||
      experienceCompletedExperimentIds === null
    ) {
      return null;
    }
    return {
      scenarioId: experienceScenarioId,
      scenarioState: experienceScenarioState,
      mode: experienceMode,
      partitionCount: experiencePartitionCount,
      topicName: experienceTopicName,
      recentMessages: experienceRecentMessages,
      completedExperimentIds: experienceCompletedExperimentIds,
    };
  }, [
    experienceMode,
    experienceCompletedExperimentIds,
    experiencePartitionCount,
    experienceRecentMessages,
    experienceScenarioId,
    experienceScenarioState,
    experienceTopicName,
  ]);
  const experienceResolution = useMemo(
    () =>
      experienceSnapshot ? resolveScenarioExperience(experienceSnapshot) : null,
    [experienceSnapshot],
  );
  const activeExperimentId =
    pendingExperimentId ??
    (experienceResolution?.kind === "experience"
      ? experienceResolution.frame.experiment.experimentId
      : null);
  const experimentTransitions = useMemo(
    () => experimentTransitionTrail(events, scenarioId, activeExperimentId),
    [activeExperimentId, events, scenarioId],
  );
  const isTeachingExperience = experienceResolution?.kind === "experience";
  const isSupportedScenario = isScenarioExperienceSupported(
    run?.scenarioId ?? scenarioId,
  );
  const canUseGuidedView = isTeachingExperience && run?.mode === "demo";

  return {
    canUseGuidedView,
    experienceResolution,
    experimentTransitions,
    showWorkspaceViewSwitch: canUseGuidedView || (!run && isSupportedScenario),
  } as const;
}
