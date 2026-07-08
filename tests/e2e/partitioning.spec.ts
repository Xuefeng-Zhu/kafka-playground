import { expect, test } from "@playwright/test";
import {
  expectReactFlowStylesLoaded,
  expectTopologyNodeFramed,
  idleConsumerLabel,
  installConsoleFailureChecks,
  pageScrollPosition,
  resetActiveRun,
  topologyViewportTransform,
  topologyViewportZoom,
} from "./playground-test-helpers";

installConsoleFailureChecks();

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
    page.getByRole("link", { name: /Consumer-group load balancing/ }),
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
    page.getByRole("link", { name: /Consumer-group load balancing/ }),
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
    page.getByRole("link", { name: /Consumer-group load balancing/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.getByTestId("partition-empty-state-0")).toContainText(
    "No messages yet",
  );
  await expect(page.getByTestId("partition-placeholder-offset-0")).toHaveCount(
    0,
  );
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
  await expect(page.getByText("Event Inspector")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Selected Event" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close event inspector" }).click();
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
  await page.getByLabel("Messages per second").fill("11");
  await expect(page.getByLabel("Messages per second")).toHaveValue("1");
  await page.getByLabel("Messages per second").fill("");
  await expect(page.getByLabel("Messages per second")).toHaveValue("1");
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
  await expect(page.getByTestId("topology-flow")).toBeVisible();
  await expectReactFlowStylesLoaded(page);
  await expect(topologyContent).toBeVisible();
  await expect(page.getByTestId("topology-node-producer")).toBeVisible();
  await expect(page.getByTestId("topology-node-topic")).toBeVisible();
  await expect(page.getByTestId("topology-node-consumer-group")).toBeVisible();
  await expect(
    page.getByTestId("topology-scenario-node-key-router"),
  ).toBeVisible();
  await expect(
    page.getByTestId("topology-scenario-node-commit-progress"),
  ).toBeVisible();
  await expect(page.getByTestId("topology-scenario-visual")).toBeVisible();
  await expect(page.getByTestId("topology-node-scenario-visual")).toBeVisible();
  await expect(
    page.getByTestId("topology-edge-topic-scenario-visual"),
  ).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByTestId("topology-scenario-node-key-router"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reset overlay positions" }),
  ).toHaveCount(0);
  await expectTopologyNodeFramed(page, "topology-scenario-node-key-router");
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

  await expect(page.getByText("50%")).toBeVisible();
  await expect(page.getByRole("button", { name: "Zoom out" })).toBeDisabled();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("65%")).toBeVisible();
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(65);
  const topologyCanvasBox = await page
    .getByTestId("topology-canvas")
    .boundingBox();
  expect(topologyCanvasBox).not.toBeNull();
  if (topologyCanvasBox) {
    await page.mouse.move(topologyCanvasBox.x + 80, topologyCanvasBox.y + 80);
    const scrollBeforeWheel = await pageScrollPosition(page);
    await page.mouse.wheel(0, -120);
    await expect
      .poll(() => pageScrollPosition(page))
      .toEqual(scrollBeforeWheel);
  }
  const zoomAfterWheel = Math.round((await topologyViewportZoom(page)) * 100);
  if (zoomAfterWheel <= 65) {
    await page.getByRole("button", { name: "Zoom in" }).click();
  }
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBeGreaterThan(65);
  for (let index = 0; index < 5; index += 1) {
    if (Math.round((await topologyViewportZoom(page)) * 100) <= 50) break;
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
  await expect(page.getByText("50%")).toBeVisible();
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(50);
  await expect(page.getByTestId("topology-node-producer")).toBeVisible();
  await expect(page.getByTestId("topology-node-topic")).toBeVisible();
  await expect(page.getByTestId("topology-node-consumer-group")).toBeVisible();
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
  const [partitionLaneBox, partitionSourceHandleBox] = await Promise.all([
    page.getByTestId("partition-lane-0").boundingBox(),
    page.locator('[data-handleid="partition-0-out"]').evaluate((element) => {
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
  expect(partitionSourceHandleBox).not.toBeNull();
  if (partitionLaneBox && partitionSourceHandleBox) {
    const handleMidpoint =
      partitionSourceHandleBox.y + partitionSourceHandleBox.height / 2;
    expect(handleMidpoint).toBeGreaterThan(partitionLaneBox.y);
    expect(handleMidpoint).toBeLessThan(
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
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect(page.getByText("65%")).toBeVisible();
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await expect(page.getByText("65%")).toBeVisible();
  await expect
    .poll(async () => Math.round((await topologyViewportZoom(page)) * 100))
    .toBe(65);
  await expect(page.getByTestId("topology-node-producer")).toBeVisible();
  await expect(page.getByTestId("topology-edge-producer-topic")).toHaveCount(1);
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
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Message Inspector")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();
  await expect(page.getByTestId("partition-owner-0")).toBeVisible();
  await expect(page.getByTestId("topology-scenario-visual")).toBeVisible();
  await expect(
    page.getByTestId("topology-scenario-node-key-router"),
  ).toBeVisible();
  await expect
    .poll(async () =>
      page
        .getByTestId("topology-canvas")
        .evaluate((element) => element.scrollWidth <= element.clientWidth),
    )
    .toBe(true);
  await expect
    .poll(async () =>
      page
        .getByTestId("topology-canvas")
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBeGreaterThanOrEqual(0);

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
});
