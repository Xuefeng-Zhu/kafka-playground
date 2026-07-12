import { runtimeEventSchema } from "@kplay/contracts";
import { describe, expect, it, vi } from "vitest";
import "./playground-runtime-test-setup";
import {
  createPlaygroundRuntimeTestHarness,
  remoteKafkaConfig,
} from "./playground-runtime-test-helpers";

describe("PlaygroundRuntime experiment validation", () => {
  it("rejects every contrast until its primary experiment completes", async () => {
    const { runtime } = await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("schema-evolution-karapace");

    await expect(
      runtime.runExperiment(started.runId, "trigger-schema-rejection"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
      message: expect.stringContaining("compatible-schema"),
    });
    expect(runtime.snapshot(started.runId).scenarioState).toMatchObject({
      activeVersion: 1,
      topicRecordCount: 0,
      attempts: [],
    });

    const primary = await runtime.runExperiment(
      started.runId,
      "compatible-schema",
    );
    expect(primary.scenarioState).toMatchObject({ activeVersion: 2 });
    const contrast = await runtime.runExperiment(
      started.runId,
      "trigger-schema-rejection",
    );
    expect(contrast.scenarioState).toMatchObject({
      activeVersion: 2,
      topicRecordCount: 1,
    });

    await runtime.reset(started.runId);
  });

  it("emits schema-valid transitions with stable entities, provenance, and coordinates", async () => {
    const { runtime } = await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("at-least-once-duplicates");
    const completed = await runtime.runExperiment(
      started.runId,
      "crash-and-redeliver",
    );
    const experimentEvents = completed.recentEvents.filter((event) =>
      event.type.startsWith("scenario.experiment."),
    );

    expect(experimentEvents.map((event) => event.type)).toEqual([
      "scenario.experiment.started",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.transition",
      "scenario.experiment.completed",
    ]);
    expect(experimentEvents.every((event) => "provenance" in event)).toBe(true);
    expect(
      experimentEvents.every(
        (event) =>
          "entityIds" in event &&
          event.entityIds.length > 0 &&
          event.provenance === "simulated",
      ),
    ).toBe(true);
    expect(experimentEvents).toContainEqual(
      expect.objectContaining({
        type: "scenario.experiment.transition",
        messageId: "duplicate-message-42",
        partition: 0,
        offset: "7",
      }),
    );
    experimentEvents.forEach((event) =>
      expect(() => runtimeEventSchema.parse(event)).not.toThrow(),
    );

    await runtime.reset(started.runId);
  });

  it("clears scenario state and the in-flight guard when a run is reset", async () => {
    const { runtime, getInternalRun } =
      await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("acl-least-privilege");
    await runtime.runExperiment(started.runId, "trigger-acl-denial");
    const internalRun = getInternalRun();
    expect(internalRun?.scenarioState).not.toBeNull();

    await runtime.reset(started.runId);

    expect(internalRun).toMatchObject({
      scenarioState: null,
      virtualTimeMs: 0,
      inFlightExperimentId: null,
    });
    expect(internalRun?.completedExperimentIds.size).toBe(0);
    expect(runtime.activeSnapshot()).toBeNull();
  });

  it("rejects demo-only experiments for remote runs", async () => {
    const { UserConfiguredKafkaRuntimeAdapter } =
      await import("@kplay/kafka-runtime");
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "createRun",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      UserConfiguredKafkaRuntimeAdapter.prototype,
      "deleteRunResources",
    ).mockResolvedValue({ status: "completed", steps: [] });
    const { runtime } = await createPlaygroundRuntimeTestHarness();
    const started = await runtime.createRun("schema-evolution-karapace", {
      mode: "remote",
      remoteKafkaConfig: remoteKafkaConfig(),
    });

    expect(started.scenarioState).toBeNull();

    await expect(
      runtime.runExperiment(started.runId, "compatible-schema"),
    ).rejects.toMatchObject({
      code: "SCENARIO_EXPERIMENT_UNAVAILABLE",
      status: 409,
    });
    expect(runtime.snapshot(started.runId).scenarioState).toBeNull();

    await runtime.reset(started.runId);
  });
});
