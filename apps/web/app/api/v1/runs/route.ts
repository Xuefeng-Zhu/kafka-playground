import { createRunRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safe } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return safe(request, async () =>
    json({ run: playgroundRuntime.activeSnapshot() }),
  );
}

export async function POST(request: Request) {
  return safe(request, async () => {
    const body = await parseJson(request, createRunRequestSchema);
    return json(await playgroundRuntime.createRun(body.scenarioId), {
      status: 201,
    });
  });
}
