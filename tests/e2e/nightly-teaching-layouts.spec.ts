import { expect, test, type Page } from "@playwright/test";
import {
  activeRunId,
  expectNoSeriousOrCriticalAxeViolations,
  installConsoleFailureChecks,
  produceOneViaApi,
  resetActiveRun,
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
      await resetActiveRun(page);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/scenarios/${scenario.scenarioId}`);
      await page.getByRole("button", { name: "Start scenario run" }).click();
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
    });
  }
});

async function instructionalTextBelowMinimum(page: Page) {
  return page.getByTestId("scenario-learning-surface").evaluate((surface) =>
    Array.from(surface.querySelectorAll<HTMLElement>("*"))
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
        size: Number.parseFloat(getComputedStyle(element).fontSize),
      }))
      .filter((item) => item.size < 12),
  );
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
