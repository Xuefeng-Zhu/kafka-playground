import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearProducerTimer,
  restartProducerTimer,
  type ProducerSchedulerRun,
} from "./producer-scheduler";

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
