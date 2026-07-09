import { expect, test, type Page } from "@playwright/test";
import {
  expectTopologyNodeFramed,
  focusedOverlayActions,
  installConsoleFailureChecks,
  resetActiveRun,
  scenarioOverlayCases,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("every scenario renders and inspects a distinct topology overlay", async ({
  page,
}) => {
  for (const scenarioCase of scenarioOverlayCases) {
    await resetActiveRun(page);
    await page.goto(`/scenarios/${scenarioCase.id}`);
    await page.getByRole("button", { name: "Start scenario run" }).click();
    await expect(
      page.getByRole("button", { name: "Produce one" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Fit view" }).click();

    await expectTopologyNodeFramed(page, "topology-node-producer");
    await expectTopologyNodeFramed(page, "topology-node-topic");
    await expectTopologyNodeFramed(page, "topology-node-consumer-group");
    await expectTopologyNodeFramed(
      page,
      `topology-scenario-node-${scenarioCase.overlayId}`,
    );

    const overlay = page.getByTestId(
      `topology-scenario-node-${scenarioCase.overlayId}`,
    );
    await overlay.click();
    const inspector = page.locator("#message-inspector-drawer");
    await expect(inspector.getByText("Topology Inspector")).toBeVisible();
    await expect(
      inspector.locator("section").first().getByText(scenarioCase.title),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close topology inspector" })
      .click();
  }
});

test("scenario topology overlays react to scenario actions", async ({
  page,
}) => {
  for (const scenarioCase of focusedOverlayActions) {
    await resetActiveRun(page);
    await page.goto(`/scenarios/${scenarioCase.id}`);
    await page.getByRole("button", { name: "Start scenario run" }).click();
    await expect(
      page.getByRole("button", { name: "Produce one" }),
    ).toBeVisible();
    if (
      [
        "retry-dead-letter-queues",
        "schema-evolution-karapace",
        "acl-least-privilege",
      ].includes(scenarioCase.id)
    ) {
      await page.getByRole("button", { name: /^Consumer$/ }).click();
      await expect(page.getByTestId("consumer-node-consumer-1")).toBeVisible();
    }

    await page.getByRole("tab", { name: "Insights" }).click();
    const actionButton = page.getByRole("button", {
      name: scenarioCase.action,
    });
    await actionButton.click();
    await expect(actionButton).toBeEnabled();
    await expect
      .poll(async () =>
        page
          .getByTestId(`topology-scenario-node-${scenarioCase.overlayId}`)
          .textContent(),
      )
      .toMatch(scenarioCase.pattern);
  }
});

test("ACL principal card stays fully visible in a short desktop viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 576 });
  await resetActiveRun(page);
  await page.goto("/scenarios/acl-least-privilege");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  await expectElementFramedInTopologyCanvas(page, "topology-scenario-visual", {
    bottomInset: 12,
    tolerance: 12,
  });
  await expectElementFramedInTopologyCanvas(
    page,
    "scenario-visual-step-principal",
    { bottomInset: 16 },
  );
  await expectScenarioStepCardsReadable(page, ["principal", "acl", "resource"]);
});

test("tall scenario visuals stay framed on mobile after guided actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const scenarioCase of [
    {
      id: "at-least-once-duplicates",
      action: "Duplicate risk",
      overlayId: "commit-gate",
      producedCount: 2,
    },
    {
      id: "hot-partitions-key-skew",
      action: "Hot-key burst",
      overlayId: "hot-key-router",
      producedCount: 5,
    },
    {
      id: "streams-joins-windows",
      action: "Window pair",
      overlayId: "window-state-store",
      producedCount: 2,
    },
  ]) {
    await resetActiveRun(page);
    await page.goto(`/scenarios/${scenarioCase.id}`);
    await page.getByRole("button", { name: "Start scenario run" }).click();
    await expect(
      page.getByRole("button", { name: "Produce one" }),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Insights" }).click();
    await page.getByRole("button", { name: scenarioCase.action }).click();
    await expect
      .poll(async () => {
        const response = await page.request.get("/api/v1/runs");
        expect(response.ok()).toBe(true);
        const payload = (await response.json()) as {
          run: { messageCounts?: Record<string, number> } | null;
        };
        return payload.run?.messageCounts?.produced ?? 0;
      })
      .toBeGreaterThanOrEqual(scenarioCase.producedCount);
    await page.getByRole("button", { name: "Fit view" }).click();

    await expectScenarioVisualFramedOnMobile(page, scenarioCase.overlayId);
  }
});

async function expectScenarioVisualFramedOnMobile(
  page: Page,
  overlayId: string,
) {
  await expect
    .poll(async () =>
      page.evaluate((evaluatedOverlayId) => {
        const readBox = (testId: string) => {
          const element = document.querySelector(`[data-testid="${testId}"]`);
          if (!element) return null;
          const box = element.getBoundingClientRect();
          return {
            bottom: box.bottom,
            left: box.left,
            right: box.right,
            top: box.top,
          };
        };
        const canvas = readBox("topology-canvas");
        const visual = readBox("topology-scenario-visual");
        const hotspot = readBox(`topology-scenario-node-${evaluatedOverlayId}`);
        const within = (
          inner: ReturnType<typeof readBox>,
          outer: ReturnType<typeof readBox>,
          tolerance = 3,
        ) =>
          Boolean(
            inner &&
            outer &&
            inner.left >= outer.left - tolerance &&
            inner.top >= outer.top - tolerance &&
            inner.right <= outer.right + tolerance &&
            inner.bottom <= outer.bottom + tolerance,
          );

        const problems: string[] = [];
        if (!within(visual, canvas, 12)) problems.push("visual");
        if (!within(hotspot, canvas, 3)) problems.push("hotspot");
        if (document.documentElement.scrollWidth > window.innerWidth + 2) {
          problems.push("horizontal-overflow");
        }
        return problems;
      }, overlayId),
    )
    .toEqual([]);
}

async function expectElementFramedInTopologyCanvas(
  page: Page,
  testId: string,
  options: { bottomInset?: number; tolerance?: number } = {},
) {
  const { bottomInset = 0, tolerance = 3 } = options;
  await expect
    .poll(async () =>
      page.evaluate(
        ({ evaluatedTestId, evaluatedBottomInset, evaluatedTolerance }) => {
          const readBox = (id: string) => {
            const element = document.querySelector(`[data-testid="${id}"]`);
            if (!element) return null;
            const box = element.getBoundingClientRect();
            return {
              bottom: box.bottom,
              left: box.left,
              right: box.right,
              top: box.top,
            };
          };
          const canvas = readBox("topology-canvas");
          const element = readBox(evaluatedTestId);
          if (!canvas || !element) return false;
          return (
            element.left >= canvas.left - evaluatedTolerance &&
            element.top >= canvas.top - evaluatedTolerance &&
            element.right <= canvas.right + evaluatedTolerance &&
            element.bottom <=
              canvas.bottom - evaluatedBottomInset + evaluatedTolerance
          );
        },
        {
          evaluatedBottomInset: bottomInset,
          evaluatedTestId: testId,
          evaluatedTolerance: tolerance,
        },
      ),
    )
    .toBe(true);
}

async function expectScenarioStepCardsReadable(page: Page, stepIds: string[]) {
  await expect
    .poll(async () =>
      page.evaluate((evaluatedStepIds) => {
        const problems: string[] = [];
        for (const stepId of evaluatedStepIds) {
          const card = document.querySelector(
            `[data-testid="scenario-visual-step-${stepId}"]`,
          );
          if (!card) {
            problems.push(`${stepId}: missing`);
            continue;
          }
          const cardBox = card.getBoundingClientRect();
          if (cardBox.width < 90) {
            problems.push(`${stepId}: too narrow ${Math.round(cardBox.width)}`);
          }
          const overflowingText = Array.from(
            card.querySelectorAll<HTMLElement>("div,span"),
          )
            .filter((element) => {
              const box = element.getBoundingClientRect();
              if (box.width === 0 || box.height === 0) return false;
              return element.scrollWidth > element.clientWidth + 2;
            })
            .map((element) => element.textContent?.trim() ?? "")
            .filter(Boolean);
          if (overflowingText.length > 0) {
            problems.push(`${stepId}: clipped ${overflowingText.join(" / ")}`);
          }
        }
        return problems;
      }, stepIds),
    )
    .toEqual([]);
}
