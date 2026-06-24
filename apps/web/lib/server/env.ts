import "server-only";
import { loadServerEnv } from "@kplay/kafka-runtime";

let cached: ReturnType<typeof loadServerEnv> | null = null;

export function getServerEnv() {
  cached ??= loadServerEnv();
  return cached;
}
