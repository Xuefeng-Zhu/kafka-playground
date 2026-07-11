import { mkdir } from "node:fs/promises";
import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  clearWorkspaceViewPreference,
  expectMobileTargets,
  expectNoSeriousOrCriticalAxeViolations,
  installConsoleFailureChecks,
  resetActiveRun,
  selectWorkspaceView,
} from "./playground-test-helpers";
import {
  scenarioTeachingManifest,
  type RenderedEvidenceExpectation,
  type ScenarioTeachingCase,
} from "./scenario-teaching-manifest";

installConsoleFailureChecks();

const expectedScenarioIds = [
  "partitioning",
  "fan-out-load-balancing",
  "at-least-once-duplicates",
  "retry-dead-letter-queues",
  "schema-evolution-karapace",
  "transactional-producers",
  "event-replay-sourcing",
  "consumer-lag-backpressure",
  "hot-partitions-key-skew",
  "log-compaction-tombstones",
  "retention-data-loss",
  "cooperative-rebalancing",
  "streams-joins-windows",
  "outbox-cdc",
  "acl-least-privilege",
] as const satisfies readonly ScenarioTeachingCase["scenarioId"][];

test("teaching manifest covers every scenario exactly once", () => {
  const actualIds = scenarioTeachingManifest.map(
    ({ scenarioId }) => scenarioId,
  );

  expect(new Set(actualIds).size).toBe(actualIds.length);
  expect([...actualIds].sort()).toEqual([...expectedScenarioIds].sort());
});

for (const scenario of scenarioTeachingManifest) {
  test(`${scenario.scenarioId} explains its authoritative change and contrast`, async ({
    page,
  }, testInfo) => {
    await clearWorkspaceViewPreference(page);
    await resetActiveRun(page);
    await page.goto(`/scenarios/${scenario.scenarioId}`);
    await page.getByRole("button", { name: "Start scenario run" }).click();

    const surface = page.getByTestId("scenario-learning-surface");
    const evidence = page.getByTestId("scenario-evidence-lens");
    await expect(surface).toBeVisible();
    await expect(surface).toHaveAttribute(
      "data-scenario-id",
      scenario.scenarioId,
    );
    await expect(
      page.getByRole("tab", { name: "Guided", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("teaching-experience-region")).toBeVisible();
    await expect(page.getByTestId("explore-workspace-region")).toHaveCount(0);
    await expect(page.getByTestId("timeline-region")).toHaveCount(0);
    await expect(page.getByTestId("lower-panel-tabs")).toHaveCount(0);
    await expect(page.getByTestId("topology-flow")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Insights" })).toHaveCount(0);
    await expect(evidence).toBeVisible();
    await expect(page.getByText("What changed", { exact: true })).toBeVisible();
    await expect(page.getByText("Why", { exact: true })).toBeVisible();
    await expect(
      page.getByText("What happens next", { exact: true }),
    ).toBeVisible();

    const initial = await activeScenarioState(page);
    expect(initial).toMatchObject({
      scenarioId: scenario.scenarioId,
      revision: scenario.initial.revision,
      experiment: { status: scenario.initial.status },
    });

    const primaryExperiment = page.getByTestId(
      `experiment-${scenario.primaryExperimentId}`,
    );
    const contrastExperiment = page.getByTestId(
      `experiment-${scenario.contrastExperimentId}`,
    );
    await expect(primaryExperiment).toBeEnabled();
    await expect(primaryExperiment).toContainText("Run");
    await expect(contrastExperiment).toBeDisabled();

    await primaryExperiment.click();
    const pivotal = await waitForCompletedExperiment(
      page,
      scenario.primaryExperimentId,
    );
    assertPivotalInvariant(scenario.scenarioId, pivotal);
    await expectRenderedEvidence(evidence, scenario.renderedEvidence.pivotal);
    await expect(surface).toHaveAttribute(
      "data-experiment-id",
      scenario.primaryExperimentId,
    );
    await expect(
      page.locator('[data-provenance="simulated"]').first(),
    ).toBeVisible();
    await expect(
      page
        .getByTestId("experiment-transition-trail")
        .getByRole("listitem")
        .first(),
    ).toBeVisible();
    await expect(contrastExperiment).toBeEnabled();

    await mkdir("docs/screenshots/evidence", { recursive: true });
    await evidence.screenshot({
      path: `docs/screenshots/evidence/${testInfo.project.name}-${scenario.scenarioId}-guided.png`,
      animations: "disabled",
    });

    const pivotalRevision = numberField(pivotal, "revision");
    await page.reload();
    await expect(surface).toHaveAttribute(
      "data-experiment-id",
      scenario.primaryExperimentId,
    );
    await expect
      .poll(async () =>
        numberField(await activeScenarioState(page), "revision"),
      )
      .toBe(pivotalRevision);

    await expect(contrastExperiment).toBeEnabled();
    await contrastExperiment.click();
    const contrast = await waitForCompletedExperiment(
      page,
      scenario.contrastExperimentId,
    );
    expect(numberField(contrast, "revision")).toBeGreaterThan(pivotalRevision);
    assertContrastInvariant(scenario.scenarioId, contrast);
    await expectRenderedEvidence(evidence, scenario.renderedEvidence.contrast);

    const focusControl = evidence
      .locator('[data-testid^="evidence-row-"] button[aria-pressed="false"]')
      .first();
    await expect(focusControl).toBeVisible();
    await focusControl.click();
    await expect
      .poll(() => evidence.locator('button[aria-pressed="true"]').count())
      .toBeGreaterThan(0);
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /^Close .* inspector$/ }).click();

    const transitionFocus = page
      .getByTestId("experiment-transition-trail")
      .getByRole("button")
      .first();
    await transitionFocus.click();
    await expect(transitionFocus).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: /^Close .* inspector$/ }).click();

    await expectNoSeriousOrCriticalAxeViolations(page);
    await expectStableLayout(page);

    if (scenario.mobileRequired) {
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByTestId("causal-graph-list")).toBeVisible();
      await expect(page.getByTestId("topology-flow")).toHaveCount(0);
      await expectMobileTargets(page);
      await expectStableLayout(page);
      await page.setViewportSize({ width: 1440, height: 900 });
    }

    await selectWorkspaceView(page, "Explore");
    await expect(page.getByTestId("explore-workspace-region")).toBeVisible();
    await expect(page.getByTestId("explore-topology")).toBeVisible();
    await expect(page.getByTestId("topology-flow")).toBeVisible();
    await expect(
      page.getByTestId(`topology-node-scenario-${scenario.extensionNodeId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`topology-edge-scenario-${scenario.causalEdgeId}`),
    ).toHaveCount(1);
    await expect(page.getByTestId("topology-node-scenario-visual")).toHaveCount(
      0,
    );
    if (scenario.scenarioId === "partitioning") {
      await expectKeyboardTimelineResize(page);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("semantic-topology-list")).toBeVisible();
    await expect(page.getByTestId("topology-flow")).toHaveCount(0);
    await expect(
      page.getByTestId(`semantic-scenario-node-${scenario.extensionNodeId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`semantic-scenario-edge-${scenario.causalEdgeId}`),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Simulated runtime topology" }),
    ).toBeVisible();
    await expect(page.getByTestId("timeline-region")).toBeVisible();
    await page.getByRole("tab", { name: "Controls" }).click();
    await expectMobileTargets(page, "explore-workspace-region");
    await expectStableLayout(page);
    await expectNoSeriousOrCriticalAxeViolations(page);

    if (scenario.mobileRequired) {
      await page.getByTestId("explore-topology").screenshot({
        path: `docs/screenshots/evidence/${testInfo.project.name}-${scenario.scenarioId}-explore-mobile.png`,
        animations: "disabled",
      });
    }
  });
}

async function activeScenarioState(
  page: Page,
): Promise<Record<string, unknown>> {
  const response = await page.request.get("/api/v1/runs");
  expect(response.ok()).toBe(true);
  const payload = (await response.json()) as {
    run: { scenarioState?: Record<string, unknown> | null } | null;
  };
  expect(payload.run?.scenarioState).toBeTruthy();
  return payload.run?.scenarioState ?? {};
}

async function waitForCompletedExperiment(page: Page, experimentId: string) {
  await expect
    .poll(async () => {
      const state = await activeScenarioState(page);
      const experiment = objectField(state, "experiment");
      return {
        experimentId: experiment.experimentId,
        status: experiment.status,
      };
    })
    .toEqual({ experimentId, status: "completed" });
  return activeScenarioState(page);
}

function assertPivotalInvariant(
  scenarioId: ScenarioTeachingCase["scenarioId"],
  state: Record<string, unknown>,
) {
  switch (scenarioId) {
    case "partitioning":
      expect(arrayField(state, "routingTraces")).toHaveLength(3);
      expect(arrayField(state, "routingTraces")).toEqual([
        expect.objectContaining({ key: "A" }),
        expect.objectContaining({ key: "B" }),
        expect.objectContaining({ key: "A" }),
      ]);
      expect(arrayField(state, "consumers")).toHaveLength(1);
      expect(arrayField(state, "partitionPositions")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            processedOffset: expect.any(String),
            committedOffset: expect.any(String),
          }),
        ]),
      );
      break;
    case "fan-out-load-balancing":
      expect(arrayField(state, "epochs")).toHaveLength(4);
      expect(arrayField(state, "epochs").at(-1)).toMatchObject({
        idleConsumerIds: ["consumer-4"],
      });
      break;
    case "at-least-once-duplicates":
      expect(arrayField(state, "deliveries")).toHaveLength(2);
      expect(arrayField(state, "deliveries")[0]).toMatchObject({
        partition: 0,
        offset: "7",
      });
      expect(arrayField(state, "deliveries")[1]).toMatchObject({
        partition: 0,
        offset: "7",
      });
      expect(arrayField(state, "sideEffects")[0]).toMatchObject({
        naiveCount: 2,
        idempotentCount: 1,
      });
      break;
    case "retry-dead-letter-queues":
      expect(arrayField(state, "records")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "transient",
            status: "succeeded",
            attempt: 2,
            route: expect.arrayContaining([
              expect.objectContaining({ stage: "backoff" }),
              expect.objectContaining({ stage: "succeeded" }),
            ]),
          }),
        ]),
      );
      break;
    case "schema-evolution-karapace":
      expect(numberField(state, "activeVersion")).toBe(2);
      expect(numberField(state, "topicRecordCount")).toBe(1);
      expect(arrayField(state, "attempts")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ version: 2, reachedTopic: true }),
        ]),
      );
      break;
    case "transactional-producers":
      expect(arrayField(state, "transactions")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            status: "committed",
            visibleRecordIds: expect.arrayContaining([
              "txn-1-record-1",
              "txn-1-record-2",
            ]),
          }),
        ]),
      );
      break;
    case "event-replay-sourcing":
      expect(numberField(state, "producedCount")).toBe(3);
      expect(arrayField(state, "log")).toHaveLength(3);
      expect(objectField(state, "projection")).toMatchObject({ "cart-1": 1 });
      expect(state.cursor).toBe("2");
      break;
    case "consumer-lag-backpressure":
      expect(arrayField(state, "samples").at(-1)).toMatchObject({
        trend: "rising",
      });
      break;
    case "hot-partitions-key-skew":
      expect(arrayField(state, "phases")).toEqual([
        expect.objectContaining({ kind: "hot", total: 8, skewRatio: 8 }),
      ]);
      break;
    case "log-compaction-tombstones":
      expect(arrayField(state, "rawLog")).toHaveLength(4);
      expect(arrayField(state, "rawLog")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            offset: "0",
            removedAtStage: "compaction",
          }),
          expect.objectContaining({
            offset: "1",
            removedAtStage: "compaction",
          }),
          expect.objectContaining({ offset: "2", removedAtStage: null }),
          expect.objectContaining({ offset: "3", tombstone: true }),
        ]),
      );
      expect(arrayField(state, "cleanerPasses")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "compaction" }),
        ]),
      );
      break;
    case "retention-data-loss":
      expect(objectField(state, "error")).toMatchObject({
        code: "offset_out_of_range",
      });
      expect(state.logStartOffset).toBe("3");
      expect(arrayField(state, "records")).toEqual([
        expect.objectContaining({ offset: "0", expired: true }),
        expect.objectContaining({ offset: "1", expired: true }),
        expect.objectContaining({ offset: "2", expired: true }),
        expect.objectContaining({ offset: "3", expired: false }),
        expect.objectContaining({ offset: "4", expired: false }),
      ]);
      break;
    case "cooperative-rebalancing":
      expect(arrayField(state, "comparisons")).toHaveLength(2);
      break;
    case "streams-joins-windows":
      expect(arrayField(state, "joins")).toHaveLength(1);
      expect(arrayField(state, "windows")[0]).toMatchObject({ closed: false });
      break;
    case "outbox-cdc":
      expect(arrayField(state, "dbTransactions")[0]).toMatchObject({
        committed: true,
      });
      expect(arrayField(state, "publishes")).toHaveLength(1);
      expect(arrayField(state, "publishes")[0]).toMatchObject({
        acknowledged: true,
        deduplicated: false,
      });
      break;
    case "acl-least-privilege":
      expect(arrayField(state, "attempts")).toEqual([
        expect.objectContaining({
          decision: "denied",
          terminatedBeforeKafka: true,
        }),
      ]);
      break;
    default:
      assertNever(scenarioId);
  }
}

function assertContrastInvariant(
  scenarioId: ScenarioTeachingCase["scenarioId"],
  state: Record<string, unknown>,
) {
  switch (scenarioId) {
    case "partitioning":
      expect(arrayField(state, "consumers")).toHaveLength(3);
      expect(arrayField(state, "consumers")).toEqual(
        expect.arrayContaining([expect.objectContaining({ status: "idle" })]),
      );
      break;
    case "fan-out-load-balancing":
      expect(arrayField(state, "epochs")).toHaveLength(4);
      expect(arrayField(state, "epochs").at(-1)).toMatchObject({
        epoch: 4,
        idleConsumerIds: ["consumer-4"],
      });
      expect(objectField(state, "experiment")).toMatchObject({
        experimentId: "produce-unkeyed-burst",
        stepIndex: 3,
        totalSteps: 3,
      });
      break;
    case "at-least-once-duplicates":
      expect(arrayField(state, "deliveries")).toHaveLength(2);
      expect(arrayField(state, "deliveries")).toEqual([
        expect.objectContaining({ partition: 0, offset: "7" }),
        expect.objectContaining({ partition: 0, offset: "7" }),
      ]);
      expect(arrayField(state, "sideEffects")[0]).toMatchObject({
        naiveCount: 2,
        idempotentCount: 1,
      });
      expect(objectField(state, "experiment")).toMatchObject({
        experimentId: "duplicate-risk-records",
        stepIndex: 1,
        totalSteps: 1,
      });
      break;
    case "retry-dead-letter-queues":
      expect(arrayField(state, "records")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: "poison",
            status: "dlq",
            attempt: 3,
            route: expect.arrayContaining([
              expect.objectContaining({ stage: "backoff" }),
              expect.objectContaining({ stage: "dlq" }),
            ]),
          }),
        ]),
      );
      break;
    case "schema-evolution-karapace":
      expect(arrayField(state, "attempts")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ version: 3, reachedTopic: false }),
        ]),
      );
      expect(numberField(state, "topicRecordCount")).toBe(1);
      break;
    case "transactional-producers":
      expect(arrayField(state, "transactions")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: "aborted", visibleRecordIds: [] }),
        ]),
      );
      break;
    case "event-replay-sourcing":
      expect(numberField(state, "producedCount")).toBe(3);
      expect(arrayField(state, "log")).toHaveLength(3);
      expect(objectField(state, "projection")).toMatchObject({ "cart-1": 1 });
      break;
    case "consumer-lag-backpressure":
      expect(arrayField(state, "samples")).toEqual(
        expect.arrayContaining([expect.objectContaining({ trend: "falling" })]),
      );
      break;
    case "hot-partitions-key-skew":
      expect(arrayField(state, "phases")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ kind: "balanced", total: 8, skewRatio: 1 }),
        ]),
      );
      break;
    case "log-compaction-tombstones":
      expect(arrayField(state, "cleanerPasses")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ stage: "tombstone_cleanup" }),
        ]),
      );
      break;
    case "retention-data-loss":
      expect(state.error).toBeNull();
      expect(objectField(state, "lastOffsetOutOfRange")).toMatchObject({
        code: "offset_out_of_range",
        requestedOffset: "1",
        recoveryOptions: ["earliest", "latest", "restore"],
      });
      expect(state.committedOffset).toBe(state.logStartOffset);
      break;
    case "cooperative-rebalancing":
      expect(arrayField(state, "comparisons")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            strategy: "eager",
            movedPartitions: [
              expect.objectContaining({ partition: 1 }),
              expect.objectContaining({ partition: 2 }),
            ],
          }),
          expect.objectContaining({
            strategy: "cooperative_sticky",
            keptPartitions: [0],
            revokedPartitions: [1, 2],
            pausedPartitions: [1, 2],
          }),
        ]),
      );
      break;
    case "streams-joins-windows":
      expect(arrayField(state, "lateRecords")).toContain("payment-99");
      expect(arrayField(state, "windows")[0]).toMatchObject({ closed: true });
      break;
    case "outbox-cdc":
      expect(arrayField(state, "publishes")).toHaveLength(1);
      expect(arrayField(state, "dedupeLedger")[0]).toMatchObject({
        suppressedAttempts: 1,
      });
      break;
    case "acl-least-privilege":
      expect(arrayField(state, "attempts")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ decision: "allowed" }),
        ]),
      );
      break;
    default:
      assertNever(scenarioId);
  }
}

async function expectRenderedEvidence(
  evidence: Locator,
  expectation: RenderedEvidenceExpectation,
) {
  const label = evidence
    .locator("dt")
    .getByText(expectation.label, { exact: true });
  const exactValue = label
    .locator("..")
    .getByTestId("evidence-value")
    .filter({
      hasText: new RegExp(`^${escapeRegExp(String(expectation.value))}$`),
    });
  await expect(exactValue.first()).toBeVisible();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function expectKeyboardTimelineResize(page: Page) {
  const timelineRegion = page.getByTestId("timeline-region");
  const resizeHandle = page.getByTestId("timeline-resize-handle");
  await expect(resizeHandle).toBeVisible();
  const initialHeight = Number(
    await resizeHandle.getAttribute("aria-valuenow"),
  );
  expect(Number.isFinite(initialHeight)).toBe(true);

  await resizeHandle.focus();
  await expect(resizeHandle).toBeFocused();
  await resizeHandle.press("ArrowUp");
  const expandedHeight = initialHeight + 24;
  await expect(resizeHandle).toHaveAttribute(
    "aria-valuenow",
    String(expandedHeight),
  );
  await expect
    .poll(() =>
      timelineRegion.evaluate(
        (region) =>
          (region.parentElement as HTMLElement | null)?.style.getPropertyValue(
            "--timeline-height",
          ) ?? "",
      ),
    )
    .toBe(`${expandedHeight}px`);

  await resizeHandle.press("PageDown");
  await expect(resizeHandle).toHaveAttribute(
    "aria-valuenow",
    String(initialHeight),
  );
}

function assertNever(value: never): never {
  throw new Error(`Unhandled teaching scenario: ${String(value)}`);
}

function objectField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  expect(field).toBeTruthy();
  expect(typeof field).toBe("object");
  expect(Array.isArray(field)).toBe(false);
  return field as Record<string, unknown>;
}

function arrayField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  expect(Array.isArray(field)).toBe(true);
  return field as unknown[];
}

function numberField(value: Record<string, unknown>, key: string) {
  const field = value[key];
  expect(typeof field).toBe("number");
  return field as number;
}

async function expectStableLayout(page: Page) {
  const widths = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  expect(widths.document).toBeLessThanOrEqual(widths.viewport + 2);
}
