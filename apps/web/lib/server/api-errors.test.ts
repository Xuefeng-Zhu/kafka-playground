import { describe, expect, it } from "vitest";
import { z } from "zod";
import { problem } from "./api-errors";

describe("api error responses", () => {
  it("maps Zod errors to typed 400 problem details", async () => {
    const error = z.object({ rate: z.number().max(10) }).safeParse({ rate: 99 });
    expect(error.success).toBe(false);
    if (error.success) return;
    const response = problem(error.error, "request-1");
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SETTINGS",
      requestId: "request-1"
    });
    expect(response.status).toBe(400);
  });
});
