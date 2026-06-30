import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProducerTimer,
  restartProducerTimer,
  type ProducerSchedulerRun,
} from "./producer-scheduler";
import { logger } from "./logger";

describe("producer scheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not overlap producer ticks", async () => {
    vi.useFakeTimers();
    const run = schedulerRun({ productionRate: 10 });
    let resolveProduce: () => void = () => undefined;
    const produceOne = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveProduce = resolve;
        }),
    );

    restartProducerTimer(run, produceOne);
    await vi.advanceTimersByTimeAsync(100);
    await vi.advanceTimersByTimeAsync(500);

    expect(produceOne).toHaveBeenCalledTimes(1);

    resolveProduce();
    await vi.runOnlyPendingTimersAsync();

    expect(produceOne).toHaveBeenCalledTimes(2);
  });

  it("cancels stale timer generations after clearing", async () => {
    vi.useFakeTimers();
    const run = schedulerRun({ productionRate: 10 });
    const produceOne = vi.fn<() => Promise<void>>(async () => undefined);

    restartProducerTimer(run, produceOne);
    clearProducerTimer(run);
    await vi.advanceTimersByTimeAsync(100);

    expect(produceOne).not.toHaveBeenCalled();
  });

  it("does not log canceled in-flight producer failures", async () => {
    vi.useFakeTimers();
    const run = schedulerRun({ productionRate: 10 });
    const logError = vi
      .spyOn(logger, "error")
      .mockImplementation(() => undefined);
    let rejectProduce: (error: Error) => void = () => {
      throw new Error("Expected producer promise to start.");
    };
    const produceOne = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectProduce = reject;
        }),
    );

    restartProducerTimer(run, produceOne);
    await vi.advanceTimersByTimeAsync(100);
    clearProducerTimer(run);
    run.producerStatus = "stopped";
    rejectProduce?.(new Error("reset"));
    await Promise.resolve();

    expect(logError).not.toHaveBeenCalled();
  });
});

function schedulerRun(
  override: Partial<ProducerSchedulerRun> = {},
): ProducerSchedulerRun {
  return {
    runId: "run-1",
    producerStatus: "running",
    productionRate: 1,
    producerTimer: null,
    producerTickInFlight: false,
    producerTimerGeneration: 0,
    ...override,
  };
}
