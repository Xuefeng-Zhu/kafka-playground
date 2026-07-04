import { playgroundRuntime } from "@/lib/server/runtime-singleton";
import { problem, requestId } from "@/lib/server/api-errors";
import { playgroundSession } from "../../../_helpers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ runId: string }> };

export async function GET(request: Request, context: Context) {
  const id = requestId(request);
  const session = playgroundSession(request);
  try {
    const { runId } = await context.params;
    const encoder = new TextEncoder();
    let cleanupStream: () => void = () => undefined;
    const stream = new ReadableStream({
      start(controller) {
        let closed = false;
        let unsubscribe: (() => void) | null = null;
        let heartbeat: ReturnType<typeof setInterval> | null = null;
        const closeController = () => {
          try {
            controller.close();
          } catch {
            // The client may already have closed the stream.
          }
        };
        const handleAbort = () => {
          cleanup();
          closeController();
        };
        const cleanup = () => {
          if (closed) return;
          closed = true;
          if (heartbeat) clearInterval(heartbeat);
          heartbeat = null;
          unsubscribe?.();
          unsubscribe = null;
          request.signal.removeEventListener("abort", handleAbort);
        };
        cleanupStream = cleanup;
        if (request.signal.aborted) {
          cleanup();
          closeController();
          return;
        }
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
        const lastEventId = parseLastEventId(
          request.headers.get("last-event-id"),
        );
        unsubscribe = playgroundRuntime.subscribe(
          runId,
          lastEventId,
          {
            id: crypto.randomUUID(),
            enqueue,
          },
          session.id,
        );
        if (closed) {
          unsubscribe();
          unsubscribe = null;
          return;
        }
        heartbeat = setInterval(() => {
          safeEnqueue(`: heartbeat ${Date.now()}\n\n`);
        }, 15_000);
        request.signal.addEventListener("abort", handleAbort, { once: true });
      },
      cancel() {
        cleanupStream();
      },
    });
    return session.commit(
      new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
          "x-request-id": id,
        },
      }),
    );
  } catch (error) {
    return problem(error, id);
  }
}

function parseLastEventId(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
