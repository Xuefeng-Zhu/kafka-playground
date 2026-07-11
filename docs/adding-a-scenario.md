# Adding a Scenario

Add new scenario definitions in `packages/scenario-engine`. A scenario must declare learning objectives, topic shape, limits, scenario-state contract, deterministic experiments, and a teaching-first client experience.

The application shell should not need to be rewritten. Add scenario-specific controls or visualizations as feature components and keep shared runtime events compatible with the contracts package.

Recommended flow:

1. Add the scenario definition.
2. Add any new event types to `packages/contracts`.
3. Extend the scenario engine for default key strategy, processing latency, payload shaping, headers, resource naming, and deterministic processing outcomes.
4. Add demo-runtime behavior where the concept needs simulated outcomes beyond normal produce/consume/commit flow.
5. Add Aiven adapter behavior only where real Kafka semantics are needed.
6. Add a `ScenarioExperienceDefinition` with lesson, misconception, projector, experiments, and checkpoint.
7. Choose exactly one discriminated evidence lens and give every table named columns plus typed record references.
8. Add the scenario to the typed experience and Explore-topology registries; completeness checks must fail until its server state, experiments, projector, lens, and tests are present.
9. Add model fixtures for initial, pivotal, and contrast or recovery states to the test-owned scenario manifest.
10. Map causal-graph entities to stable Explore topology IDs; evidence-record aliases use `graphEntityId` and remain Evidence Inspector subjects.
11. Add reducer, runtime, demo integration, component, accessibility, and independent Playwright coverage for both workspace views.

## Authoring guardrails

- Preserve existing scenario, action, route, and inspector entity IDs.
- A projector may derive presentation from the snapshot, but it may not create an event, record, partition, offset, assignment, or commit.
- Mark every fact and causal edge `observed`, `derived`, or `simulated`.
- Keep full aggregates in `scenarioState`; label bounded record collections “latest N records.”
- Stable entity IDs must survive reloads and SSE reconnects.
- An experiment is a serialized server-owned state transition. Do not implement teaching scripts as a client loop of loosely related controls.
- Declare experiment prerequisites. A contrast action stays disabled and the API rejects it until its required primary state exists.
- Derive Before, Current, and After facts from the actual authoritative states involved; never use a generic zero baseline when prior experiment evidence exists.
- Give every meaningful virtual-time transition a learner-facing label and stable entity reference so the evidence trail can show progression even when execution completes quickly.
- Advanced schema, ACL, transaction, CDC, and stream processing behavior stays a deterministic demo feature until an equivalent remote integration exists.
- Remote mode may show only observed broker behavior and must disable unsupported experiments explicitly.
- Use one `FocusRef` so selecting a message, event, or entity synchronizes the graph, lens, timeline, and inspector.
- Instructional content belongs in normal DOM at 100% scale. Mobile uses a semantic causal list instead of a transformed graph.
- A demo scenario must work in both workspace views: Guided owns the lesson, while Explore projects the same causal graph into the runtime topology with raw Controls and the full Timeline. Do not duplicate core producer, topic, partition, message, ownership, or consumer cards.
- Every scenario must provide at least one distinctive extension node and causal edge. Project nodes into deterministic rank and lane order, label every edge, and preserve each graph entity ID as the selectable Explore identity.
- Use stable core Explore entity IDs: `producer`, `topic`, `consumerGroup`, `partition-N`, and `consumer:<id>`. Scenario extensions use their existing causal-graph entity IDs; never create a second ID for desktop or mobile rendering.
- Explore must not render the superseded scenario overlay. A scenario with a temporarily missing authoritative frame uses core-only Explore; every routable catalog scenario must provide a complete experience definition before it ships.
- Demo Explore labels its state simulated; remote/Aiven Explore labels broker-reported state observed. Never reuse observed copy for deterministic demo counts.
- Mobile Explore renders the same ranked core-plus-extension topology as semantic cards and labeled causal connections, and must not mount React Flow below 768 pixels. Every selectable card has a 44-pixel minimum target.
- New scenario tests clear `kplay.workspace.view` before proving the Guided default, then exercise Explore without resetting the active run or `FocusRef`. Assert one distinctive extension node and edge in both desktop and mobile renderers.

See [Teaching-First Visualization Acceptance](visualization-acceptance.md) for the per-scenario proof and release gates.

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
