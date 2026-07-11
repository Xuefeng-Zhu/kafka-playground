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

## Workspace-view contract

- First-use demo runs open in **Guided**. Guided is a full-height lesson and does not mount the lower dock, raw Controls, full Timeline, or React Flow.
- **Explore** presents the same active run as one projected topology with raw Controls, full Timeline, and inspector. Demo scenarios render each route-relevant Kafka core entity exactly once plus every scenario-specific causal node and labeled edge; they do not fabricate an irrelevant core node and must not restore the superseded scenario-overlay board.
- The `kplay.workspace.view` preference is global to the browser, accepts only `guided` or `explore`, and survives reloads and later demo runs. Forced Explore for remote or Aiven runs must not overwrite it.
- Scenario start pages keep the saved/default switch visible in a disabled state with the accessible instruction **Start a run to use Guided or Explore**. Starting a demo run enables the same switch without shifting the header.
- Switching views preserves authoritative run state, experiment progress, checkpoint answers, `FocusRef`, inspector state, and the active Explore dock tab. Switching is disabled while an experiment or raw mutation is pending.
- Explore uses **Simulated runtime topology** or **Observed broker topology** as its accessible region name instead of a full-width explanatory banner. The global runtime mode and provenance on every node and edge remain visible; remote and Aiven Explore remains core-only and never calls demo state observed.
- A scenario with no authoritative experience frame falls back to core-only Explore; the superseded overlay never substitutes for a missing projection.
- React Flow is lazy-loaded only after desktop or tablet Explore opens. Re-entering Explore frames the projection at a readable 100% home zoom; learners can zoom out to a 50% overview, and larger graphs remain reachable by dragging the grab-cursor canvas. Pan and zoom are not persisted.

## Responsive and accessibility contract

- Guided desktop: compact causal graph beside the evidence lens.
- Guided tablet: causal graph above evidence.
- Guided mobile: semantic causal list and full-width evidence.
- Explore desktop and tablet: the ranked core-plus-scenario projection in React Flow plus the lower dock.
- Explore mobile below 768 pixels: the same ranked causal order as semantic producer, partition, message, ownership, consumer, and scenario-extension cards with labeled connections. React Flow is not mounted and the page owns vertical scrolling.
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
5. Follow the affected subject through the transition trail and inspector.
6. Reload and verify persistence.
7. Finish with a clean console and stable layout.

### Pull request gate

- Lint, typecheck, unit tests, production build, and E2E.
- All 15 scenarios in Chromium at 1440 by 900.
- All 15 scenarios prove the first-use Guided state with no dock or React Flow.
- All 15 scenarios expose a distinctive extension node and causal edge in both desktop and semantic mobile Explore.
- Partitioning proves the complete Guided-to-Explore round trip, raw action, synchronized focus, reload persistence, and global preference restoration.
- Partitioning, duplicates, hot partitions, streams joins, and ACL at 390 by 844.
- Those five mobile scenarios prove semantic Explore topology with no React Flow, overflow, or scroll trapping.
- Guided evidence screenshots for all 15 scenarios plus desktop and mobile Explore screenshots. Store generated CI evidence under the ignored `docs/screenshots/evidence/` directory; refresh the tracked README screenshots at 1440 by 900 when workspace structure changes.
- Axe scan with zero serious or critical findings.

### Nightly gate

- All scenarios at representative mobile and tablet sizes, including 320-pixel width and short-height viewports.
- Reduced motion, 200% zoom, long values, high-volume state, and SSE reconnect.
- Desktop Explore plus representative mobile semantic Explore coverage.
- Chromium, Firefox, and WebKit.

## Ongoing acceptance

Every catalog scenario is present in the typed experience registry and Explore-topology registry. Registry completeness tests must fail whenever a scenario is added without its teaching and topology definitions.

Before shipping a scenario or visualization revision, ask a first-time reviewer to explain the change and its cause within 30 seconds. At least four of five reviews must succeed on the first attempt; revise failed scenarios before release.
