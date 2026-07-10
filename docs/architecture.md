# Architecture

Kafka Visual Playground uses Next.js App Router for the UI and versioned REST/SSE APIs. A separate API server is avoided so the application can ship as one persistent Node.js process.

Kafka clients are not created in React components, Server Components, layouts, middleware, or individual Route Handlers. Route Handlers parse and validate input, then delegate to `PlaygroundRuntime`.

`PlaygroundRuntime` owns:

- One active scenario run.
- Producer timers.
- Consumer state and assignments.
- Event sequencing and bounded history.
- SSE subscribers.
- Serialized, deterministic scenario experiments and virtual time.
- Authoritative scenario-specific teaching state and stable experiment entities.
- Cleanup and shutdown.

The runtime singleton is stored on `globalThis` in development to avoid duplicate instances during hot reload. This is not a distributed lock, so production must run one replica.

## Adapter Boundary

`KafkaRuntimeAdapter` has two implementations:

- Demo adapter: deterministic in-memory behavior using each scenario's topic shape and scenario-specific simulated outcomes.
- Aiven adapter: SASL/TLS configuration, admin connection test, topic creation/deletion, producer delivery reports, consumer rebalance callbacks, message receipt, and manual commits.

Both modes return the same contracts. The frontend never switches contracts based on runtime mode.

## SSE Flow

The SSE endpoint sends an initial snapshot, then live events with the event sequence as the SSE ID. `Last-Event-ID` replays missed bounded-history events. Heartbeats keep the connection alive, and abort cleanup removes the subscriber.

## API Surface

The browser talks directly to versioned Next.js Route Handlers under `/api/v1`:

- `GET /api/v1/health`
- `GET /api/v1/scenarios`
- `GET /api/v1/connection`
- `POST /api/v1/connection/test`
- `GET /api/v1/runs`
- `POST /api/v1/runs`
- `GET /api/v1/runs/:runId`
- `DELETE /api/v1/runs/:runId`
- `GET /api/v1/runs/:runId/events`
- `PATCH /api/v1/runs/:runId/settings`
- `POST /api/v1/runs/:runId/messages`
- `POST /api/v1/runs/:runId/experiments/:experimentId`
- `POST /api/v1/runs/:runId/producer/start`
- `POST /api/v1/runs/:runId/producer/pause`
- `POST /api/v1/runs/:runId/producer/stop`
- `POST /api/v1/runs/:runId/consumers`
- `DELETE /api/v1/runs/:runId/consumers/:consumerId`
- `POST /api/v1/runs/:runId/consumers/:consumerId/crash`
- `POST /api/v1/runs/:runId/reset`

Route Handlers validate request bodies with schemas from `packages/contracts`, return sanitized problem details for errors, and delegate run state changes to `PlaygroundRuntime`.

## UI Authority

The server is authoritative for run lifecycle, resources, assignments, delivery reports, processing state, commits, experiment transitions, and `RunSnapshot.scenarioState`. The browser is authoritative only for focus, filters, panel state, theme, and transient animation.

The UI does not invent Kafka partitions, offsets, assignments, rebalances, or commits. Every teaching fact and causal edge carries `observed`, `derived`, or `simulated` provenance. Demo mode is visibly labeled as simulated behavior; unsupported remote-mode experiments return `409 SCENARIO_EXPERIMENT_UNAVAILABLE` instead of pretending a demo outcome came from Kafka.

## Scenario Model

Scenario definitions live in `packages/scenario-engine`. Each scenario declares its title, description, learning objectives, partition count, and run limits. The scenario engine also provides default key strategy, default processing latency, resource naming, message payload shaping, headers, and deterministic scenario outcomes.

The current runtime supports one active run at a time, but the catalog contains multiple routable scenarios. `RunSnapshot.scenarioState` is a scenario-discriminated, server-authoritative union and is nullable for legacy migration and for remote runs without a matching remote experiment implementation. Those remote runs stay on the observed core broker renderer, suppress scenario-derived overlays and guided actions, and show an explicit demo-experiment-unavailable notice. Experiment transitions include stable entity IDs, optional record coordinates, provenance, and ordered step metadata. Experiments are serialized per run so two teaching scripts cannot interleave.

The client maps authoritative state through a `ScenarioExperienceDefinition`: lesson, misconception, projector, experiments, and checkpoint. Projectors return a `ScenarioExperienceFrame` containing a causal graph, one discriminated evidence lens, narrative facts, and inspector details. Lenses use named columns and typed record references rather than anonymous rows.

One `FocusRef` represents a message, event, or entity selection. The graph, evidence lens, timeline, and inspector all consume the same focus. The evidence lens also renders the authoritative transition trail so virtual-time steps remain inspectable after a fast deterministic run. On desktop the compact causal graph sits beside normal-DOM evidence; tablet stacks them; mobile replaces React Flow with a semantic causal list. The migration allowlist keeps unconverted scenarios entirely on the legacy renderer until full cutover and a seven-day soak.

## Demo Versus Aiven Semantics

Demo mode is a teaching simulator. It intentionally produces deterministic outcomes for concepts that would otherwise require a larger Kafka ecosystem, such as retry and dead-letter routing, schema compatibility failures, ACL denials, retention-window effects, and stream-window hints.

Aiven mode is the authoritative live-Kafka path for topic creation/deletion, producer delivery reports, consumer group membership, rebalance callbacks, message receipt, and manual commits. Browser-visible Kafka configuration remains sanitized in both modes.

Consumer crash controls are explicit simulations at the application layer. Demo mode requeues uncommitted work and excludes the crashed member from future assignments; Aiven mode represents the crash as a forced consumer disconnect and then relies on Kafka group behavior for reassignment callbacks.
