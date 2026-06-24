# Adding a Scenario

Add new scenario definitions in `packages/scenario-engine`. A scenario should declare learning objectives, topic shape, limits, and any scenario-specific settings.

The application shell should not need to be rewritten. Add scenario-specific controls or visualizations as feature components and keep shared runtime events compatible with the contracts package.

Recommended flow:

1. Add the scenario definition.
2. Add any new event types to `packages/contracts`.
3. Extend the scenario engine for lifecycle/resource naming rules.
4. Add demo adapter behavior.
5. Add Aiven adapter behavior only where real Kafka semantics are needed.
6. Add focused UI panels for the scenario.
7. Add reducer tests and demo integration tests.

Future candidates:

- Retry and dead-letter queues.
- Fan-out versus load balancing.
- Schema evolution using Karapace.
- Event replay and event sourcing.
