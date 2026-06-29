import {
  connectionTestRequestSchema,
  createRunRequestSchema,
  settingsRequestSchema,
} from "@kplay/contracts";
import { describe, expect, it } from "vitest";
import { parseJson } from "./_helpers";
import {
  describeConnectionTestIssue,
  describeCreateRunIssue,
  describeSettingsIssue,
} from "./_validation";

describe("route validation problem details", () => {
  it("uses create-run copy for invalid scenario requests", async () => {
    await expect(
      parseJson(requestBody({ scenarioId: 42 }), createRunRequestSchema, {
        code: "INVALID_RUN_REQUEST",
        describeIssue: describeCreateRunIssue,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_RUN_REQUEST",
      message: "Select an available scenario before starting a run.",
      status: 400,
    });
  });

  it("uses remote Kafka copy for connection tests", async () => {
    await expect(
      parseJson(requestBody({ mode: "remote" }), connectionTestRequestSchema, {
        code: "INVALID_CONNECTION_TEST",
        describeIssue: describeConnectionTestIssue,
      }),
    ).rejects.toMatchObject({
      code: "INVALID_CONNECTION_TEST",
      message: "Remote Kafka configuration is invalid.",
      status: 400,
    });
  });

  it("uses settings copy for bounded controls", async () => {
    await expectParseJsonError(
      parseJson(
        requestBody({
          productionRate: 11,
          processingLatencyMs: 3001,
          keyStrategy: { type: "fixed", value: "" },
        }),
        settingsRequestSchema,
        {
          code: "INVALID_SETTINGS",
          describeIssue: describeSettingsIssue,
        },
      ),
      {
        code: "INVALID_SETTINGS",
        status: 400,
        messages: [
          "Production rate must be between 1 and 10 messages per second.",
          "Processing latency must be between 0 and 3000 ms.",
          "Fixed keys must be between 1 and 80 characters.",
        ],
      },
    );
  });
});

async function expectParseJsonError(
  promise: Promise<unknown>,
  expected: { code: string; status: number; messages: string[] },
) {
  try {
    await promise;
    throw new Error("Expected parseJson to reject.");
  } catch (error) {
    expect(error).toMatchObject({
      code: expected.code,
      status: expected.status,
    });
    const message = error instanceof Error ? error.message : "";
    for (const expectedMessage of expected.messages) {
      expect(message).toContain(expectedMessage);
    }
  }
}

function requestBody(body: unknown) {
  return new Request("http://test.local", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
