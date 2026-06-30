import { describe, expect, it, vi } from "vitest";

const scenarios = vi.hoisted(() => vi.fn(() => []));

vi.mock("@/lib/server/runtime-singleton", () => ({
  playgroundRuntime: { scenarios },
}));

import { GET } from "./route";

describe("scenarios route", () => {
  it("uses the shared API wrapper for request ids", async () => {
    const response = await GET(
      new Request("http://test.local/api/v1/scenarios", {
        headers: { "x-request-id": "scenarios-request" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("scenarios-request");
    await expect(response.json()).resolves.toEqual({ scenarios: [] });
    expect(scenarios).toHaveBeenCalledTimes(1);
  });
});
