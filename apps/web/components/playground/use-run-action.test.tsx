import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useRunAction } from "./use-run-action";

describe("useRunAction", () => {
  it("serializes actions and reports overlapping attempts", async () => {
    const firstAction = deferred<void>();
    const secondAction = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(() => useRunAction());

    await act(async () => {
      void result.current.runAction(() => firstAction.promise);
    });

    await act(async () => {
      const accepted = await result.current.runAction(secondAction);
      expect(accepted).toBe(false);
    });

    expect(secondAction).not.toHaveBeenCalled();
    expect(result.current.actionError).toBe(
      "An action is already in progress.",
    );

    await act(async () => {
      firstAction.resolve();
      await firstAction.promise;
    });

    expect(result.current.isActionPending).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
