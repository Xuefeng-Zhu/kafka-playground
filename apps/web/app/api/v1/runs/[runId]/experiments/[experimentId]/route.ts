import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, safeWithSession } from "../../../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = {
  params: Promise<{ runId: string; experimentId: string }>;
};

export async function POST(request: Request, context: Context) {
  return safeWithSession(request, async ({ session }) => {
    const { runId, experimentId } = await context.params;
    return json(
      await playgroundRuntime.runExperiment(runId, experimentId, session.id),
    );
  });
}
