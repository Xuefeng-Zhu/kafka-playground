import { expect, type Page, test } from "@playwright/test";

const idleConsumerLabel = "idle - no partition available";

test("demo scenario visualizes assignments, idle consumer, message details, and reset", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.evaluate(() => window.localStorage.removeItem("kplay.runControls.expanded"));
  await page.reload();
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByTestId("run-controls-panel").getByRole("button", { name: "Consumer" })).toBeVisible();
  const timelineRegion = page.getByTestId("timeline-region");
  const collapsedTimelineHeight = await timelineRegion.evaluate((element) => element.getBoundingClientRect().height);
  await expect(page.getByTestId("timeline-expand-toggle")).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "Expand timeline" }).click();
  await expect(page.getByTestId("timeline-expand-toggle")).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("button", { name: "Collapse timeline" })).toBeVisible();
  const expandedTimelineHeight = await timelineRegion.evaluate((element) => element.getBoundingClientRect().height);
  expect(expandedTimelineHeight).toBeGreaterThan(collapsedTimelineHeight + 40);
  await page.locator("button").filter({ hasText: "run.started" }).first().click();
  await expect(page.getByText("Selected Event")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();
  await page.getByRole("button", { name: "Collapse timeline" }).click();
  await expect(page.getByTestId("timeline-expand-toggle")).toHaveAttribute("aria-expanded", "false");
  await expect.poll(async () =>
    timelineRegion.evaluate((element) => element.getBoundingClientRect().height)
  ).toBeLessThan(expandedTimelineHeight - 40);
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
  await page.getByRole("button", { name: "Inspect producer" }).click();
  await expect(page.getByText("Topology Inspector")).toBeVisible();
  await expect(page.getByText("Producer Metrics")).toBeVisible();
  await page.getByRole("button", { name: "Close topology inspector" }).click();

  await page.getByRole("button", { name: "Inspect topic" }).click();
  await expect(page.getByText("Topic Metrics")).toBeVisible();
  await page.getByRole("button", { name: "Close topology inspector" }).click();

  await page.getByRole("button", { name: "Inspect partition 0" }).click();
  await expect(page.getByText("Partition Metrics")).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close topology inspector" }).click();

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
  await expect(page.getByTestId("partition-owner-0")).toContainText("owned by C");
  await expect(page.getByTestId("partition-owner-1")).toContainText("owned by C");
  await expect(page.getByTestId("ownership-connector-partition-0")).toHaveCount(1);
  await expect(page.getByTestId("ownership-connector-partition-1")).toHaveCount(1);

  await page.getByRole("button", { name: "Inspect consumer-1" }).click();
  await expect(page.getByText("Consumer Metrics")).toBeVisible();
  await expect(page.getByText("Assignments", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close topology inspector" }).click();

  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await expect(page.getByText("Topology Inspector")).toHaveCount(0);
  await expect(page.getByText("Selected message")).toBeVisible();
  await expect(page.getByText("Partition", { exact: true })).toBeVisible();
  await expect(page.getByText("Offset", { exact: true })).toBeVisible();

  await expect.poll(async () => await page.getByText("committed").count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.locator("span", { hasText: idleConsumerLabel })).toBeVisible();

  await page.getByRole("button", { name: "Stop consumer-1" }).click();
  await expect(page.getByText("consumer.partitions_assigned").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("partition-owner-0")).toBeVisible();
  await expect.poll(async () =>
    page.getByTestId("topology-canvas").evaluate((element) => element.scrollWidth <= element.clientWidth)
  ).toBe(true);

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(page.getByRole("button", { name: "Start scenario run" })).toBeVisible();
});

test("non-primary scenarios are routable and startable", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/hot-partitions-key-skew");
  await expect(page.getByRole("heading", { name: "Hot partitions and key skew" })).toBeVisible();
  await expect(page.getByText("Locked")).toHaveCount(0);
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByText("Hot partitions and key skew started.")).toBeVisible();
  await expect(page.getByRole("complementary").getByText("4 partitions")).toBeVisible();
  await expect(page.getByText("Hot partition detector")).toBeVisible();
  await expect(page.getByRole("button", { name: "Hot-key burst" })).toBeVisible();
  await page.getByRole("button", { name: "Hot-key burst" }).click();
  await expect.poll(async () => page.getByTestId("scenario-insight-panel").textContent()).toMatch(/Records there\s*5/);
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("celebrity-user")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();
  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(page.getByRole("button", { name: "Start scenario run" })).toBeVisible();
});

test("scenario navigation keeps the UI bound to the active run", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  await page.goto("/scenarios/hot-partitions-key-skew");
  await expect(page).toHaveURL(/\/scenarios\/partitioning$/);
  await expect(page.getByRole("heading", { name: "Partitioning, Ordering, and Consumer Rebalancing" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

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
