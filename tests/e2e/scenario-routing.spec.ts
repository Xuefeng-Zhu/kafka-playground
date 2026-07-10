import { expect, test } from "@playwright/test";
import {
  installConsoleFailureChecks,
  resetActiveRun,
} from "./playground-test-helpers";

installConsoleFailureChecks();

test("non-primary scenarios are routable and start teaching experiences", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/hot-partitions-key-skew");
  await expect(page.getByTestId("current-scenario-card")).toContainText(
    "Hot partitions and key skew",
  );
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByTestId("scenario-learning-surface")).toHaveAttribute(
    "data-scenario-id",
    "hot-partitions-key-skew",
  );
  await expect(page.getByText("Hot-key distribution")).toBeVisible();

  await page.getByTestId("experiment-hot-key-burst").click();
  await expect
    .poll(async () => page.getByTestId("scenario-evidence-lens").textContent())
    .toMatch(/Fixed hot key|Hot phase size/);

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});

test("load-balancing experiment shows one owner per partition and an idle fourth member", async ({
  page,
}) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/fan-out-load-balancing");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await page.getByTestId("experiment-grow-consumer-group").click();

  await expect
    .poll(async () => page.getByTestId("scenario-evidence-lens").textContent())
    .toMatch(/consumer-4|Idle members\s*1/i);

  const response = await page.request.get("/api/v1/runs");
  const body = (await response.json()) as {
    run: {
      scenarioState?: {
        epochs?: Array<{
          assignments: Array<{ consumerId: string; partitions: number[] }>;
          idleConsumerIds: string[];
        }>;
      };
    } | null;
  };
  const epoch = body.run?.scenarioState?.epochs?.at(-1);
  expect(epoch?.idleConsumerIds).toEqual(["consumer-4"]);
  const ownedPartitions =
    epoch?.assignments.flatMap((assignment) => assignment.partitions) ?? [];
  expect(ownedPartitions.sort()).toEqual([0, 1, 2]);
  expect(new Set(ownedPartitions).size).toBe(3);
});

test("sidebar scenario navigation retires the active run", async ({ page }) => {
  await resetActiveRun(page);
  await page.goto("/scenarios/partitioning");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await page.getByLabel("Search scenarios").fill("load balancing");
  await page
    .getByRole("link", { name: /Consumer-group load balancing/ })
    .click();
  await expect(page).toHaveURL(/\/scenarios\/fan-out-load-balancing$/);
  await expect(
    page.getByRole("button", { name: "Start scenario run" }),
  ).toBeVisible();
});
