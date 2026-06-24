# Kafka Visual Playground

Kafka Visual Playground is a scenario-driven learning app for Kafka partitioning, ordering, consumer-group rebalancing, and manual offset commits.

The MVP implements one scenario: **Partitioning, Ordering, and Consumer Rebalancing**. Future scenarios are shown as disabled catalog cards.

## Screenshots

Screenshots can be added after running the demo mode locally.

## Architecture

```mermaid
flowchart LR
  UI[Next.js React UI] --> API[Route Handlers /api/v1]
  API --> Runtime[Server-only PlaygroundRuntime singleton]
  Runtime --> Adapter{KafkaRuntimeAdapter}
  Adapter --> Demo[Deterministic demo adapter]
  Adapter --> Aiven[Aiven Kafka adapter]
  Runtime --> SSE[SSE subscribers]
  SSE --> UI
```

Next.js serves both the UI and API, but Kafka clients are owned only by the centralized server runtime. The MVP must run as one persistent Node.js process.

## Requirements

- Node.js 22
- npm
- Optional: Aiven for Apache Kafka service and `certs/ca.pem`

## Setup

```bash
npm install
npm run dev:demo
```

Open `http://localhost:3000/scenarios/partitioning`.

## Aiven Mode

Create an Aiven for Apache Kafka service, create a service user, copy the SASL/TLS broker URL, and download the CA certificate to `certs/ca.pem`.

Configure:

```env
KAFKA_MODE=aiven
AIVEN_KAFKA_BROKERS=host:port
AIVEN_KAFKA_USERNAME=
AIVEN_KAFKA_PASSWORD=
AIVEN_KAFKA_SASL_MECHANISM=SCRAM-SHA-256
AIVEN_KAFKA_CA_PATH=./certs/ca.pem
KAFKA_TOPIC_PREFIX=kplay
```

The browser never receives usernames, passwords, certificate contents, or raw Kafka configuration. The connection test returns only sanitized status, masked broker host, broker count, topic count when available, and sanitized errors.

## Resource Naming

Run resources use:

```text
<prefix>.<scenario>.<UTC date>.<random suffix>
```

Example:

```text
kplay.partitioning.20260624.ab12cd
kplay.partitioning.20260624.ab12cd.workers
```

Reset and run deletion stop producers, clear timers, disconnect runtime resources, close SSE subscribers, and request topic deletion.

## Cleanup CLI

```bash
npm run kafka:cleanup -- --dry-run
npm run kafka:cleanup -- --confirm
```

The CLI only targets topics that start with the configured prefix and refuses to delete anything outside that prefix.

## Commands

```bash
npm run dev
npm run dev:demo
npm run build
npm run start
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

## Security Notes

- Do not commit `.env` files or Kafka certificates.
- Message payload logging is disabled by default.
- Kafka errors are sanitized before they are returned or printed.
- Route Handlers run in the Node.js runtime and delegate to server-only runtime modules.

## Known MVP Limitations

- Demo mode simulates Kafka behavior deterministically.
- Hard consumer crashes are not implemented.
- The optional real-Aiven smoke test is gated by `RUN_AIVEN_E2E=true` and requires live service credentials plus `certs/ca.pem`.
