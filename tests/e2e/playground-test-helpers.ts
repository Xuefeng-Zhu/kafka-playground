import { expect, type ConsoleMessage, type Page, test } from "@playwright/test";
import { source as axeSource } from "axe-core";

export const WORKSPACE_VIEW_STORAGE_KEY = "kplay.workspace.view";
const consoleFailures = new WeakMap<Page, string[]>();

export function installConsoleFailureChecks() {
  test.beforeEach(({ page }) => {
    const failures: string[] = [];
    consoleFailures.set(page, failures);
    page.on("console", (message) => {
      if (!["error", "warning"].includes(message.type())) return;
      if (isBenignResourceLoadFailure(message)) return;
      const { url } = message.location();
      const source = url ? ` (${url})` : "";
      failures.push(`[${message.type()}] ${message.text()}${source}`);
    });
    page.on("pageerror", (error) => {
      failures.push(`[pageerror] ${error.message}`);
    });
  });

  test.afterEach(({ page }) => {
    expect(consoleFailures.get(page) ?? []).toEqual([]);
  });
}

export async function expectNoSeriousOrCriticalAxeViolations(
  page: Page,
  selector = "main",
) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async (contextSelector) => {
    type AxeViolation = {
      id: string;
      impact: string | null;
      help: string;
      nodes: Array<{ target: string[] }>;
    };
    const axe = (
      window as typeof window & {
        axe: {
          run(
            context: Element,
            options: { resultTypes: string[] },
          ): Promise<{ violations: AxeViolation[] }>;
        };
      }
    ).axe;
    const context = document.querySelector(contextSelector);
    if (!context) throw new Error(`Missing axe context: ${contextSelector}`);
    const result = await axe.run(context, { resultTypes: ["violations"] });
    return result.violations
      .filter((violation) =>
        ["serious", "critical"].includes(violation.impact ?? ""),
      )
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.flatMap((node) => node.target),
      }));
  }, selector);

  expect(violations).toEqual([]);
}

function isBenignResourceLoadFailure(message: ConsoleMessage) {
  if (!message.text().startsWith("Failed to load resource:")) return false;
  const { url } = message.location();
  if (!url) return false;
  try {
    const { pathname } = new URL(url);
    if (
      message.text().includes("status of 404") &&
      /^\/api\/v1\/runs\/[^/]+$/.test(pathname)
    ) {
      return true;
    }
    return [
      "/favicon.ico",
      "/apple-touch-icon.png",
      "/apple-touch-icon-precomposed.png",
    ].includes(pathname);
  } catch {
    return false;
  }
}

export async function resetActiveRun(page: Page) {
  const response = await page.request.get("/api/v1/runs");
  expect(
    response.ok(),
    `Unable to inspect the active run before the test (${response.status()} ${response.statusText()}).`,
  ).toBe(true);

  const payload = (await response.json()) as { run: { runId?: string } | null };
  if (payload.run?.runId) {
    const resetResponse = await page.request.post(
      `/api/v1/runs/${payload.run.runId}/reset`,
    );
    expect(
      resetResponse.ok(),
      `Unable to reset active run ${payload.run.runId} before the test (${resetResponse.status()} ${resetResponse.statusText()}).`,
    ).toBe(true);
  }
}

/**
 * Clear the persisted Guided/Explore preference on the first document load in
 * this test without clearing it again on reload. This keeps first-use tests
 * deterministic while still allowing the same test to prove persistence.
 */
export async function clearWorkspaceViewPreference(page: Page) {
  await page.addInitScript(
    ({ markerKey, storageKey }) => {
      if (window.sessionStorage.getItem(markerKey) === "true") return;
      window.localStorage.removeItem(storageKey);
      window.sessionStorage.setItem(markerKey, "true");
    },
    {
      markerKey: "kplay.e2e.workspace-view-preference-cleared",
      storageKey: WORKSPACE_VIEW_STORAGE_KEY,
    },
  );
}

export async function selectWorkspaceView(
  page: Page,
  view: "Guided" | "Explore",
) {
  const tab = page.getByRole("tab", { name: view, exact: true });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

export async function expectMobileTargets(
  page: Page,
  regionTestId = "scenario-learning-surface",
) {
  const undersized = await page
    .getByTestId(regionTestId)
    .locator("button:visible")
    .evaluateAll((buttons) =>
      buttons
        .map((button) => {
          const box = button.getBoundingClientRect();
          return {
            label: button.getAttribute("aria-label") ?? button.textContent,
            height: Math.round(box.height),
            width: Math.round(box.width),
          };
        })
        .filter((button) => button.height < 44 || button.width < 44),
    );
  expect(undersized).toEqual([]);
}

export async function activeRunId(page: Page) {
  const response = await page.request.get("/api/v1/runs");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as { run: { runId?: string } | null };
  expect(payload.run?.runId).toBeTruthy();
  return payload.run!.runId!;
}

export async function produceOneViaApi(page: Page, runId: string) {
  const response = await page.request.post(`/api/v1/runs/${runId}/messages`);
  expect(response.ok()).toBe(true);
}
