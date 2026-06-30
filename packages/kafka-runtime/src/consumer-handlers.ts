import type {
  CreateRunInput,
  KafkaRuntimeDiagnostics,
  PlaygroundConsumerCallbacks,
} from "./index";

type SanitizedKafkaError = {
  code: string;
  message: string;
};

type ErrorSanitizer = (error: unknown) => SanitizedKafkaError;

export type ConsumerLifecycleSource = {
  events: {
    GROUP_JOIN: string;
    REBALANCING: string;
    CRASH: string;
  };
  on(
    eventName: string,
    listener: (event: {
      payload?: {
        memberAssignment?: Record<string, number[]>;
        error?: unknown;
      };
    }) => void,
  ): unknown;
};

export type ConsumerRunSource = {
  run(input: {
    autoCommit: false;
    eachMessage(input: {
      topic: string;
      partition: number;
      message: {
        offset: string | number;
        key: Buffer | string | null | undefined;
        value: Buffer | string | null | undefined;
        headers?:
          | Record<string, Buffer | string | Array<Buffer | string> | undefined>
          | undefined;
        timestamp?: string | number | null;
      };
    }): Promise<void>;
  }): Promise<unknown>;
};

export function bindConsumerLifecycleHandlers(
  consumer: ConsumerLifecycleSource,
  run: CreateRunInput,
  callbacks: PlaygroundConsumerCallbacks,
  diagnostics: KafkaRuntimeDiagnostics,
  sanitizeError: ErrorSanitizer,
) {
  consumer.on(consumer.events.GROUP_JOIN, (event) => {
    notifyConsumerCallback(
      "consumer.assigned",
      diagnostics,
      () => callbacks.onAssigned(assignmentsFromEvent(event, run.topicName)),
      sanitizeError,
    );
  });
  consumer.on(consumer.events.REBALANCING, () => {
    notifyConsumerCallback(
      "consumer.revoked",
      diagnostics,
      () => callbacks.onRevoked([]),
      sanitizeError,
    );
  });
  consumer.on(consumer.events.CRASH, (event) => {
    notifyConsumerCallback(
      "consumer.crash",
      diagnostics,
      () =>
        callbacks.onError({
          code: "CONSUMER_CRASH",
          message: sanitizeError(event.payload?.error).message,
        }),
      sanitizeError,
    );
  });
}

export function startConsumerRun(
  consumer: ConsumerRunSource,
  callbacks: PlaygroundConsumerCallbacks,
  diagnostics: KafkaRuntimeDiagnostics,
  sanitizeError: ErrorSanitizer,
) {
  void consumer
    .run({
      autoCommit: false,
      eachMessage: async ({ topic, partition, message }) => {
        await callbacks.onMessage({
          topic,
          partition,
          offset: String(message.offset),
          key: bufferToString(message.key),
          value: parseJsonValue(message.value),
          headers: normalizeHeaders(message.headers),
          timestamp: message.timestamp ? String(message.timestamp) : null,
        });
      },
    })
    .catch((error: unknown) => {
      notifyConsumerCallback(
        "consumer.run",
        diagnostics,
        () => callbacks.onError(sanitizeError(error)),
        sanitizeError,
      );
    });
}

function assignmentsFromEvent(
  event: {
    payload?: { memberAssignment?: Record<string, number[]> };
  },
  topicName: string,
) {
  return (event.payload?.memberAssignment?.[topicName] ?? []).map(
    (partition) => ({
      topic: topicName,
      partition,
    }),
  );
}

function notifyConsumerCallback(
  operation: string,
  diagnostics: KafkaRuntimeDiagnostics,
  callback: () => void | Promise<void>,
  sanitizeError: ErrorSanitizer,
) {
  void Promise.resolve()
    .then(callback)
    .catch((error: unknown) => {
      diagnostics.onConsumerCallbackError?.({
        operation,
        error: sanitizeError(error),
      });
    });
}

function normalizeHeaders(
  headers:
    | Record<string, Buffer | string | Array<Buffer | string> | undefined>
    | undefined,
) {
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    const first = Array.isArray(value) ? value[0] : value;
    normalized[key] = bufferToString(first) ?? "";
  }
  return normalized;
}

function bufferToString(value: Buffer | string | null | undefined) {
  if (value === null || value === undefined) return null;
  return Buffer.isBuffer(value) ? value.toString("utf8") : String(value);
}

function parseJsonValue(
  value: Buffer | string | null | undefined,
): Record<string, unknown> | null {
  const text = bufferToString(value);
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}
