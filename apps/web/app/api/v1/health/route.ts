import { json, safe } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return safe(request, async () =>
    json({ status: "ok", checkedAt: new Date().toISOString() }),
  );
}
