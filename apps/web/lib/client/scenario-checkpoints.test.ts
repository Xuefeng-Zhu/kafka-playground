import { describe, expect, it } from "vitest";
import { SCENARIO_IDS } from "@kplay/scenario-engine";
import { scenarioCheckpointForId } from "./scenario-checkpoints";

describe("scenario checkpoint catalog", () => {
  it("provides a complete, internally consistent checkpoint for every scenario", () => {
    for (const scenarioId of SCENARIO_IDS) {
      const checkpoint = scenarioCheckpointForId(scenarioId);
      const optionIds = checkpoint.options.map((option) => option.id);

      expect(checkpoint.id, scenarioId).toBeTruthy();
      expect(checkpoint.prompt, scenarioId).toBeTruthy();
      expect(checkpoint.explanation, scenarioId).toBeTruthy();
      expect(checkpoint.options.length, scenarioId).toBeGreaterThanOrEqual(2);
      expect(new Set(optionIds).size, scenarioId).toBe(optionIds.length);
      expect(optionIds, scenarioId).toContain(checkpoint.correctOptionId);
    }
  });
});
