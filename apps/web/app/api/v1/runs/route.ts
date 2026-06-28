import { createRunRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safe } from "../_helpers";
import { describeCreateRunIssue } from "../_validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return safe(request, async () =>
    json({ run: playgroundRuntime.activeSnapshot() }),
  );
}

export async function POST(request: Request) {
  return safe(request, async () => {
    const body = await parseJson(request, createRunRequestSchema, {
      code: "INVALID_RUN_REQUEST",
      describeIssue: describeCreateRunIssue,
    });
    return json(
      await playgroundRuntime.createRun(body.scenarioId, {
        mode: body.mode,
        remoteKafkaConfig: body.remoteKafkaConfig,
      }),
      {
        status: 201,
      },
    );
  });
}
