import { expect, type Page, test } from "@playwright/test";

const idleConsumerLabel = "idle - no partition available";

test("demo scenario visualizes assignments, idle consumer, message details, and reset", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.evaluate(() => {
    window.localStorage.removeItem("kplay.lowerPanel.activeTab");
  });
  await page.reload();
  await expect(page.getByTestId("lower-panel-tabs")).toHaveCount(0);
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
  await expect(page.getByTestId("event-timeline")).toHaveCount(0);
  await expect(
    page.getByRole("complementary").getByText("Available", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("complementary")
      .getByText("Partitioning, Ordering, and Consumer Rebalancing"),
  ).toHaveCount(1);
  await expect(page.getByTestId("current-scenario-card")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("link", {
      name: /Partitioning, Ordering, and Consumer Rebalancing/,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /Fan-out versus load balancing/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Partitioning, Ordering, and Consumer Rebalancing",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Ordering is guaranteed only within a partition."),
  ).toBeVisible();
  const scenarioSearch = page.getByLabel("Search scenarios");
  await expect(scenarioSearch).toBeVisible();
  await scenarioSearch.fill("acl");
  await expect(page.getByTestId("current-scenario-card")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: /ACLs, users, and least privilege/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Fan-out versus load balancing/ }),
  ).toHaveCount(0);
  await scenarioSearch.fill("duplicate");
  await expect(
    page.getByRole("link", {
      name: /At-least-once delivery and duplicate processing/,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("scenario-search-empty")).toHaveCount(0);
  await scenarioSearch.fill("zzzz no scenario");
  await expect(page.getByTestId("scenario-search-empty")).toContainText(
    "No scenarios match your search.",
  );
  await expect(
    page.getByRole("link", { name: /ACLs, users, and least privilege/ }),
  ).toHaveCount(0);
  await page.getByTestId("scenario-search-clear").click();
  await expect(scenarioSearch).toHaveValue("");
  await expect(page.getByTestId("current-scenario-card")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("link", { name: /Fan-out versus load balancing/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByTestId("lower-panel-tab-controls")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("lower-panel-tab-insights")).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(page.getByTestId("lower-panel-tab-timeline")).toHaveAttribute(
    "aria-selected",
    "false",
  );
  await expect(page.getByTestId("timeline-expand-toggle")).toHaveCount(0);
  await expect(
    page
      .getByTestId("run-controls-panel")
      .getByRole("button", { name: "Consumer" }),
  ).toBeVisible();
  const timelineRegion = page.getByTestId("timeline-region");
  const inspectorButton = page.getByRole("button", {
    name: "Open message inspector",
  });
  await expect(inspectorButton).toBeVisible();
  const inspectorButtonBox = await inspectorButton.boundingBox();
  const lowerPanelBox = await timelineRegion.boundingBox();
  expect(inspectorButtonBox).not.toBeNull();
  expect(lowerPanelBox).not.toBeNull();
  if (inspectorButtonBox && lowerPanelBox) {
    expect(
      inspectorButtonBox.y + inspectorButtonBox.height,
    ).toBeLessThanOrEqual(lowerPanelBox.y - 4);
  }
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("lower-panel-tab-timeline")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .locator("button")
    .filter({ hasText: "run.started" })
    .first()
    .click();
  await expect(page.getByText("Selected Event")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();
  await page.reload();
  await expect(page.getByTestId("lower-panel-tab-timeline")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.setViewportSize({ width: 1440, height: 576 });
  const resizeHandle = page.getByTestId("timeline-resize-handle");
  await expect(resizeHandle).toBeVisible();
  const heightBeforeResize = await timelineRegion.evaluate(
    (element) => element.getBoundingClientRect().height,
  );
  const resizeHandleBox = await resizeHandle.boundingBox();
  expect(resizeHandleBox).not.toBeNull();
  if (resizeHandleBox) {
    await page.mouse.move(
      resizeHandleBox.x + resizeHandleBox.width / 2,
      resizeHandleBox.y + resizeHandleBox.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      resizeHandleBox.x + resizeHandleBox.width / 2,
      resizeHandleBox.y - 180,
    );
    await page.mouse.up();
    await expect
      .poll(async () =>
        timelineRegion.evaluate(
          (element) => element.getBoundingClientRect().height,
        ),
      )
      .toBeGreaterThan(Math.max(260, heightBeforeResize + 60));
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByTestId("run-settings-panel")).toBeVisible();
  await expect(page.getByLabel("Messages per second")).toBeVisible();
  await expect(page.getByLabel("Key strategy")).toBeVisible();
  await expect(page.getByLabel("Consumer processing latency")).toBeVisible();
  const settingsControlTops = await page
    .locator(
      "#run-settings-panel input[aria-label='Messages per second'], #run-settings-panel select#key-strategy, #run-settings-panel input[aria-label='Consumer processing latency'], #run-settings-panel span:has-text('0 consumers')",
    )
    .evaluateAll((elements) =>
      elements.map((element) =>
        Math.round(element.getBoundingClientRect().top),
      ),
    );
  expect(
    Math.max(...settingsControlTops) - Math.min(...settingsControlTops),
  ).toBeLessThanOrEqual(2);
  const [rateBox, latencyBox, keyStrategyBox] = await Promise.all([
    page.getByLabel("Messages per second").boundingBox(),
    page.getByLabel("Consumer processing latency").boundingBox(),
    page.getByLabel("Key strategy").boundingBox(),
  ]);
  expect(rateBox).not.toBeNull();
  expect(latencyBox).not.toBeNull();
  expect(keyStrategyBox).not.toBeNull();
  if (rateBox && latencyBox && keyStrategyBox) {
    expect(rateBox.x).toBeLessThan(latencyBox.x);
    expect(latencyBox.x).toBeLessThan(keyStrategyBox.x);
  }
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByTestId("run-settings-panel")).toBeVisible();
  await expect(page.getByText("Live topology canvas")).toHaveCount(0);
  await expect(
    page.getByText("Producer to partition to assigned consumer to commit"),
  ).toHaveCount(0);

  const topologyContent = page.getByTestId("topology-canvas-content");
  const topologyViewport = page.locator(".react-flow__viewport");
  await expect(page.getByTestId("topology-flow")).toBeVisible();
  await expect(topologyContent).toBeVisible();
  await expect(page.getByTestId("topology-node-producer")).toBeVisible();
  await expect(page.getByTestId("topology-node-topic")).toBeVisible();
  await expect(page.getByTestId("topology-node-consumer-group")).toBeVisible();
  await expect(page.getByTestId("topology-edge-producer-topic")).toHaveCount(1);
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
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(115);
  const topologyCanvasBox = await page
    .getByTestId("topology-canvas")
    .boundingBox();
  expect(topologyCanvasBox).not.toBeNull();
  if (topologyCanvasBox) {
    await page.mouse.move(topologyCanvasBox.x + 80, topologyCanvasBox.y + 80);
    await page.mouse.wheel(0, -120);
  }
  await expect(page.getByText("130%")).toBeVisible();
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(130);
  for (let index = 0; index < 6; index += 1) {
    await page.getByRole("button", { name: "Zoom out" }).click();
  }
  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();

  await page.getByRole("button", { name: "Auto layout" }).click();
  await expect(
    page.getByRole("button", { name: "Spread layout" }),
  ).toHaveAttribute("aria-pressed", "true");

  expect(topologyCanvasBox).not.toBeNull();
  if (topologyCanvasBox) {
    const transformBeforePan = await topologyViewportTransform(page);
    await page.mouse.move(topologyCanvasBox.x + 40, topologyCanvasBox.y + 180);
    await page.mouse.down();
    await page.mouse.move(topologyCanvasBox.x + 100, topologyCanvasBox.y + 210);
    await page.mouse.up();
    await expect
      .poll(async () => topologyViewportTransform(page))
      .not.toBe(transformBeforePan);
  }

  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(page.getByText("100%")).toBeVisible();
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(100);
  await expect
    .poll(async () => await topologyViewportTransform(page))
    .toBe("matrix(1, 0, 0, 1, 0, 0)");
  await page.getByRole("button", { name: "Spread layout" }).click();
  await expect(
    page.getByRole("button", { name: "Auto layout" }),
  ).toHaveAttribute("aria-pressed", "false");

  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(
    page.locator("span", { hasText: idleConsumerLabel }),
  ).toBeVisible();
  await expect(page.getByTestId("partition-owner-0")).toContainText(
    "owned by C",
  );
  await expect(page.getByTestId("partition-owner-1")).toContainText(
    "owned by C",
  );
  await expect(page.getByTestId("topology-edge-partition-0")).toHaveCount(1);
  await expect(page.getByTestId("topology-edge-partition-1")).toHaveCount(1);
  const [partitionLaneBox, ownershipConnectorBox] = await Promise.all([
    page.getByTestId("partition-lane-0").boundingBox(),
    page
      .getByTestId("topology-edge-partition-0")
      .locator(".react-flow__edge-path")
      .evaluate((element) => {
        const box = element.getBoundingClientRect();
        return {
          height: box.height,
          width: box.width,
          x: box.x,
          y: box.y,
        };
      }),
  ]);
  expect(partitionLaneBox).not.toBeNull();
  expect(ownershipConnectorBox).not.toBeNull();
  if (partitionLaneBox && ownershipConnectorBox) {
    const connectorMidpoint =
      ownershipConnectorBox.y + ownershipConnectorBox.height / 2;
    expect(connectorMidpoint).toBeGreaterThan(partitionLaneBox.y);
    expect(connectorMidpoint).toBeLessThan(
      partitionLaneBox.y + partitionLaneBox.height,
    );
  }
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByTestId("lower-panel-tab-insights")).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const checkpoint = page.getByTestId("scenario-checkpoint-panel");
  await expect(checkpoint).toContainText(
    "Why is a consumer idle in this group?",
  );
  await checkpoint
    .getByRole("button", { name: "The producer has paused message creation." })
    .click();
  await expect(page.getByTestId("scenario-checkpoint-feedback")).toContainText(
    "Try again.",
  );
  await checkpoint
    .getByRole("button", {
      name: "There are more group members than partitions.",
    })
    .click();
  await expect(page.getByTestId("scenario-checkpoint-feedback")).toContainText(
    "Correct.",
  );

  await page.getByRole("button", { name: "Inspect consumer-1" }).click();
  await expect(page.getByText("Consumer Metrics")).toBeVisible();
  await expect(page.getByText("Assignments", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close topology inspector" }).click();

  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await expect(page.getByText("Topology Inspector")).toHaveCount(0);
  await expect(page.getByText("Selected message")).toBeVisible();
  await expect(page.getByText("Partition", { exact: true })).toBeVisible();
  await expect(page.getByText("Offset", { exact: true })).toBeVisible();

  await expect
    .poll(async () => await page.getByText("committed").count())
    .toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(
    page.locator("span", { hasText: idleConsumerLabel }),
  ).toBeVisible();

  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Stop consumer-1" }).click();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(
    page.getByText("consumer.partitions_assigned").first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("partition-owner-0")).toBeVisible();
  await expect
    .poll(async () =>
      page
        .getByTestId("topology-canvas")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
});

test("non-primary scenarios are routable and startable", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/hot-partitions-key-skew");
  await expect(page.getByTestId("current-scenario-card")).toContainText(
    "Hot partitions and key skew",
  );
  await expect(page.getByText("Locked")).toHaveCount(0);
  await expect(
    page.getByRole("complementary").getByText("Available", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByTestId("current-scenario-card")).toContainText(
    "Hot partitions and key skew",
  );
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(
    page.getByText("Hot partitions and key skew started."),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary").getByText("4 partitions"),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Insights" }).click();
  await expect(page.getByText("Hot partition detector")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Hot-key burst" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Hot-key burst" }).click();
  await expect
    .poll(async () => page.getByTestId("scenario-insight-panel").textContent())
    .toMatch(/Records there\s*5/);
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(
    page.locator("#message-inspector-drawer").getByText("celebrity-user"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();
  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});

test("sidebar scenario navigation retires the active run", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await page.getByLabel("Search scenarios").fill("load balancing");
  await expect(
    page.getByRole("link", { name: /Fan-out versus load balancing/ }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: /Fan-out versus load balancing/ })
    .click();
  await expect(page).toHaveURL(/\/scenarios\/fan-out-load-balancing$/);
  await expect(page.getByTestId("current-scenario-card")).toContainText(
    "Fan-out versus load balancing",
  );
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});

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
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();

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

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});

async function topologyViewportTransform(page: Page) {
  return page
    .locator(".react-flow__viewport")
    .evaluate((element) => getComputedStyle(element).transform);
}

async function topologyViewportZoom(page: Page) {
  return page.locator(".react-flow__viewport").evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 1;
    return new DOMMatrixReadOnly(transform).a;
  });
}

async function resetActiveRun(page: Page) {
  const response = await page.request.get("/api/v1/runs");
  if (!response.ok()) return;

  const payload = (await response.json()) as { run: { runId?: string } | null };
  if (payload.run?.runId) {
    await page.request.post(`/api/v1/runs/${payload.run.runId}/reset`);
  }
}
