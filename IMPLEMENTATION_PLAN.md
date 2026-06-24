# Kafka Visual Playground Implementation Plan

## Architectural Decisions

- Build a TypeScript npm workspace with `apps/web` plus three shared packages: `contracts`, `scenario-engine`, and `kafka-runtime`.
- Use Next.js App Router for both UI and REST/SSE APIs. Route Handlers remain thin and delegate to a process-level server-only runtime.
- Keep Kafka clients, credentials, timers, consumers, producers, and SSE subscribers inside the centralized runtime and adapter layer only.
- Support `KAFKA_MODE=demo` as the default local mode so contributors can run the whole scenario without external infrastructure.
- Treat Aiven mode as authoritative: produced partitions/offsets, assignments, commits, and cleanup results come from Kafka client callbacks/results, never frontend prediction.
- Use a bounded event log and a pure browser reducer so refresh and SSE reconnects do not duplicate visual events.
- Run as one persistent Node.js process for the MVP.

## Implementation Sequence

1. Scaffold npm workspaces, TypeScript config, lint/test tooling, `.nvmrc`, `.env.example`, and `.gitignore`.
2. Define shared Zod contracts for API requests/responses, snapshots, messages, events, and problem-details errors.
3. Implement scenario definitions, key strategies, resource-name generation, run limits, and lifecycle helpers.
4. Implement the Kafka runtime adapter interface, deterministic demo adapter, and Aiven adapter boundary with sanitized connection testing.
5. Implement `PlaygroundRuntime` singleton with one active run, event sequencing, bounded history, production timers, consumer assignment simulation/updates, manual commit lifecycle events, cleanup, and SSE subscriptions.
6. Add versioned Next.js Route Handlers under `/api/v1` with Node runtime and force-dynamic flags.
7. Build a polished developer-tool UI: scenario catalog, app shell, controls, React Flow topology, timeline, inspector, and explanatory panel.
8. Add cleanup CLI and documentation.
9. Add unit/integration tests for contracts, reducer, runtime behavior, settings, cleanup, SSE replay, and demo scenario flows.
10. Add Playwright coverage for the primary demo scenario path.
11. Run install, lint, typecheck, tests, Playwright, build, and fix failures.

## MVP Boundaries

- The primary scenario is implemented end to end.
- Future scenarios appear as disabled catalog cards only.
- Demo mode is deterministic and complete enough for automated verification.
- Aiven mode supports SASL/TLS configuration, connection testing, resource naming, topic creation/deletion, real producer delivery reports, and an adapter structure for real consumer callbacks.
- Hard process crashes for consumers are intentionally out of scope; graceful shutdown is implemented and the code leaves room for later worker-thread or child-process crash simulations.
