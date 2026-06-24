import { describe, expect, it } from "vitest";
import {
  KeyStrategyState,
  SCENARIOS,
  createResourceNames,
  sanitizeResourceSegment,
  validateTopicPrefix
} from "./index";
import { scenarioDefinitionSchema } from "@kplay/contracts";

describe("scenario engine", () => {
  it("generates valid resource names", () => {
    const names = createResourceNames({
      prefix: "kplay",
      scenarioId: "Partitioning!",
      now: new Date("2026-06-24T12:00:00Z")
    });
    expect(names.topicName).toMatch(/^kplay\.partitioning\.20260624\.[a-f0-9]{6}$/);
    expect(names.consumerGroupId).toContain(".workers");
  });

  it("rejects invalid prefixes", () => {
    expect(() => validateTopicPrefix("Bad Prefix")).toThrow();
  });

  it("cycles round-robin keys", () => {
    const keys = new KeyStrategyState();
    expect(keys.next({ type: "round_robin_users" })).toBe("user-1");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-2");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-3");
    expect(keys.next({ type: "round_robin_users" })).toBe("user-1");
  });

  it("uses deterministic pseudo-random user IDs", () => {
    const first = new KeyStrategyState();
    const second = new KeyStrategyState();
    expect([
      first.next({ type: "random_user" }),
      first.next({ type: "random_user" }),
      first.next({ type: "random_user" })
    ]).toEqual([
      second.next({ type: "random_user" }),
      second.next({ type: "random_user" }),
      second.next({ type: "random_user" })
    ]);
  });

  it("sanitizes segments", () => {
    expect(sanitizeResourceSegment("Hello World!")).toBe("hello-world");
  });

  it("keeps every catalog scenario valid against the shared contract", () => {
    for (const scenario of SCENARIOS) {
      expect(() => scenarioDefinitionSchema.parse(scenario)).not.toThrow();
    }
  });

  it("keeps future scenarios disabled until implemented", () => {
    const future = SCENARIOS.filter((scenario) => scenario.disabled);
    expect(future).toHaveLength(14);
    expect(future.every((scenario) => scenario.description !== "Coming soon")).toBe(true);
  });
});
