import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, safeWithSession } from "../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  return safeWithSession(request, async ({ session }) => {
    const { runId } = await context.params;
    return json(playgroundRuntime.snapshot(runId, session.id));
  });
}

export async function DELETE(request: Request, context: Context) {
  return safeWithSession(request, async ({ session }) => {
    const { runId } = await context.params;
    return json(await playgroundRuntime.deleteRun(runId, session.id));
  });
}
