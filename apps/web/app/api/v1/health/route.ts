import { json } from "../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return json({ status: "ok", checkedAt: new Date().toISOString() });
}
