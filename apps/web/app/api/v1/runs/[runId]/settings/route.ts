import { settingsRequestSchema } from "@kplay/contracts";
import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { json, parseJson, safeWithSession } from "../../../_helpers";
import { describeSettingsIssue } from "../../../_validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function PATCH(request: Request, context: Context) {
  return safeWithSession(request, async ({ session }) => {
    const { runId } = await context.params;
    const body = await parseJson(request, settingsRequestSchema, {
      code: "INVALID_SETTINGS",
      describeIssue: describeSettingsIssue,
    });
    return json(
      await playgroundRuntime.updateSettings(runId, body, session.id),
    );
  });
}
