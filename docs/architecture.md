# Architecture

Kafka Visual Playground uses Next.js App Router for the UI and versioned REST/SSE APIs. A separate API server is avoided so the application can ship as one persistent Node.js process.

Kafka clients are not created in React components, Server Components, layouts, middleware, or individual Route Handlers. Route Handlers parse and validate input, then delegate to `PlaygroundRuntime`.

`PlaygroundRuntime` owns:

- One active scenario run.
- Producer timers.
- Consumer state and assignments.
- Event sequencing and bounded history.
- SSE subscribers.
- Cleanup and shutdown.

The runtime singleton is stored on `globalThis` in development to avoid duplicate instances during hot reload. This is not a distributed lock, so production must run one replica.

## Adapter Boundary

`KafkaRuntimeAdapter` has two implementations:

- Demo adapter: deterministic in-memory two-partition behavior.
- Aiven adapter: SASL/TLS configuration, admin connection test, topic creation/deletion, producer delivery reports, consumer rebalance callbacks, message receipt, and manual commits.

Both modes return the same contracts. The frontend never switches contracts based on runtime mode.

## SSE Flow

The SSE endpoint sends an initial snapshot, then live events with the event sequence as the SSE ID. `Last-Event-ID` replays missed bounded-history events. Heartbeats keep the connection alive, and abort cleanup removes the subscriber.

## UI Authority

The server is authoritative for run lifecycle, resources, assignments, delivery reports, processing state, and commits. The browser is authoritative only for selection, filters, panel state, theme, and transient animation.

The UI does not invent Kafka partitions, offsets, assignments, rebalances, or commits. Demo mode is visibly labeled as simulated behavior.
