import { describe, expect, it } from "vitest";
import { keyStrategySchema, settingsRequestSchema } from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import { playgroundMessage, runSnapshot } from "./run-snapshot-test-fixtures";
import { deriveScenarioActions } from "./scenario-actions";

describe("deriveScenarioActions", () => {
  it("provides a guided action for every catalog scenario", () => {
    for (const scenario of SCENARIOS) {
      const actions = deriveScenarioActions(
        runSnapshot({ scenarioId: scenario.id }),
      );
      expect(actions.length, scenario.id).toBeGreaterThan(0);
      expect(
        actions.every((action) => action.label && action.description),
      ).toBe(true);
      for (const action of actions) {
        expect(action.produceCount ?? 1, action.id).toBeGreaterThan(0);
        if (action.keyStrategy) {
          expect(() =>
            keyStrategySchema.parse(action.keyStrategy),
          ).not.toThrow();
        }
        if (action.settings) {
          expect(() =>
            settingsRequestSchema.parse(action.settings),
          ).not.toThrow();
        }
      }
      if (scenario.id !== "partitioning") {
        expect(
          actions.some((action) => action.id === "produce-keyed-record"),
          scenario.id,
        ).toBe(false);
      }
    }
  });

  it("produces enough retry records to reach the next deterministic failure", () => {
    expect(
      deriveScenarioActions(
        runSnapshot({
          scenarioId: "retry-dead-letter-queues",
          recentMessages: [playgroundMessage({ value: { sequence: 2 } })],
        }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "trigger-retry-failure",
        produceCount: 1,
      }),
    );

    expect(
      deriveScenarioActions(
        runSnapshot({ scenarioId: "retry-dead-letter-queues" }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "trigger-retry-failure",
        produceCount: 3,
      }),
    );
  });

  it("offers hot-key and balanced comparison actions for skew scenarios", () => {
    const actions = deriveScenarioActions(
      runSnapshot({ scenarioId: "hot-partitions-key-skew" }),
    );

    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "hot-key-burst",
        keyStrategy: { type: "fixed", value: "celebrity-user" },
        produceCount: 5,
      }),
    );
    expect(actions).toContainEqual(
      expect.objectContaining({
        id: "balanced-comparison",
        keyStrategy: { type: "no_key" },
        produceCount: 4,
      }),
    );
  });

  it("uses a five-second slow commit window for at-least-once demos", () => {
    expect(
      deriveScenarioActions(
        runSnapshot({ scenarioId: "at-least-once-duplicates" }),
      ),
    ).toContainEqual(
      expect.objectContaining({
        id: "slow-commit-window",
        settings: { processingLatencyMs: 5000 },
      }),
    );
  });
});
