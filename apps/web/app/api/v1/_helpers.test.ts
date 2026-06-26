import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseJson } from "./_helpers";

describe("parseJson", () => {
  const schema = z.object({
    scenarioId: z.string().default("partitioning"),
  });

  it("allows empty request bodies to use schema defaults", async () => {
    await expect(
      parseJson(new Request("http://test.local"), schema),
    ).resolves.toEqual({
      scenarioId: "partitioning",
    });
  });

  it("reports malformed non-empty JSON", async () => {
    await expect(
      parseJson(
        new Request("http://test.local", {
          method: "POST",
          body: "{",
        }),
        schema,
      ),
    ).rejects.toMatchObject({
      code: "INVALID_JSON",
      status: 400,
    });
  });
});
