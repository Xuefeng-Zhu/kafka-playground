"use client";

import { useCallback, useRef, useState } from "react";

export type RunActionOptions = {
  onError?(message: string): void;
};

export type RunAction = (
  action: () => Promise<void>,
  options?: RunActionOptions,
) => Promise<boolean>;

export function useRunAction() {
  const actionInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setActionPending] = useState(false);

  const runAction = useCallback<RunAction>(async (action, options) => {
    const reportError = (message: string) => {
      if (options?.onError) {
        options.onError(message);
        return;
      }
      setActionError(message);
    };

    if (actionInFlightRef.current) {
      reportError("An action is already in progress.");
      return false;
    }
    actionInFlightRef.current = true;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      reportError(error instanceof Error ? error.message : "Action failed.");
      return false;
    } finally {
      actionInFlightRef.current = false;
      setActionPending(false);
    }
  }, []);

  return {
    actionError,
    isActionPending,
    runAction,
    setActionError,
  };
}
