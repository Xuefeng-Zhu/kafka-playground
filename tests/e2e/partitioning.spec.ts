import { expect, test } from "@playwright/test";
import {
  clearWorkspaceViewPreference,
  installConsoleFailureChecks,
  resetActiveRun,
  selectWorkspaceView,
  WORKSPACE_VIEW_STORAGE_KEY,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("partitioning keeps Guided teaching and Explore topology in one persistent run", async ({
  page,
}, testInfo) => {
  await clearWorkspaceViewPreference(page);
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");

  const preRunWorkspaceSwitch = page.getByRole("tablist", {
    name: "Workspace view",
  });
  await expect(preRunWorkspaceSwitch).toBeVisible();
  await expect(preRunWorkspaceSwitch).toHaveAttribute(
    "title",
    "Start a run to use Guided or Explore.",
  );
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Explore", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
  await expect(page.getByTestId("current-scenario-card")).toHaveAttribute(
    "aria-current",
    "page",
  );
  const scenarioSearch = page.getByLabel("Search scenarios");
  await scenarioSearch.fill("acl");
  await expect(
    page.getByRole("link", { name: /ACLs, users, and least privilege/ }),
  ).toBeVisible();
  await page.getByTestId("scenario-search-clear").click();

  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByTestId("scenario-learning-surface")).toBeVisible();
  await expect(page.getByTestId("scenario-evidence-lens")).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("teaching-experience-region")).toBeVisible();
  await expect(page.getByTestId("explore-workspace-region")).toHaveCount(0);
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
  await expect(page.getByTestId("lower-panel-tabs")).toHaveCount(0);
  await expect(page.getByTestId("topology-flow")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Insights" })).toHaveCount(0);

  await page.getByTestId("experiment-produce-keyed-record").click();
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/v1/runs");
      const body = (await response.json()) as {
        run: {
          scenarioState?: {
            experiment?: { experimentId?: string; status?: string };
          };
        } | null;
      };
      return body.run?.scenarioState?.experiment;
    })
    .toEqual({
      completedAtVirtualMs: expect.any(Number),
      error: null,
      experimentId: "produce-keyed-record",
      startedAtVirtualMs: expect.any(Number),
      status: "completed",
      stepIndex: expect.any(Number),
      totalSteps: expect.any(Number),
    });

  const transitionFocus = page
    .getByTestId("experiment-transition-trail")
    .getByRole("button")
    .first();
  await transitionFocus.click();
  await expect(transitionFocus).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /^Close .* inspector$/ }).click();

  await page.reload();
  await expect(page.getByTestId("scenario-learning-surface")).toHaveAttribute(
    "data-experiment-id",
    "produce-keyed-record",
  );
  await expect(
    page.getByRole("tab", { name: "Guided", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await selectWorkspaceView(page, "Explore");
  await expect(page.getByTestId("explore-workspace-region")).toBeVisible();
  await expect(page.getByTestId("explore-topology")).toBeVisible();
  const [workspaceSwitchBox, resetButtonBox] = await Promise.all([
    page.getByRole("tablist", { name: "Workspace view" }).boundingBox(),
    page.getByRole("button", { name: "Reset run" }).boundingBox(),
  ]);
  expect(workspaceSwitchBox).not.toBeNull();
  expect(resetButtonBox).not.toBeNull();
  expect(Math.round(workspaceSwitchBox?.height ?? 0)).toBe(
    Math.round(resetButtonBox?.height ?? 0),
  );
  await expect(
    page.getByRole("region", { name: "Simulated runtime topology" }),
  ).toBeVisible();
  await expect(page.getByTestId("topology-flow")).toBeVisible();
  await expect(page.getByTestId("topology-pan-help")).toHaveCount(0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.locator(".react-flow__pane")).toHaveCSS("cursor", "grab");
  await expect(page.getByTestId("topology-node-scenario-visual")).toHaveCount(
    0,
  );
  await expect(page.getByTestId("timeline-region")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Controls" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const zoomOut = page.getByRole("button", { name: /^Zoom out/ });
  const zoomLevel = page.getByTestId("topology-zoom-level");
  await expect(zoomLevel).toHaveText("100%");
  for (const expectedZoom of ["85%", "70%", "55%", "50%"]) {
    await zoomOut.click();
    await expect(zoomLevel).toHaveText(expectedZoom);
  }
  await expect(zoomOut).toBeDisabled();
  await page.getByRole("button", { name: "Fit view" }).click();
  await expect(zoomLevel).toHaveText("100%");

  const settings = page.getByTestId("run-settings-panel");
  await expect(settings).toBeVisible();
  await expect(page.getByLabel("Messages per second")).toBeVisible();
  await expect(page.getByLabel("Key strategy")).toBeVisible();
  await expect(page.getByLabel("Consumer processing latency")).toBeVisible();

  await page.getByRole("button", { name: "Produce one" }).click();
  const messageInspector = page.getByRole("dialog", {
    name: "Message inspector",
  });
  await expect(messageInspector).toBeVisible();
  await expect(page.getByText("Selected message")).toBeVisible();

  const runResponse = await page.request.get("/api/v1/runs");
  const runPayload = (await runResponse.json()) as {
    run: { recentMessages?: Array<{ messageId: string }> } | null;
  };
  const selectedMessageId = runPayload.run?.recentMessages?.at(-1)?.messageId;
  expect(selectedMessageId).toBeTruthy();
  await expect(
    page.getByTestId(`partition-message-${selectedMessageId}`),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Close message inspector" }).click();

  await selectWorkspaceView(page, "Guided");
  await page.getByRole("button", { name: "Open message inspector" }).click();
  await expect(messageInspector).toBeVisible();
  await expect(page.getByTestId("scenario-learning-surface")).toHaveAttribute(
    "data-experiment-id",
    "produce-keyed-record",
  );
  await expect(page.getByTestId("timeline-region")).toHaveCount(0);
  await page.getByRole("button", { name: "Close message inspector" }).click();

  await selectWorkspaceView(page, "Explore");
  await expect(
    page.getByTestId(`partition-message-${selectedMessageId}`),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("tab", { name: "Timeline" }).click();
  await expect(page.getByTestId("event-timeline")).toBeVisible();
  await expect(
    page.getByText("scenario.experiment.completed").first(),
  ).toBeVisible();
  await page
    .locator('[data-focus-key^="event:"]')
    .filter({ hasText: "scenario.experiment.completed" })
    .first()
    .click();
  await expect(
    page.getByRole("dialog", { name: "Event inspector" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close event inspector" }).click();

  await page.getByTestId("explore-topology").screenshot({
    path: `docs/screenshots/evidence/${testInfo.project.name}-partitioning-explore-desktop.png`,
    animations: "disabled",
  });

  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Explore", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect
    .poll(() =>
      page.evaluate(
        (key) => window.localStorage.getItem(key),
        WORKSPACE_VIEW_STORAGE_KEY,
      ),
    )
    .toBe("explore");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("explore-topology")).toBeVisible();
  await expect(page.getByTestId("semantic-topology-list")).toBeVisible();
  await expect(page.getByTestId("topology-flow")).toHaveCount(0);
  await expect(page.getByTestId("timeline-region")).toBeVisible();
  await page.getByRole("tab", { name: "Controls" }).click();
  for (const [fieldLabel, sliderLabel] of [
    ["Messages per second", "Produce rate slider"],
    ["Consumer processing latency", "Processing latency slider"],
  ] as const) {
    const [fieldBox, sliderBox] = await Promise.all([
      page.getByLabel(fieldLabel).boundingBox(),
      page.getByLabel(sliderLabel).boundingBox(),
    ]);
    expect(fieldBox).not.toBeNull();
    expect(sliderBox).not.toBeNull();
    expect(fieldBox?.height).toBeGreaterThanOrEqual(44);
    expect(sliderBox?.height).toBeGreaterThanOrEqual(44);
    expect(sliderBox?.y ?? 0).toBeGreaterThanOrEqual(
      (fieldBox?.y ?? 0) + (fieldBox?.height ?? 0),
    );
  }
  const mobileWidths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(mobileWidths.document).toBeLessThanOrEqual(mobileWidths.viewport + 2);

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.getByTestId("semantic-topology-list")).toBeVisible();
  await expect(page.getByTestId("topology-flow")).toHaveCount(0);
  const compactWidths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(compactWidths.document).toBeLessThanOrEqual(
    compactWidths.viewport + 2,
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Explore", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Explore", exact: true }),
  ).toHaveAttribute("aria-selected", "true");

  await page.goto("/scenarios/hot-partitions-key-skew");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(
    page.getByRole("tab", { name: "Explore", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("topology-flow")).toBeVisible();
  await page.getByRole("tab", { name: "Controls" }).click();
  await page.getByRole("button", { name: "Reset run" }).click();
});
