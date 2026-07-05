import { expect, type ConsoleMessage, type Page, test } from "@playwright/test";

export const idleConsumerLabel = "idle - no partition available";
const consoleFailures = new WeakMap<Page, string[]>();
export const scenarioOverlayCases = [
  { id: "partitioning", overlayId: "key-router", title: "Key router" },
  {
    id: "fan-out-load-balancing",
    overlayId: "group-balancer",
    title: "Group balancer",
  },
  {
    id: "at-least-once-duplicates",
    overlayId: "commit-gate",
    title: "Commit gate",
  },
  {
    id: "retry-dead-letter-queues",
    overlayId: "retry-topic",
    title: "Retry topic",
  },
  {
    id: "schema-evolution-karapace",
    overlayId: "schema-registry",
    title: "Schema registry",
  },
  {
    id: "transactional-producers",
    overlayId: "transaction-coordinator",
    title: "Transaction coordinator",
  },
  {
    id: "event-replay-sourcing",
    overlayId: "projection-store",
    title: "Projection store",
  },
  {
    id: "consumer-lag-backpressure",
    overlayId: "backlog-buffer",
    title: "Backlog buffer",
  },
  {
    id: "hot-partitions-key-skew",
    overlayId: "hot-key-router",
    title: "Hot-key router",
  },
  {
    id: "log-compaction-tombstones",
    overlayId: "compacted-state-store",
    title: "Compacted state",
  },
  {
    id: "retention-data-loss",
    overlayId: "retention-window",
    title: "Retention window",
  },
  {
    id: "cooperative-rebalancing",
    overlayId: "rebalance-coordinator",
    title: "Rebalance coordinator",
  },
  {
    id: "streams-joins-windows",
    overlayId: "window-state-store",
    title: "Window state store",
  },
  { id: "outbox-cdc", overlayId: "cdc-connector", title: "CDC connector" },
  {
    id: "acl-least-privilege",
    overlayId: "authorization-gate",
    title: "Authorization gate",
  },
];

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

export const focusedOverlayActions = [
  {
    id: "retry-dead-letter-queues",
    action: "Trigger retry",
    overlayId: "retry-topic",
    pattern: /Failed\s*[1-9]/,
  },
  {
    id: "schema-evolution-karapace",
    action: "Incompatible schema",
    overlayId: "compatibility-gate",
    pattern: /Rejected\s*[1-9]/,
  },
  {
    id: "acl-least-privilege",
    action: "Denied operation",
    overlayId: "authorization-gate",
    pattern: /Denied\s*[1-9]/,
  },
  {
    id: "hot-partitions-key-skew",
    action: "Hot-key burst",
    overlayId: "hottest-partition",
    pattern: /P\d+\s*[1-9]/,
  },
  {
    id: "consumer-lag-backpressure",
    action: "Build lag",
    overlayId: "backlog-buffer",
    pattern: /Lag\s*[1-9]/,
  },
];

export async function topologyViewportTransform(page: Page) {
  return page
    .locator(".react-flow__viewport")
    .evaluate((element) => getComputedStyle(element).transform);
}

export async function topologyViewportZoom(page: Page) {
  return page.locator(".react-flow__viewport").evaluate((element) => {
    const transform = getComputedStyle(element).transform;
    if (!transform || transform === "none") return 1;
    return new DOMMatrixReadOnly(transform).a;
  });
}

export async function expectTopologyNodeFramed(page: Page, testId: string) {
  await expectReactFlowStylesLoaded(page);
  const node = page.getByTestId(testId);
  await expect(node).toBeVisible();
  await expect
    .poll(async () =>
      node.evaluate((element) => {
        const canvas = document
          .querySelector('[data-testid="topology-canvas"]')
          ?.getBoundingClientRect();
        if (!canvas) return false;
        const box = element.getBoundingClientRect();
        const visibleWidth =
          Math.min(box.right, canvas.right, window.innerWidth) -
          Math.max(box.left, canvas.left, 0);
        const visibleHeight =
          Math.min(box.bottom, canvas.bottom, window.innerHeight) -
          Math.max(box.top, canvas.top, 0);
        return visibleWidth > 12 && visibleHeight > 12;
      }),
    )
    .toBe(true);
}

export async function dragTopologyNode(
  page: Page,
  testId: string,
  delta: { x: number; y: number },
) {
  const box = await page.getByTestId(testId).boundingBox();
  expect(box).not.toBeNull();
  if (!box) throw new Error(`Missing topology node ${testId}`);

  const start = {
    x: box.x + box.width / 2,
    y: box.y + Math.min(28, box.height / 2),
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + delta.x, start.y + delta.y, { steps: 8 });
  await page.mouse.up();
  return box;
}

export async function expectTopologyOverlaysClearCore(
  page: Page,
  overlayIds?: string[],
) {
  await expect
    .poll(async () =>
      page.evaluate(
        ({ overlayIds: evaluatedOverlayIds }) => {
          const coreIds = [
            "topology-node-producer",
            "topology-node-topic",
            "topology-node-consumer-group",
          ];
          const gap = 8;
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
          const canvasBox = readBox("topology-canvas");
          const coreBoxes = coreIds.map((id) => [id, readBox(id)] as const);
          const resolvedOverlayIds =
            evaluatedOverlayIds ??
            Array.from(
              document.querySelectorAll<HTMLElement>(
                '[data-testid^="topology-scenario-node-"]',
              ),
              (element) => element.dataset.testid ?? "",
            ).filter(Boolean);
          const overlayBoxes = resolvedOverlayIds.map(
            (id) => [id, readBox(id)] as const,
          );
          const formatBox = (box: {
            bottom: number;
            left: number;
            right: number;
            top: number;
          }) =>
            [
              Math.round(box.left),
              Math.round(box.top),
              Math.round(box.right),
              Math.round(box.bottom),
            ].join(",");
          const missing = [...coreBoxes, ...overlayBoxes]
            .filter(([, box]) => !box)
            .map(([id]) => `missing ${id}`);
          if (!canvasBox) missing.push("missing topology-canvas");
          if (missing.length > 0) return missing;

          const overlaps: string[] = [];
          for (const [overlayId, overlayBox] of overlayBoxes) {
            if (
              overlayBox &&
              canvasBox &&
              (overlayBox.left < canvasBox.left ||
                overlayBox.right > canvasBox.right ||
                overlayBox.top < canvasBox.top ||
                overlayBox.bottom > canvasBox.bottom)
            ) {
              overlaps.push(
                `${overlayId} leaves topology canvas: overlay=${formatBox(overlayBox)} canvas=${formatBox(canvasBox)}`,
              );
            }
            for (const [coreId, coreBox] of coreBoxes) {
              if (!overlayBox || !coreBox) continue;
              const hasGap =
                overlayBox.right + gap <= coreBox.left ||
                overlayBox.left >= coreBox.right + gap ||
                overlayBox.bottom + gap <= coreBox.top ||
                overlayBox.top >= coreBox.bottom + gap;
              if (!hasGap) {
                overlaps.push(
                  `${overlayId} overlaps ${coreId}: overlay=${formatBox(overlayBox)} core=${formatBox(coreBox)}`,
                );
              }
            }
          }
          return overlaps;
        },
        { overlayIds },
      ),
    )
    .toEqual([]);
}

export async function expectReactFlowStylesLoaded(page: Page) {
  await expect
    .poll(async () =>
      page
        .locator(".react-flow")
        .first()
        .evaluate((element) =>
          getComputedStyle(element)
            .getPropertyValue("--xy-edge-stroke-default")
            .trim(),
        ),
    )
    .toBe("#b1b1b7");
}

export async function pageScrollPosition(page: Page) {
  return page.evaluate(() => ({
    mainTop: document.querySelector("main")?.scrollTop ?? 0,
    x: window.scrollX,
    y: window.scrollY,
  }));
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
