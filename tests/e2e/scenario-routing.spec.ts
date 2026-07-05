import { expect, test } from "@playwright/test";
import {
  idleConsumerLabel,
  installConsoleFailureChecks,
  resetActiveRun,
} from "./playground-test-helpers";

installConsoleFailureChecks();

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

test("fan-out scenario can show an idle consumer beyond the partition count", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/fan-out-load-balancing");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  const addConsumerButton = page.getByRole("button", { name: /^Consumer$/ });
  for (let index = 1; index <= 4; index += 1) {
    await addConsumerButton.click();
    await expect(
      page.getByTestId(`consumer-node-consumer-${index}`),
    ).toBeVisible();
    if (index === 1) {
      await expect(page.getByTestId("consumer-node-consumer-1")).toContainText(
        "active",
      );
      await expect(
        page.getByTestId("consumer-node-consumer-1"),
      ).not.toContainText("P0,P1,P2");
    }
  }

  await expect(addConsumerButton).toBeDisabled();
  await expect(page.getByTestId("run-settings-panel")).toContainText("C4");
  await expect(page.getByTestId("consumer-node-consumer-4")).toContainText(
    idleConsumerLabel,
  );
  await expect(
    page.locator("span", { hasText: idleConsumerLabel }),
  ).toBeVisible();
  const idleMembersOverlay = page.getByTestId(
    "topology-scenario-node-idle-members",
  );
  await expect(idleMembersOverlay).toBeVisible();
  await expect(idleMembersOverlay).toContainText("Idle");
  await expect(idleMembersOverlay).toContainText("1");
});

test("sidebar scenario navigation retires the active run", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await page.getByLabel("Search scenarios").fill("load balancing");
  await expect(
    page.getByRole("link", { name: /Consumer-group load balancing/ }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: /Consumer-group load balancing/ })
    .click();
  await expect(page).toHaveURL(/\/scenarios\/fan-out-load-balancing$/);
  await expect(page.getByTestId("current-scenario-card")).toContainText(
    "Consumer-group load balancing",
  );
  const startScenarioRun = page.getByRole("button", {
    name: "Start scenario run",
  });
  await expect(startScenarioRun).toBeVisible();
  await page.waitForTimeout(50);
  await startScenarioRun.click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});
