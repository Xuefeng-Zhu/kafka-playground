import { describe, expect, expectTypeOf, it } from "vitest";
import {
  scenarioStateSchema,
  type ScenarioExperimentIdFor,
} from "@kplay/contracts";
import { SCENARIOS } from "@kplay/scenario-engine";
import {
  buildScenarioExperimentResult,
  createInitialScenarioState,
  SCENARIO_EXPERIMENT_IDS,
} from "./scenario-experiments";
import {
  collectRowIds,
  primaryExperiments,
} from "./scenario-experiments-test-helpers";
import { complete, step } from "./scenario-experiments/shared";

describe("scenario experiment model contracts", () => {
  it("keeps scenario state and experiment IDs correlated through completion and dispatch", () => {
    const initial = createInitialScenarioState("partitioning", 2);
    const transitions = [
      step("route", "Route a record", "key.hashed", ["key-router"], 100),
    ];

    const completed = complete(initial, "produce-keyed-record", 0, transitions);
    expectTypeOf(completed).toEqualTypeOf(initial);
    expect(completed.experiment.experimentId).toBe("produce-keyed-record");

    const dispatched = buildScenarioExperimentResult({
      state: initial,
      experimentId: "produce-keyed-record",
      startedAtVirtualMs: 0,
    });
    expectTypeOf(dispatched.state).toEqualTypeOf(initial);

    expectTypeOf<
      Extract<"cdc-batch", ScenarioExperimentIdFor<"partitioning">>
    >().toEqualTypeOf<never>();
    expect(() =>
      buildScenarioExperimentResult({
        state: initial,
        // @ts-expect-error Cross-scenario dispatch is rejected at compile time.
        experimentId: "cdc-batch",
        startedAtVirtualMs: 0,
      }),
    ).toThrow("Experiment cdc-batch does not belong to partitioning.");
  });

  it("creates a schema-valid authoritative initial state for all 15 scenarios", () => {
    expect(SCENARIOS).toHaveLength(15);
    for (const scenario of SCENARIOS) {
      const scenarioId = scenario.id as keyof typeof SCENARIO_EXPERIMENT_IDS;
      const state = createInitialScenarioState(
        scenario.id,
        scenario.topic.partitions,
      );
      expect(state).toMatchObject({
        scenarioId: scenario.id,
        version: 1,
        virtualTimeMs: 0,
        revision: 0,
        experiment: {
          status: "idle",
          experimentId: null,
          stepIndex: 0,
        },
      });
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
      expect(SCENARIO_EXPERIMENT_IDS[scenarioId].length).toBeGreaterThan(0);
    }
  });

  it("moves every scenario to a schema-valid primary state with monotonic cursors", () => {
    for (const scenario of SCENARIOS) {
      const scenarioId = scenario.id as keyof typeof primaryExperiments;
      const initial = createInitialScenarioState(
        scenario.id,
        scenario.topic.partitions,
      );
      const result = buildScenarioExperimentResult({
        state: initial,
        experimentId: primaryExperiments[scenarioId],
        startedAtVirtualMs: initial.virtualTimeMs,
      });

      expect(result.state.experiment.status, scenario.id).toBe("completed");
      expect(result.state.revision, scenario.id).toBeGreaterThan(
        initial.revision,
      );
      expect(result.state.virtualTimeMs, scenario.id).toBeGreaterThan(
        initial.virtualTimeMs,
      );
      expect(result.transitions, scenario.id).not.toHaveLength(0);
      expect(
        result.transitions.every(
          (transition) =>
            transition.provenance === "simulated" &&
            transition.entityIds.length > 0,
        ),
        scenario.id,
      ).toBe(true);
      const initialIds = collectRowIds(initial);
      const transitionEntityIds = new Set(
        result.transitions.flatMap((transition) => transition.entityIds),
      );
      const unlinkedRows = collectRowIds(result.state).filter(
        (id) => !initialIds.includes(id) && !transitionEntityIds.has(id),
      );
      expect(unlinkedRows, scenario.id).toEqual([]);
      expect(() => scenarioStateSchema.parse(result.state)).not.toThrow();
    }
  });
});

describe("scenario experiment partition state", () => {
  it("preserves custom partition rows through primary and contrast experiments", () => {
    const expectedPartitions = [0, 1, 2, 3];
    const partitioningInitial = createInitialScenarioState("partitioning", 4);
    const partitioningPrimary = buildScenarioExperimentResult({
      state: partitioningInitial,
      experimentId: "produce-keyed-record",
      startedAtVirtualMs: 0,
    }).state;
    const partitioningContrast = buildScenarioExperimentResult({
      state: partitioningPrimary,
      experimentId: "grow-consumer-group",
      startedAtVirtualMs: partitioningPrimary.virtualTimeMs,
    }).state;

    for (const state of [partitioningPrimary, partitioningContrast]) {
      expect(
        state.partitionPositions.map(({ partition }) => partition),
      ).toEqual(expectedPartitions);
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
    }
    expect(partitioningPrimary.partitionPositions.slice(2)).toEqual(
      partitioningInitial.partitionPositions.slice(2),
    );
    expect(
      partitioningContrast.consumers
        .flatMap(({ partitions }) => partitions)
        .sort((left, right) => left - right),
    ).toEqual(expectedPartitions);

    const lagInitialState = createInitialScenarioState(
      "consumer-lag-backpressure",
      4,
    );
    const lagInitial = {
      ...lagInitialState,
      partitions: lagInitialState.partitions.map((partition) =>
        partition.partition === 3
          ? {
              ...partition,
              endOffset: "5",
              committedOffset: "1",
              lag: 4,
            }
          : partition,
      ),
    };
    const lagPrimaryResult = buildScenarioExperimentResult({
      state: lagInitial,
      experimentId: "build-lag",
      startedAtVirtualMs: 0,
    });
    const lagPrimary = lagPrimaryResult.state;
    const lagContrastResult = buildScenarioExperimentResult({
      state: lagPrimaryResult.state,
      experimentId: "recover-lag",
      startedAtVirtualMs: lagPrimaryResult.state.virtualTimeMs,
    });
    const lagContrast = lagContrastResult.state;

    for (const state of [lagPrimary, lagContrast]) {
      expect(state.partitions.map(({ partition }) => partition)).toEqual(
        expectedPartitions,
      );
      expect(() => scenarioStateSchema.parse(state)).not.toThrow();
    }
    expect(lagPrimary.partitions[3]).toEqual(lagInitial.partitions[3]);
    expect(lagContrast.partitions[3]).toMatchObject({
      partition: 3,
      endOffset: "5",
      committedOffset: "5",
      lag: 0,
    });
    expect(lagContrastResult.transitions.at(-1)?.entityIds).toContain(
      "lag-partition-3",
    );
  });
});
