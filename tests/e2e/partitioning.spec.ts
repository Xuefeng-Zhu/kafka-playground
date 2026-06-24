import { expect, test } from "@playwright/test";

test("demo scenario visualizes assignments, idle consumer, message details, and reset", async ({ page }) => {
  await page.goto("/scenarios/partitioning");
  await page.getByRole("button", { name: "Start scenario run" }).click();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();

  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await page.getByRole("button", { name: /^Consumer$/ }).click();
  await expect(page.locator("span", { hasText: "idle - no assignment" })).toBeVisible();

  await page.getByRole("button", { name: "Produce one" }).click();
  await expect(page.getByText("Selected message")).toBeVisible();
  await expect(page.getByText("Partition", { exact: true })).toBeVisible();
  await expect(page.getByText("Offset", { exact: true })).toBeVisible();

  await expect.poll(async () => await page.getByText("committed").count()).toBeGreaterThan(0);
  await page.reload();
  await expect(page.getByRole("button", { name: "Produce one" })).toBeVisible();
  await expect(page.locator("span", { hasText: "idle - no assignment" })).toBeVisible();

  await page.getByRole("button", { name: "Stop consumer-1" }).click();
  await expect(page.getByText("consumer.partitions_assigned").first()).toBeVisible();

  await page.getByRole("button", { name: "Reset run" }).click();
  await expect(page.getByRole("button", { name: "Start scenario run" })).toBeVisible();
});
