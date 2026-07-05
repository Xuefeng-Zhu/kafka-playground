import { expect, test } from "@playwright/test";
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
