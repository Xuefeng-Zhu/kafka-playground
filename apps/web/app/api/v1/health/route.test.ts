import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("health route", () => {
  it("uses the shared API wrapper for request ids", async () => {
    const response = await GET(
      new Request("http://test.local/api/v1/health", {
        headers: { "x-request-id": "health-request" },
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-request-id")).toBe("health-request");
    await expect(response.json()).resolves.toMatchObject({ status: "ok" });
  });
});
