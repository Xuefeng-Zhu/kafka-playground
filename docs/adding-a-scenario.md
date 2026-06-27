# Adding a Scenario

Add new scenario definitions in `packages/scenario-engine`. A scenario should declare learning objectives, topic shape, limits, and any scenario-specific defaults.

The application shell should not need to be rewritten. Add scenario-specific controls or visualizations as feature components and keep shared runtime events compatible with the contracts package.

Recommended flow:

1. Add the scenario definition.
2. Add any new event types to `packages/contracts`.
3. Extend the scenario engine for default key strategy, processing latency, payload shaping, headers, resource naming, and deterministic processing outcomes.
4. Add demo-runtime behavior where the concept needs simulated outcomes beyond normal produce/consume/commit flow.
5. Add Aiven adapter behavior only where real Kafka semantics are needed.
6. Add or update scenario insight/actions copy in `apps/web/lib/client`.
7. Add focused UI panels only when the shared topology, controls, timeline, and inspector are not enough.
8. Add reducer, runtime, and demo integration tests.
9. Add or extend Playwright coverage for the scenario route and its guided action.

Implemented scenario examples:

- Consumer-group load balancing.
- At-least-once delivery and duplicate processing.
- Retry and dead-letter queues.
- Schema evolution using Karapace.
- Idempotent and transactional producers.
- Event replay and event sourcing.
- Consumer lag and backpressure.
- Hot partitions and key skew.
- Log compaction and tombstones.
- Retention windows and data loss.
- Rebalance strategies and cooperative sticky assignment.
- Kafka Streams joins and windows.
- Outbox pattern and CDC.
- ACLs, users, and least privilege.

Good future candidates should add a distinct Kafka concept that can be represented with the existing run snapshot or a small, well-scoped contract extension.
