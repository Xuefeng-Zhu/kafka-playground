import { produceMessageRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safe } from "../../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function POST(request: Request, context: Context) {
  return safe(request, async () => {
    const { runId } = await context.params;
    const body = await parseJson(request, produceMessageRequestSchema, {
      code: "INVALID_MESSAGE_REQUEST",
    });
    return json(await playgroundRuntime.produceOne(runId, body.keyStrategy));
  });
}
