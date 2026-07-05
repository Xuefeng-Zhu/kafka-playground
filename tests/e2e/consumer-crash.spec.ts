import { expect, test } from "@playwright/test";
import {
  activeRunId,
  installConsoleFailureChecks,
  produceOneViaApi,
  resetActiveRun,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("consumer crash remains visible and replays uncommitted work", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/at-least-once-duplicates");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await page.getByRole("tab", { name: "Insights" }).click();
  await page.getByRole("button", { name: "Slow commit window" }).click();
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(page.getByTestId("consumer-node-consumer-1")).toBeVisible();
  const runId = await activeRunId(page);
  await produceOneViaApi(page, runId);
  await produceOneViaApi(page, runId);
  await produceOneViaApi(page, runId);
  await expect(page.getByTestId("consumer-node-consumer-1")).toContainText(
    "Working: 3 tasks",
  );
  await page.getByRole("button", { name: "Inspect consumer-1" }).click();
  const drawer = page.locator("#message-inspector-drawer");
  await expect(drawer.getByText("Consumer Metrics")).toBeVisible();
  await expect(drawer.getByText("Active tasks")).toBeVisible();
  await expect(drawer).toContainText("payment-1");
  await expect(drawer.getByText("Task 1")).toBeVisible();
  await expect(drawer.getByText("Task 2")).toBeVisible();
  await expect(drawer.getByText("Task 3")).toBeVisible();
  await expect(drawer.getByText("Label")).toHaveCount(3);
  await expect(drawer.getByText("State").first()).toBeVisible();
  await expect(drawer.getByText("Duration")).toHaveCount(3);
  await expect(drawer).toContainText(/\d+\.\ds/);
  await expect(drawer.getByText("Partition / offset")).toHaveCount(3);
  await expect(drawer.getByText("Idempotency key")).toHaveCount(3);
  await page.getByRole("button", { name: "Close topology inspector" }).click();

  await expect(page.getByTestId("run-settings-panel")).toBeVisible();
  await page.getByRole("button", { name: "Crash consumer-1" }).click();
  await expect(page.getByTestId("consumer-node-consumer-1")).toContainText(
    "crashed",
  );
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByText("consumer.crashed").first()).toBeVisible();

  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(page.getByTestId("consumer-node-consumer-2")).toContainText(
    "Active assignment",
  );
  await expect(page.getByText("consumer-2").first()).toBeVisible();
  await expect
    .poll(async () => await page.getByText("committed").count())
    .toBeGreaterThan(0);
  const committedMessageButtons = page.locator(
    '[data-testid^="partition-message-"]',
  );
  await expect
    .poll(async () => await committedMessageButtons.count())
    .toBeGreaterThan(0);
  const committedMessageButtonCount = await committedMessageButtons.count();
  await committedMessageButtons.nth(committedMessageButtonCount - 1).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await expect(page.locator("#message-inspector-drawer")).toContainText(
    /Duration (\d+\.\ds|\d+s|\d+:\d{2})/,
  );
  await page.getByRole("button", { name: "Close message inspector" }).click();

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});
