import { expect, test } from "@playwright/test";
import {
  activeRunId,
  installConsoleFailureChecks,
  produceOneViaApi,
  resetActiveRun,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("raw consumer controls still crash and reassign work below the teaching surface", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/at-least-once-duplicates");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByTestId("scenario-learning-surface")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Controls" })).toBeVisible();

  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(
    page.getByRole("button", { name: "Crash consumer-1" }),
  ).toBeVisible();

  const runId = await activeRunId(page);
  await produceOneViaApi(page, runId);
  await produceOneViaApi(page, runId);
  await produceOneViaApi(page, runId);

  await page.getByRole("button", { name: "Crash consumer-1" }).click();
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/v1/runs");
      const payload = (await response.json()) as {
        run: {
          consumers?: Array<{ consumerId: string; status: string }>;
        } | null;
      };
      return payload.run?.consumers?.find(
        (consumer) => consumer.consumerId === "consumer-1",
      )?.status;
    })
    .toBe("crashed");

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("consumer.crashed").first()).toBeVisible();

  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(
    page.getByRole("button", { name: "Crash consumer-2" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/v1/runs");
      const payload = (await response.json()) as {
        run: {
          consumers?: Array<{
            consumerId: string;
            assignments: unknown[];
          }>;
        } | null;
      };
      return (
        payload.run?.consumers?.find(
          (consumer) => consumer.consumerId === "consumer-2",
        )?.assignments.length ?? 0
      );
    })
    .toBeGreaterThan(0);

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});
