"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { RunSnapshot } from "@kplay/contracts";
import { runScenarioExperiment } from "@/lib/client/playground-api";

type RunAction = (action: () => Promise<void>) => Promise<boolean>;

type UseTeachingExperimentOptions = {
  runId: string | null;
  runAction: RunAction;
  onSnapshot(snapshot: RunSnapshot): void;
};

type ExperimentOperation = {
  generation: number;
  runId: string;
};

export function useTeachingExperiment({
  runId,
  runAction,
  onSnapshot,
}: UseTeachingExperimentOptions) {
  const generationRef = useRef(0);
  const inFlightRef = useRef<ExperimentOperation | null>(null);
  const isMountedRef = useRef(true);
  const previousRunIdRef = useRef(runId);
  const [pendingExperimentId, setPendingExperimentId] = useState<string | null>(
    null,
  );
  const [experimentError, setExperimentError] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");

  const invalidateTeachingExperiment = useCallback(() => {
    generationRef.current += 1;
    inFlightRef.current = null;
  }, []);

  const resetTeachingExperiment = useCallback(() => {
    invalidateTeachingExperiment();
    setPendingExperimentId(null);
    setExperimentError(null);
    setAnnouncement("");
  }, [invalidateTeachingExperiment]);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      invalidateTeachingExperiment();
    };
  }, [invalidateTeachingExperiment]);

  useLayoutEffect(() => {
    if (previousRunIdRef.current === runId) return;
    previousRunIdRef.current = runId;
    resetTeachingExperiment();
  }, [resetTeachingExperiment, runId]);

  const runTeachingExperiment = useCallback(
    async (experimentId: string) => {
      if (!runId) return false;
      const activeOperation = inFlightRef.current;
      if (
        activeOperation?.runId === runId &&
        activeOperation.generation === generationRef.current
      ) {
        return false;
      }

      const operation = {
        generation: generationRef.current + 1,
        runId,
      } satisfies ExperimentOperation;
      generationRef.current = operation.generation;
      inFlightRef.current = operation;
      const isCurrentOperation = () =>
        isMountedRef.current && generationRef.current === operation.generation;
      setPendingExperimentId(experimentId);
      setExperimentError(null);
      setAnnouncement(`Running experiment ${experimentId}.`);
      let failureMessage: string | null = null;
      let invalidated = false;
      try {
        const completed = await runAction(async () => {
          try {
            const snapshot = await runScenarioExperiment(runId, experimentId);
            if (!isCurrentOperation()) {
              invalidated = true;
              return;
            }
            onSnapshot(snapshot);
            if (!isCurrentOperation()) {
              invalidated = true;
              return;
            }
            setAnnouncement(
              `${experimentId} completed with authoritative scenario evidence.`,
            );
          } catch (error) {
            if (!isCurrentOperation()) {
              invalidated = true;
              return;
            }
            const message =
              error instanceof Error ? error.message : "Experiment failed.";
            failureMessage = message;
            setExperimentError(message);
            setAnnouncement(`${experimentId} failed: ${message}`);
            throw error;
          }
        });
        if (invalidated || !isCurrentOperation()) return false;
        if (!completed && failureMessage === null) {
          const message = "The experiment could not start.";
          setExperimentError(message);
          setAnnouncement(`${experimentId} could not start.`);
        }
        return completed;
      } finally {
        if (isCurrentOperation()) {
          inFlightRef.current = null;
          setPendingExperimentId(null);
        }
      }
    },
    [onSnapshot, runAction, runId],
  );

  return {
    announcement,
    experimentError,
    pendingExperimentId,
    resetTeachingExperiment,
    runTeachingExperiment,
  } as const;
}
