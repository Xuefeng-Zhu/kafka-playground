import "server-only";
import type { PlaygroundMessage } from "@kplay/contracts";
import { logger } from "./logger";
import type { InternalRun } from "./playground-runtime-state";

const RETAINED_MESSAGE_LIMIT = 500;

type ProcessMessage = (
  runId: string,
  messageId: string,
  expectedConsumerId: string,
) => Promise<void>;

export function boundMessages(run: InternalRun) {
  if (run.messages.length <= RETAINED_MESSAGE_LIMIT) return;
  const removedMessages = run.messages.splice(
    0,
    run.messages.length - RETAINED_MESSAGE_LIMIT,
  );
  for (const message of removedMessages) {
    const timer = run.processingTimers.get(message.messageId);
    if (timer) clearTimeout(timer);
    run.processingTimers.delete(message.messageId);
  }
}

export function requeueMessagesForConsumer(
  run: InternalRun,
  consumerId: string,
) {
  for (const message of run.messages) {
    if (
      message.assignedConsumerId === consumerId &&
      ["received", "processing", "processed", "commit_requested"].includes(
        message.state,
      )
    ) {
      const timer = run.processingTimers.get(message.messageId);
      if (timer) {
        clearTimeout(timer);
        run.processingTimers.delete(message.messageId);
      }
      message.state = "produced";
      message.assignedConsumerId = null;
      message.updatedAt = new Date().toISOString();
    }
  }
}

export function scheduleMessageProcessing(
  run: InternalRun,
  message: PlaygroundMessage,
  consumerId: string,
  processMessage: ProcessMessage,
) {
  const timer = setTimeout(() => {
    if (run.processingTimers.get(message.messageId) === timer) {
      run.processingTimers.delete(message.messageId);
    }
    void processMessage(run.runId, message.messageId, consumerId).catch(
      (error) => {
        logger.error(
          {
            err: error,
            runId: run.runId,
            messageId: message.messageId,
            consumerId,
          },
          "Scheduled message processing failed",
        );
      },
    );
  }, run.processingLatencyMs);
  const previousTimer = run.processingTimers.get(message.messageId);
  if (previousTimer) clearTimeout(previousTimer);
  run.processingTimers.set(message.messageId, timer);
}
