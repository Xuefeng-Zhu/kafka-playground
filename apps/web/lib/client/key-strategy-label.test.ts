import { describe, expect, it } from "vitest";
import { keyStrategyLabel } from "./key-strategy-label";

describe("keyStrategyLabel", () => {
  it("formats compact and detailed key strategy labels", () => {
    expect(keyStrategyLabel({ type: "fixed", value: "user-1" })).toBe("user-1");
    expect(keyStrategyLabel({ type: "fixed", value: "user-1" }, "detail")).toBe(
      "Fixed key: user-1",
    );
    expect(keyStrategyLabel({ type: "round_robin_users" })).toBe("three IDs");
    expect(keyStrategyLabel({ type: "round_robin_users" }, "detail")).toBe(
      "Three user IDs",
    );
    expect(keyStrategyLabel({ type: "no_key" })).toBe("no key");
  });
});
