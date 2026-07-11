"use client";

import { useEffect } from "react";
import type {
  ConnectionStatus,
  RunSnapshot,
  ScenarioDefinition,
} from "@kplay/contracts";
import {
  loadActiveRunSnapshot,
  loadConnectionStatus,
  loadScenarioDefinitions,
} from "@/lib/client/playground-api";

type UsePlaygroundBootstrapOptions = {
  scenarioId: string;
  clearRunSelection(): void;
  onConnection(connection: ConnectionStatus | null): void;
  onScenarios(scenarios: ScenarioDefinition[]): void;
  onSnapshot(snapshot: RunSnapshot): void;
  replaceRoute(path: string): void;
  setActionError(message: string | null): void;
};

export function usePlaygroundBootstrap({
  scenarioId,
  clearRunSelection,
  onConnection,
  onScenarios,
  onSnapshot,
  replaceRoute,
  setActionError,
}: UsePlaygroundBootstrapOptions) {
  useEffect(() => {
    let cancelled = false;

    void loadConnectionStatus().then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          onConnection(result.data);
          return;
        }
        onConnection(null);
        setActionError(result.message);
      },
      (error) => {
        if (!cancelled) {
          setActionError(
            describeUnexpectedLoadError(
              error,
              "Unable to load Kafka connection.",
            ),
          );
        }
      },
    );

    void loadScenarioDefinitions().then(
      (result) => {
        if (cancelled) return;
        if (result.ok) {
          onScenarios(result.data);
          return;
        }
        onScenarios([]);
        setActionError(result.message);
      },
      (error) => {
        if (!cancelled) {
          setActionError(
            describeUnexpectedLoadError(error, "Unable to load scenarios."),
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [onConnection, onScenarios, setActionError]);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) clearRunSelection();
    });

    void loadActiveRunSnapshot().then(
      (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setActionError(result.message);
          return;
        }
        const snapshot = result.data;
        if (!snapshot) return;
        if (snapshot.scenarioId === scenarioId) {
          onSnapshot(snapshot);
          return;
        }
        replaceRoute(`/scenarios/${snapshot.scenarioId}`);
      },
      (error) => {
        if (!cancelled) {
          setActionError(
            describeUnexpectedLoadError(
              error,
              "Unable to load the active run.",
            ),
          );
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [clearRunSelection, onSnapshot, replaceRoute, scenarioId, setActionError]);
}

function describeUnexpectedLoadError(error: unknown, fallback: string) {
  return error instanceof Error && error.message
    ? `${fallback} ${error.message}`
    : fallback;
}
