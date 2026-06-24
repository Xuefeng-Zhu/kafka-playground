import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ scenarios: playgroundRuntime.scenarios() });
}
