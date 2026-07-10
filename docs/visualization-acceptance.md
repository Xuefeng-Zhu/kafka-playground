# Teaching-First Visualization Acceptance

Every scenario visualization is a lesson backed by server-authoritative state. A learner must be able to answer these questions from the graph and evidence lens without opening the inspector:

1. What changed?
2. Why did it change?
3. What happens next?

## Evidence rules

- Label every fact and causal edge as **Observed**, **Derived**, or **Simulated**.
- **Observed** means the runtime or remote broker reported the fact directly.
- **Derived** means the UI projector calculated the fact exclusively from authoritative snapshot fields. Derived facts must name the inputs in their explanation.
- **Simulated** means a deterministic demo engine produced the fact. Simulated facts must never appear as remote Kafka observations.
- A record may follow only one active causal route at a time. Historical routes remain visible only when their state and time are explicit.
- Bounded collections say “latest N records.” Full counters and aggregates live in `RunSnapshot.scenarioState`.
- Message, event, and entity references use stable IDs. Selecting one reference highlights the same subject in the graph, evidence lens, timeline, and inspector.
- Contrast experiments remain disabled until their authoritative prerequisite state exists. The API enforces the same dependency.
- Ordered transition steps remain visible in the evidence lens with virtual time and provenance; a fast deterministic experiment must not collapse into an unexplained final jump.
- Instructional evidence is normal DOM content rendered at 100% scale or greater. It is never placed inside a transformed React Flow board.

## Responsive and accessibility contract

- Desktop: compact causal graph beside the evidence lens.
- Tablet: graph above evidence.
- Mobile: semantic causal list and full-width evidence. React Flow is not mounted and the page owns vertical scrolling.
- Instructional text is at least 12 effective CSS pixels. Mobile controls have a 44 by 44 pixel minimum target.
- Tables have named columns and selectable record rows. Lists use semantic list markup.
- Provenance is communicated by visible text, not color alone.
- Focused records expose `aria-pressed` or `aria-selected` as appropriate.
- Experiment completion is announced through a polite live region.
- Closing the inspector returns focus to the control that opened it.
- Automated axe checks must report zero serious or critical findings.

## Scenario manifest

The test-owned manifest must contain one independent entry for every scenario. Each entry names a novice comprehension question and fixtures for initial, pivotal, and contrast or recovery states.

| Scenario                 | Novice comprehension question                                        | Pivotal proof                                                                                                                          |
| ------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Partitioning             | Why did these records share a partition, and who can process them?   | A, B, A routes both A records to one partition in offset order; processing and commit cursors differ; consumer three is idle.          |
| Load balancing           | How does adding a member change partition ownership?                 | Growing one to four members preserves one owner per partition and leaves member four idle.                                             |
| At-least-once duplicates | Why can the same Kafka record cause two side effects?                | The same partition and offset is redelivered after a pre-commit crash; naive count is 2 and idempotent count is 1.                     |
| Retry and DLQ            | When does a failure retry, succeed, or go to the DLQ?                | A transient record succeeds after countdown and a poison record exhausts attempts; each has exactly one active route.                  |
| Schema evolution         | Where is compatibility decided?                                      | Compatible v2 reaches the topic; simulated incompatible v3 stops at the registry gate and topic count does not change.                 |
| Transactions             | Which staged records become visible?                                 | Two staged records commit atomically; aborted and duplicate producer-sequence records remain invisible.                                |
| Event replay             | How can a projection rebuild without producing new facts?            | Projection clears, cursor resets, and immutable events replay while produced count stays fixed.                                        |
| Lag and backpressure     | Is the group falling behind or recovering, and why?                  | Per-partition lag rises under pressure, then falls after capacity changes with a drain estimate.                                       |
| Hot partitions           | How does the key strategy create skew?                               | Equal-size keyed and unkeyed phases have independent counters, percentages, skew ratio, and routing traces.                            |
| Compaction               | What survives compaction and tombstone cleanup?                      | Raw A1, B1, A2, tombstone B history shows materialized state and both cleaner stages.                                                  |
| Retention                | What happens when a consumer asks for an expired offset?             | Virtual time advances the log start past the commit, producing offset-out-of-range and explicit recovery choices.                      |
| Cooperative rebalancing  | Which partitions must stop moving during a rebalance?                | Eager and cooperative-sticky runs compare kept, moved, revoked, and paused partitions.                                                 |
| Streams joins            | Why did these records join or fail to join?                          | Only same-key records within the configured window and grace period emit joined output.                                                |
| Outbox and CDC           | Where is the atomic boundary and how is retry duplication prevented? | Business and outbox rows commit together; WAL/LSN progresses through CDC to Kafka acknowledgement and retry deduplicates.              |
| ACL least privilege      | Which exact policy decision allowed or denied the operation?         | Principal, operation, and resource are evaluated before execution; denied paths terminate and a minimal grant changes one matrix cell. |

## Required automated proof

### Model and component tests

- Assert exact invariants for initial, pivotal, and contrast or recovery fixtures.
- Include missing data, long IDs, bounded history, stable IDs, and monotonic cursors.
- Render every discriminated evidence lens.
- Exercise keyboard record selection, synchronized focus, state labels, live announcements, and inspector focus return.

### Scenario E2E test

Each scenario is reported as a separate test and must:

1. Assert initial state.
2. Run the server-owned experiment.
3. Wait for the matching authoritative scenario-state revision.
4. Assert the exact visual delta.
5. Follow the affected subject into the inspector and timeline.
6. Reload and verify persistence.
7. Finish with a clean console and stable layout.

### Pull request gate

- Lint, typecheck, unit tests, production build, and E2E.
- All 15 scenarios in Chromium at 1440 by 900.
- Partitioning, duplicates, hot partitions, streams joins, and ACL at 390 by 844.
- Evidence screenshots for all 15 scenarios.
- Axe scan with zero serious or critical findings.

### Nightly gate

- All scenarios at representative mobile and tablet sizes, including 320-pixel width and short-height viewports.
- Reduced motion, 200% zoom, long values, high-volume state, and SSE reconnect.
- Chromium, Firefox, and WebKit.

## Rollout

Use the internal migration allowlist and enable complete batches: shared foundation, newcomer fundamentals, delivery and lifecycle, history and state, gates, then multi-system pipelines. Unlisted scenarios stay entirely on the legacy renderer. Remove the legacy path only after every scenario is enabled and the full cutover has soaked for seven days.

Before enabling a batch, ask a first-time reviewer to explain the change and its cause within 30 seconds. At least four of five reviews must succeed on the first attempt; revise failed scenarios before enablement.
