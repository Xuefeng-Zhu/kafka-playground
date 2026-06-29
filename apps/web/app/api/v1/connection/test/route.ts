import { connectionTestRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safe } from "../../_helpers";
import { describeConnectionTestIssue } from "../../_validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  return safe(request, async () => {
    const body = await parseJson(request, connectionTestRequestSchema, {
      code: "INVALID_CONNECTION_TEST",
      describeIssue: describeConnectionTestIssue,
    });
    return json(
      await playgroundRuntime.testConnection({
        mode: body.mode,
        remoteKafkaConfig: body.remoteKafkaConfig,
      }),
    );
  });
}
