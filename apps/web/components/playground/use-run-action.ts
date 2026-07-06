"use client";

import { useCallback, useRef, useState } from "react";

export function useRunAction() {
  const actionInFlightRef = useRef(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setActionPending] = useState(false);

  const runAction = useCallback(async (action: () => Promise<void>) => {
    if (actionInFlightRef.current) {
      setActionError("An action is already in progress.");
      return false;
    }
    actionInFlightRef.current = true;
    setActionPending(true);
    setActionError(null);
    try {
      await action();
      return true;
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Action failed.");
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
