import type { TeachingScenarioTestCase } from "./test-manifest/helpers";
import { deliveryGateTestCases } from "./test-manifest/delivery-gates";
import { historyCapacityTestCases } from "./test-manifest/history-capacity";
import { pipelineAccessTestCases } from "./test-manifest/pipelines-access";
import { routingAssignmentTestCases } from "./test-manifest/routing-assignment";

export type { TeachingScenarioTestCase } from "./test-manifest/helpers";

export const teachingScenarioTestManifest = [
  ...routingAssignmentTestCases,
  ...deliveryGateTestCases,
  ...historyCapacityTestCases,
  ...pipelineAccessTestCases,
] as const satisfies readonly TeachingScenarioTestCase[];
