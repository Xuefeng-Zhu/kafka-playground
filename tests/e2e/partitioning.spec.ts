import { expect, test } from "@playwright/test";
import {
  installConsoleFailureChecks,
  resetActiveRun,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("partitioning workspace keeps raw controls and timeline below teaching evidence", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");

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
  await expect(page.getByTestId("topology-flow")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Insights" })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Controls" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  const settings = page.getByTestId("run-settings-panel");
  await expect(settings).toBeVisible();
  await expect(page.getByLabel("Messages per second")).toBeVisible();
  await expect(page.getByLabel("Key strategy")).toBeVisible();
  await expect(page.getByLabel("Consumer processing latency")).toBeVisible();
  await page.getByLabel("Messages per second").fill("11");
  await expect(page.getByLabel("Messages per second")).toHaveValue("1");

  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(
    page.getByRole("dialog", { name: "Message inspector" }),
  ).toBeVisible();
  await expect(page.getByText("Selected message")).toBeVisible();
  await page.getByRole("button", { name: "Close message inspector" }).click();

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

  await page.getByRole("tab", { name: "Timeline" }).click();
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

  await page.reload();
  await expect(page.getByTestId("scenario-learning-surface")).toHaveAttribute(
    "data-experiment-id",
    "produce-keyed-record",
  );
  await expect(page.getByRole("tab", { name: "Timeline" })).toHaveAttribute(
    "aria-selected",
    "true",
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("causal-graph-list")).toBeVisible();
  await expect(page.getByTestId("causal-graph-rail")).toBeHidden();
  await expect(page.getByTestId("topology-flow")).toHaveCount(0);
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
  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});
