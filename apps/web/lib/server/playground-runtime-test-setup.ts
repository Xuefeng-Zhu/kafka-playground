import { afterEach, vi } from "vitest";

vi.mock("./env", async () => {
  const { createTestServerEnv } = await import("./playground-runtime-test-env");
  return { getServerEnv: () => createTestServerEnv() };
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
