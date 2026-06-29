import type { KeyStrategy } from "@kplay/contracts";

export function keyStrategyLabel(
  keyStrategy: KeyStrategy,
  format: "short" | "detail" = "short",
) {
  if (keyStrategy.type === "fixed") {
    return format === "detail"
      ? `Fixed key: ${keyStrategy.value}`
      : keyStrategy.value;
  }
  if (keyStrategy.type === "round_robin_users") {
    return format === "detail" ? "Three user IDs" : "three IDs";
  }
  if (keyStrategy.type === "random_user") {
    return format === "detail" ? "Random user ID" : "random ID";
  }
  return format === "detail" ? "No key" : "no key";
}
