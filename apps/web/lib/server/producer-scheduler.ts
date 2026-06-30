import "server-only";
import type { ProducerStatus } from "@kplay/contracts";
import { logger } from "./logger";

export type ProducerSchedulerRun = {
  runId: string;
  producerStatus: ProducerStatus;
  productionRate: number;
  producerTimer: NodeJS.Timeout | null;
  producerTickInFlight: boolean;
  producerTimerGeneration: number;
};

export function restartProducerTimer(
  run: ProducerSchedulerRun,
  produceOne: (runId: string) => Promise<unknown>,
) {
  clearProducerTimer(run);
  if (!run.producerTickInFlight) {
    scheduleProducerTick(run, produceOne);
  }
}

export function clearProducerTimer(run: ProducerSchedulerRun) {
  run.producerTimerGeneration += 1;
  if (run.producerTimer) clearTimeout(run.producerTimer);
  run.producerTimer = null;
}

function scheduleProducerTick(
  run: ProducerSchedulerRun,
  produceOne: (runId: string) => Promise<unknown>,
) {
  if (run.producerStatus !== "running" || run.producerTimer) return;
  const generation = run.producerTimerGeneration;
  const intervalMs = Math.max(100, Math.floor(1000 / run.productionRate));
  run.producerTimer = setTimeout(async () => {
    run.producerTimer = null;
    if (
      run.producerStatus !== "running" ||
      run.producerTimerGeneration !== generation
    ) {
      return;
    }
    run.producerTickInFlight = true;
    try {
      await produceOne(run.runId);
    } catch (error) {
      if (
        run.producerStatus !== "running" ||
        run.producerTimerGeneration !== generation
      ) {
        return;
      }
      logger.error(
        { err: error, runId: run.runId },
        "Automatic production failed",
      );
    } finally {
      run.producerTickInFlight = false;
      if (run.producerStatus === "running") {
        scheduleProducerTick(run, produceOne);
      }
    }
  }, intervalMs);
}
