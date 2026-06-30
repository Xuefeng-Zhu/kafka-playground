import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, safe } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return safe(request, async () =>
    json({ scenarios: playgroundRuntime.scenarios() }),
  );
}
