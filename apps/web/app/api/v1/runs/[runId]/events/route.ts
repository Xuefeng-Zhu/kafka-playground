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
    let cleanupStream: () => void = () => undefined;
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let unsubscribe: (() => void) | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          unsubscribe?.();
          unsubscribe = null;
        };
        cleanupStream = cleanup;
        const safeEnqueue = (chunk: string) => {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(chunk));
          } catch {
            cleanup();
          }
        };
        const enqueue = (payload: unknown) => {
          if (typeof payload === "object" && payload && "sequence" in payload) {
            const event = payload as { sequence: number; type: string };
            safeEnqueue(
              `id: ${event.sequence}\nevent: ${event.type}\ndata: ${JSON.stringify(payload)}\n\n`,
            );
          } else {
            safeEnqueue(
              `event: snapshot\ndata: ${JSON.stringify(payload)}\n\n`,
            );
          }
        };
        const lastEventId =
          Number(request.headers.get("last-event-id") ?? "0") || null;
        unsubscribe = playgroundRuntime.subscribe(runId, lastEventId, {
          id: crypto.randomUUID(),
          enqueue,
        });
        if (closed) {
          unsubscribe();
          unsubscribe = null;
          return;
        }
        heartbeat = setInterval(() => {
          safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
        }, 15_000);
        request.signal.addEventListener("abort", () => {
          cleanup();
          try {
            controller.close();
          } catch {
            // The client may already have closed the stream.
          }
        });
      },
      cancel() {
        cleanupStream();
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
