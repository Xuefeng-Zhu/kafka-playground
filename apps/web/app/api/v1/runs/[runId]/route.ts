import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, safe } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  return safe(request, async () => {
    const { runId } = await context.params;
    return json(playgroundRuntime.snapshot(runId));
  });
}

export async function DELETE(request: Request, context: Context) {
  return safe(request, async () => {
    const { runId } = await context.params;
    return json(await playgroundRuntime.deleteRun(runId));
  });
}
