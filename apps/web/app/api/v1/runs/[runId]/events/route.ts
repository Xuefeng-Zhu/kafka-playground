import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { problem, requestId } from "@/lib/server/api-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  const id = requestId(request);
  try {
    const { runId } = await context.params;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (payload: unknown) => {
          if (typeof payload === "object" && payload && "sequence" in payload) {
            const event = payload as { sequence: number; type: string };
            controller.enqueue(
              encoder.encode(
                `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`,
              ),
            );
          } else {
            controller.enqueue(
              encoder.encode(
                `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`,
              ),
            );
          }
        };
        const lastEventId =
          Number(request.headers.get("last-event-id") ?? "0") || null;
        const unsubscribe = playgroundRuntime.subscribe(runId, lastEventId, {
          id: crypto.randomUUID(),
          enqueue,
        });
        const heartbeat = setInterval(() => {
          controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
        }, 15_000);
        request.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          controller.close();
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        "x-request-id": id,
      },
    });
  } catch (error) {
    return problem(error, id);
  }
}
