import { expect, type Page, test } from "@playwright/test";

const idleConsumerLabel = "idle - no partition available";

test("demo scenario visualizes assignments, idle consumer, message details, and reset", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.evaluate(() => window.localStorage.removeItem("kplay.runControls.expanded"));
  await page.reload();
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Consumer" })).toBeVisible();
  await expect(page.getByTestId("run-settings-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByTestId("run-settings-panel")).toHaveCount(0);
  await expect(page.getByLabel("Messages per second")).toHaveCount(0);
  await expect(page.getByLabel("Key strategy")).toHaveCount(0);
  await expect(page.getByLabel("Consumer processing latency")).toHaveCount(0);

  await page.getByTestId("run-settings-toggle").click();
  await expect(page.getByTestId("run-settings-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("run-settings-panel")).toBeVisible();
  await expect(page.getByLabel("Messages per second")).toBeVisible();
  await expect(page.getByLabel("Key strategy")).toBeVisible();
  await expect(page.getByLabel("Consumer processing latency")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByTestId("run-settings-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByTestId("run-settings-panel")).toBeVisible();

  const topologyContent = page.getByTestId("topology-canvas-content");
  await expect(page.getByText("100%")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("115%")).toBeVisible();
  await expect(topologyContent).toHaveCSS("transform", /matrix\(1\.15/);

  await page.getByRole("button", { name: "Auto layout" }).click();
  await expect(page.getByRole("button", { name: "Spread layout" })).toHaveAttribute("aria-pressed", "true");

  const topologyBox = await topologyContent.boundingBox();
  expect(topologyBox).not.toBeNull();
  if (topologyBox) {
    await page.mouse.move(topologyBox.x + 120, topologyBox.y + 80);
    await page.mouse.down();
    await page.mouse.move(topologyBox.x + 180, topologyBox.y + 110);
    await page.mouse.up();
    await expect.poll(async () => topologyContent.evaluate((element) => getComputedStyle(element).transform)).toContain("60, 30");
  }

  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect(topologyContent).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("button", { name: "Spread layout" }).click();
  await expect(page.getByRole("button", { name: "Auto layout" })).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(page.locator("span", { hasText: idleConsumerLabel })).toBeVisible();

  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Selected message")).toBeVisible();
  await expect(page.getByText("Partition", { exact: true })).toBeVisible();
  await expect(page.getByText("Offset", { exact: true })).toBeVisible();

  await expect.poll(async () => await page.getByText("committed").count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.locator("span", { hasText: idleConsumerLabel })).toBeVisible();

  await page.getByRole("button", { name: "Stop consumer-1" }).click();
  await expect(page.getByText("consumer.partitions_assigned").first()).toBeVisible();

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(page.getByRole("button", { name: "Start scenario run" })).toBeVisible();
});

async function resetActiveRun(page: Page) {
  const response = await page.request.get("/api/v1/runs");
  if (!response.ok()) return;

  const payload = (await response.json()) as { run: { runId?: string } | null };
  if (payload.run?.runId) {
    await page.request.post(`/api/v1/runs/${payload.run.runId}/reset`);
  }
}
