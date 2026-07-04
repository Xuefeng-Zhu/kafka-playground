import { createRunRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safeWithSession } from "../_helpers";
import { describeCreateRunIssue } from "../_validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return safeWithSession(request, async ({ session }) =>
    json({ run: playgroundRuntime.activeSnapshot(session.id) }),
  );
}

export async function POST(request: Request) {
  return safeWithSession(request, async ({ session }) => {
    const body = await parseJson(request, createRunRequestSchema, {
      code: "INVALID_RUN_REQUEST",
      describeIssue: describeCreateRunIssue,
    });
    return json(
      await playgroundRuntime.createRun(
        body.scenarioId,
        {
          mode: body.mode,
          remoteKafkaConfig: body.remoteKafkaConfig,
        },
        session.id,
      ),
      { status: 201 },
    );
  });
}
