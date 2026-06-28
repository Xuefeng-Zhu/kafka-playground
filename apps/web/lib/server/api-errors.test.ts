import { describe, expect, it } from "vitest";
import { z } from "zod";
import { settingsRequestSchema } from "@kplay/contracts";
import { ApiError, problem } from "./api-errors";

describe("api error responses", () => {
  it("maps Zod errors to typed 400 problem details", async () => {
    const error = z
      .object({ rate: z.number().max(10) })
      .safeParse({ rate: 99 });
    expect(error.success).toBe(false);
    if (error.success) return;
    const response = problem(error.error, "request-1");
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SETTINGS",
      requestId: "request-1",
    });
    expect(response.status).toBe(400);
  });

  it("maps API-error-like objects from separate module instances", async () => {
    const error = new Error("The scenario run does not exist.") as Error & {
      code: string;
      status: number;
    };
    error.code = "RUN_NOT_FOUND";
    error.status = 404;

    const response = problem(error, "request-2");
    await expect(response.json()).resolves.toMatchObject({
      code: "RUN_NOT_FOUND",
      message: "The scenario run does not exist.",
      requestId: "request-2",
    });
    expect(response.status).toBe(404);
  });

  it("maps local ApiError instances", async () => {
    const response = problem(
      new ApiError("RUN_NOT_FOUND", "Missing run.", 404),
      "request-3",
    );
    await expect(response.json()).resolves.toMatchObject({
      code: "RUN_NOT_FOUND",
      requestId: "request-3",
    });
    expect(response.status).toBe(404);
  });

  it("maps settings validation to product-facing copy", async () => {
    const error = settingsRequestSchema.safeParse({ productionRate: 99 });
    expect(error.success).toBe(false);
    if (error.success) return;

    const response = problem(error.error, "request-4");
    await expect(response.json()).resolves.toMatchObject({
      code: "INVALID_SETTINGS",
      message: "Production rate must be between 1 and 10 messages per second.",
      requestId: "request-4",
    });
    expect(response.status).toBe(400);
  });
});
