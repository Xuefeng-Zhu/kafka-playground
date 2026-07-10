import { expect, test, type Page } from "@playwright/test";
import {
  activeRunId,
  clearWorkspaceViewPreference,
  expectMobileTargets,
  expectNoSeriousOrCriticalAxeViolations,
  installConsoleFailureChecks,
  produceOneViaApi,
  resetActiveRun,
  selectWorkspaceView,
} from "./playground-test-helpers";
import { scenarioTeachingManifest } from "./scenario-teaching-manifest";

installConsoleFailureChecks();

test.describe("nightly teaching layouts", () => {
  test.skip(
    process.env.PLAYWRIGHT_NIGHTLY !== "true",
    "Nightly responsive and cross-browser matrix",
  );

  for (const scenario of scenarioTeachingManifest) {
    test(`${scenario.scenarioId} survives compact, tablet, zoom, motion, and reconnect probes`, async ({
      page,
    }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await clearWorkspaceViewPreference(page);
      await resetActiveRun(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/scenarios/${scenario.scenarioId}`);
      await page.getByRole("button", { name: "Start scenario run" }).click();
      await expect(
        page.getByRole("tab", { name: "Guided", exact: true }),
      ).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId("timeline-region")).toHaveCount(0);
      await expect(page.getByTestId("explore-topology")).toHaveCount(0);
      await page
        .getByTestId(`experiment-${scenario.primaryExperimentId}`)
        .click();
      await waitForExperiment(page, scenario.primaryExperimentId);

      for (const viewport of [
        { width: 320, height: 700 },
        { width: 768, height: 900 },
        { width: 1024, height: 560 },
      ]) {
        await page.setViewportSize(viewport);
        await expect(
          page.getByTestId("scenario-learning-surface"),
        ).toBeVisible();
        await expect(page.getByTestId("scenario-evidence-lens")).toBeVisible();
        const dimensions = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        }));
        expect(dimensions.documentWidth).toBeLessThanOrEqual(
          dimensions.viewportWidth + 2,
        );
        expect(await instructionalTextBelowMinimum(page)).toEqual([]);
      }

      await page.setViewportSize({ width: 720, height: 900 });
      await page.evaluate(() => {
        document.documentElement.style.zoom = "2";
      });
      await expect(
        page.getByText("What changed", { exact: true }),
      ).toBeVisible();
      await expect(page.getByTestId("scenario-evidence-lens")).toBeVisible();
      await page.evaluate(() => {
        document.documentElement.style.zoom = "";
      });

      if (scenario.scenarioId === "partitioning") {
        const runId = await activeRunId(page);
        const settings = await page.request.patch(
          `/api/v1/runs/${runId}/settings`,
          {
            data: { processingLatencyMs: 5_000 },
          },
        );
        expect(settings.ok()).toBe(true);
        for (let index = 0; index < 40; index += 1) {
          await produceOneViaApi(page, runId);
        }
        const snapshotResponse = await page.request.get("/api/v1/runs");
        const snapshotPayload = (await snapshotResponse.json()) as {
          run: {
            recentMessages?: Array<{ messageId?: string }>;
          } | null;
        };
        expect(
          snapshotPayload.run?.recentMessages?.length,
        ).toBeGreaterThanOrEqual(40);
        expect(
          snapshotPayload.run?.recentMessages?.some(
            (message) => (message.messageId?.length ?? 0) > 30,
          ),
        ).toBe(true);
      }

      // A reload closes and recreates EventSource, exercising bounded-history
      // replay and persistence without exposing a second selection model.
      await page.reload();
      await expect(
        page.getByTestId("scenario-learning-surface"),
      ).toHaveAttribute("data-experiment-id", scenario.primaryExperimentId);
      await expectNoSeriousOrCriticalAxeViolations(page);

      await selectWorkspaceView(page, "Explore");
      await page.setViewportSize({ width: 1024, height: 560 });
      await expect(page.getByTestId("topology-flow")).toBeVisible();
      await expect(
        page.getByTestId(`topology-node-scenario-${scenario.extensionNodeId}`),
      ).toBeVisible();
      await expect.poll(() => scenarioEdgeLabelNodeOverlaps(page)).toEqual([]);
      await expect
        .poll(() =>
          page.locator(".react-flow__viewport").evaluate((viewport) => {
            const transform = getComputedStyle(viewport).transform;
            return transform && transform !== "none"
              ? new DOMMatrixReadOnly(transform).a
              : 1;
          }),
        )
        .toBeGreaterThanOrEqual(0.995);
      expect(
        await instructionalTextBelowMinimum(page, "explore-topology"),
      ).toEqual([]);

      await page.setViewportSize({ width: 320, height: 700 });
      await expect(page.getByTestId("semantic-topology-list")).toBeVisible();
      await expect(page.getByTestId("topology-flow")).toHaveCount(0);
      await expect(
        page.getByTestId(`semantic-scenario-node-${scenario.extensionNodeId}`),
      ).toBeVisible();
      await expect(
        page.getByTestId(`semantic-scenario-edge-${scenario.causalEdgeId}`),
      ).toBeVisible();
      await expectMobileTargets(page, "explore-workspace-region");
      const exploreDimensions = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(exploreDimensions.documentWidth).toBeLessThanOrEqual(
        exploreDimensions.viewportWidth + 2,
      );
    });
  }
});

async function instructionalTextBelowMinimum(
  page: Page,
  testId = "scenario-learning-surface",
) {
  return page.getByTestId(testId).evaluate((surface) => {
    const flowViewport = surface.querySelector<HTMLElement>(
      ".react-flow__viewport",
    );
    const transform = flowViewport
      ? getComputedStyle(flowViewport).transform
      : "none";
    const flowScale =
      transform && transform !== "none"
        ? new DOMMatrixReadOnly(transform).a
        : 1;
    return Array.from(surface.querySelectorAll<HTMLElement>("*"))
      .filter((element) => {
        const hasDirectText = Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            (node.textContent?.trim().length ?? 0) > 0,
        );
        if (!hasDirectText) return false;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return (
          box.width > 0 &&
          box.height > 0 &&
          style.display !== "none" &&
          style.visibility !== "hidden"
        );
      })
      .map((element) => ({
        text: element.textContent?.trim().slice(0, 80) ?? "",
        size:
          Number.parseFloat(getComputedStyle(element).fontSize) *
          (element.closest(".react-flow__viewport") ? flowScale : 1),
      }))
      .filter((item) => item.size < 11.95);
  });
}

async function scenarioEdgeLabelNodeOverlaps(page: Page) {
  return page.evaluate(() => {
    const labels = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid^="topology-edge-label-scenario-edge-"]',
      ),
    );
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(
        '[data-testid="topology-flow"] .react-flow__node',
      ),
    );
    const overlaps: string[] = [];
    for (const label of labels) {
      const labelBox = label.getBoundingClientRect();
      for (const node of nodes) {
        const nodeBox = node.getBoundingClientRect();
        const separated =
          labelBox.right <= nodeBox.left + 1 ||
          labelBox.left >= nodeBox.right - 1 ||
          labelBox.bottom <= nodeBox.top + 1 ||
          labelBox.top >= nodeBox.bottom - 1;
        if (!separated) {
          overlaps.push(
            `${label.dataset.testid ?? "edge-label"} [${boxText(labelBox)}] overlaps ${node.dataset.testid ?? node.id} [${boxText(nodeBox)}]`,
          );
        }
      }
    }
    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = nodes[leftIndex]!;
      const leftBox = left.getBoundingClientRect();
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < nodes.length;
        rightIndex += 1
      ) {
        const right = nodes[rightIndex]!;
        const rightBox = right.getBoundingClientRect();
        const separated =
          leftBox.right <= rightBox.left + 1 ||
          leftBox.left >= rightBox.right - 1 ||
          leftBox.bottom <= rightBox.top + 1 ||
          leftBox.top >= rightBox.bottom - 1;
        if (!separated) {
          overlaps.push(
            `${left.dataset.testid ?? left.id} [${boxText(leftBox)}] overlaps ${right.dataset.testid ?? right.id} [${boxText(rightBox)}]`,
          );
        }
      }
    }
    return overlaps;

    function boxText(box: DOMRect) {
      return [box.left, box.top, box.right, box.bottom]
        .map((value) => Math.round(value))
        .join(",");
    }
  });
}

async function waitForExperiment(page: Page, experimentId: string) {
  await expect
    .poll(async () => {
      const response = await page.request.get("/api/v1/runs");
      const payload = (await response.json()) as {
        run: {
          scenarioState?: {
            experiment?: { experimentId?: string; status?: string };
          };
        } | null;
      };
      return payload.run?.scenarioState?.experiment;
    })
    .toEqual(expect.objectContaining({ experimentId, status: "completed" }));
}
