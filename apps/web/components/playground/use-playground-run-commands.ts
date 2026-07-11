"use client";

import { useCallback, useLayoutEffect, useRef } from "react";
import type {
  KeyStrategy,
  RemoteKafkaConfig,
  RunSnapshot,
  UserSelectableKafkaMode,
} from "@kplay/contracts";
import {
  mutateRun as requestRunMutation,
  produceMessage,
  retireRun,
  startScenarioRun,
  testKafkaConnection,
} from "@/lib/client/playground-api";

type RunAction = (action: () => Promise<void>) => Promise<boolean>;

type UsePlaygroundRunCommandsOptions = {
  scenarioId: string;
  runId: string | null;
  runAction: RunAction;
  pushRoute(path: string): void;
  closeLiveUpdates(): void;
  clearRunSelection(): void;
  onSnapshot(snapshot: RunSnapshot): void;
  onRunStarted(snapshot: RunSnapshot): void;
  onMessageProduced(snapshot: RunSnapshot): void;
};

type CommandOperation = {
  generation: number;
};

type CommandCallbacks = Pick<
  UsePlaygroundRunCommandsOptions,
  | "clearRunSelection"
  | "closeLiveUpdates"
  | "onMessageProduced"
  | "onRunStarted"
  | "onSnapshot"
  | "pushRoute"
>;

type SnapshotPublication = "messageProduced" | "runStarted" | "snapshot";

export function usePlaygroundRunCommands({
  scenarioId,
  runId,
  runAction,
  pushRoute,
  closeLiveUpdates,
  clearRunSelection,
  onSnapshot,
  onRunStarted,
  onMessageProduced,
}: UsePlaygroundRunCommandsOptions) {
  const generationRef = useRef(0);
  const identityRef = useRef({ runId, scenarioId });
  const isMountedRef = useRef(true);
  const callbacksRef = useRef<CommandCallbacks>({
    clearRunSelection,
    closeLiveUpdates,
    onMessageProduced,
    onRunStarted,
    onSnapshot,
    pushRoute,
  });

  useLayoutEffect(() => {
    callbacksRef.current = {
      clearRunSelection,
      closeLiveUpdates,
      onMessageProduced,
      onRunStarted,
      onSnapshot,
      pushRoute,
    };
  }, [
    clearRunSelection,
    closeLiveUpdates,
    onMessageProduced,
    onRunStarted,
    onSnapshot,
    pushRoute,
  ]);

  useLayoutEffect(() => {
    const currentIdentity = identityRef.current;
    if (
      currentIdentity.runId === runId &&
      currentIdentity.scenarioId === scenarioId
    ) {
      return;
    }
    identityRef.current = { runId, scenarioId };
    generationRef.current += 1;
  }, [runId, scenarioId]);

  useLayoutEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      generationRef.current += 1;
    };
  }, []);

  const beginOperation = useCallback(
    (): CommandOperation => ({ generation: generationRef.current }),
    [],
  );

  const isCurrentOperation = useCallback(
    (operation: CommandOperation) =>
      isMountedRef.current && generationRef.current === operation.generation,
    [],
  );

  const publishSnapshot = useCallback(
    (
      operation: CommandOperation,
      snapshot: RunSnapshot,
      publication: SnapshotPublication,
    ) => {
      if (!isMountedRef.current) return;

      if (snapshot.scenarioId !== identityRef.current.scenarioId) {
        callbacksRef.current.pushRoute(`/scenarios/${snapshot.scenarioId}`);
        return;
      }
      if (!isCurrentOperation(operation)) return;

      if (publication === "runStarted") {
        callbacksRef.current.onRunStarted(snapshot);
        return;
      }
      if (publication === "messageProduced") {
        callbacksRef.current.onMessageProduced(snapshot);
        return;
      }
      callbacksRef.current.onSnapshot(snapshot);
    },
    [isCurrentOperation],
  );

  const executeSnapshotCommand = useCallback(
    async (
      operation: CommandOperation,
      request: () => Promise<RunSnapshot>,
      publication: SnapshotPublication,
    ) => {
      try {
        publishSnapshot(operation, await request(), publication);
      } catch (error) {
        if (isCurrentOperation(operation)) throw error;
      }
    },
    [isCurrentOperation, publishSnapshot],
  );

  const retireActiveRun = useCallback(
    async (
      activeRunId: string,
      operation: CommandOperation,
      onRetired?: () => void,
    ) => {
      try {
        await retireRun(activeRunId);
      } catch (error) {
        if (isCurrentOperation(operation)) throw error;
        return false;
      }
      if (!isCurrentOperation(operation)) return false;

      callbacksRef.current.closeLiveUpdates();
      callbacksRef.current.clearRunSelection();
      onRetired?.();
      return true;
    },
    [isCurrentOperation],
  );

  const startRun = useCallback(
    async (input: {
      mode: UserSelectableKafkaMode;
      remoteKafkaConfig?: RemoteKafkaConfig;
    }) => {
      const operation = beginOperation();
      await runAction(async () => {
        await executeSnapshotCommand(
          operation,
          () =>
            startScenarioRun({
              scenarioId,
              mode: input.mode,
              remoteKafkaConfig: input.remoteKafkaConfig,
            }),
          "runStarted",
        );
      });
    },
    [beginOperation, executeSnapshotCommand, runAction, scenarioId],
  );

  const testRemoteConnection = useCallback(
    (remoteKafkaConfig: RemoteKafkaConfig) =>
      testKafkaConnection(remoteKafkaConfig),
    [],
  );

  const resetRun = useCallback(async () => {
    if (!runId) return;
    const operation = beginOperation();
    await runAction(async () => {
      await retireActiveRun(runId, operation);
    });
  }, [beginOperation, retireActiveRun, runAction, runId]);

  const navigateToScenario = useCallback(
    async (nextScenarioId: string) => {
      if (nextScenarioId === scenarioId) return;
      const path = `/scenarios/${nextScenarioId}`;
      if (!runId) {
        pushRoute(path);
        return;
      }
      const operation = beginOperation();
      await runAction(async () => {
        await retireActiveRun(runId, operation, () => {
          callbacksRef.current.pushRoute(path);
        });
      });
    },
    [beginOperation, pushRoute, retireActiveRun, runAction, runId, scenarioId],
  );

  const mutate = useCallback(
    async (path: string, init?: RequestInit) => {
      if (!runId) return;
      const operation = beginOperation();
      await runAction(async () => {
        await executeSnapshotCommand(
          operation,
          () => requestRunMutation(runId, path, init),
          "snapshot",
        );
      });
    },
    [beginOperation, executeSnapshotCommand, runAction, runId],
  );

  const updateSettings = useCallback(
    async (settings: {
      productionRate?: number;
      keyStrategy?: KeyStrategy;
      processingLatencyMs?: number;
    }) => {
      await mutate("/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
    },
    [mutate],
  );

  const produceOne = useCallback(async () => {
    if (!runId) return;
    const operation = beginOperation();
    await runAction(async () => {
      await executeSnapshotCommand(
        operation,
        () => produceMessage(runId),
        "messageProduced",
      );
    });
  }, [beginOperation, executeSnapshotCommand, runAction, runId]);

  return {
    mutate,
    navigateToScenario,
    produceOne,
    resetRun,
    startRun,
    testRemoteConnection,
    updateSettings,
  } as const;
}
