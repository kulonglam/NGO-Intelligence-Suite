# ADR-0003 — Redis Streams as the Event Substrate, not Kafka

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-14 |
| **Deciders** | Chief Architect, Platform Lead |
| **Consulted** | Data Architect |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [11](../11-event-driven-architecture.md), [ADR-0011](0011-transactional-outbox.md) |

---

## Context

Services communicate asynchronously for everything a user is not waiting on ([ADR-0008](0008-sync-vs-async-boundaries.md)): audit writes, notifications, LMS enrolment, dashboard aggregation, IATI staging. That requires a broker with at-least-once delivery, consumer groups, redelivery of unacknowledged messages, and a dead-letter path.

The expected volume is modest. Peak modelled throughput is around 400 events per second during a payroll run or a sync storm, with a steady state well under 50. Total event volume at Year 3 is projected under 200 million per month.

Redis is already in the architecture as the cache, so one option adds no new operational component at all.

## Decision

**Redis Streams, on managed Memorystore, with consumer groups per service.**

Seven streams by domain (`grant.events`, `hr.events`, `lms.events`, `beneficiary.events`, `fielddata.events`, `identity.events`, `platform.events`), consumer groups per subscribing service, `XAUTOCLAIM` for redelivery after 60 seconds, five delivery attempts, then a per-group dead-letter stream with a replay tool ([RB-02](../runbooks/rb-02-dlq-drain-and-replay.md)).

Durability does not rest on Redis. Events are written to a `outbox_events` table in the same transaction as the domain change and relayed to Redis by a poller ([ADR-0011](0011-transactional-outbox.md)). **Redis is the transport, the database is the source of truth.** If Redis loses data, events are replayable from the outbox; if Redis is unavailable, the outbox accumulates and drains on recovery.

## Alternatives considered

**Apache Kafka, or a managed equivalent.** The conventional choice, and technically the more capable one: higher throughput ceiling, long retention with replay from arbitrary offsets, partition-level ordering guarantees, a mature ecosystem including Connect and schema registries. Rejected because none of those capabilities is needed at this volume, and all of them are paid for in operations. Kafka means brokers to size and upgrade, partition rebalancing to understand, consumer group coordination semantics to debug at 3 a.m., and either Zookeeper or KRaft to operate — against a five-person platform capability whose on-call is business-hours-plus-escalation. Managed Kafka removes some of that and adds roughly 600 a month at the smallest credible configuration, which is a third of the entire Phase 2 infrastructure spend for capability we do not need.

**Google Pub/Sub.** Genuinely attractive: fully managed, no capacity planning, cheap at this volume, dead-letter topics built in. Rejected on two grounds. It is the strongest cloud coupling in the architecture, and unlike Cloud SQL or KMS it has no easy local equivalent, which would make integration testing depend on an emulator with known behavioural differences. It also lacks the ability to inspect and manipulate a backlog with the directness that `XRANGE` and `XAUTOCLAIM` give during an incident, and incident ergonomics matter more here than throughput.

**RabbitMQ.** A capable broker with good routing. Rejected: another component to operate for no benefit over Redis Streams at this volume, and its persistence and replay story is weaker than Streams for our purposes.

**PostgreSQL as the queue**, using `SELECT ... FOR UPDATE SKIP LOCKED`. Seriously considered, because the outbox already puts events in PostgreSQL and this would eliminate the broker entirely. Rejected because it puts polling load on the database that is already the platform's primary scaling constraint ([25 §25.6](../25-performance-and-capacity.md)), and consumer-group semantics would have to be built by hand.

## Consequences

**Positive.** No new operational component; Redis is already deployed, monitored and understood. Consumer group semantics are simple enough to reason about during an incident. Backlog inspection and manipulation are direct. Local development and integration testing use a real Redis in a container, with no emulator divergence. Cost is effectively zero marginal.

**Negative.** Redis is memory-bound, so stream trimming policy matters and a stalled consumer becomes a memory pressure problem rather than a disk problem — `MaxmemoryApproaching` is consequently a page, and [RB-02 §5.5](../runbooks/rb-02-dlq-drain-and-replay.md) exists for it. Ordering is per-stream, not per-key, so handlers must not assume ordering between entities. There is no schema registry, so envelope and compatibility rules are enforced by contract tests instead ([11 §11.8](../11-event-driven-architecture.md)). Retention is bounded by memory rather than days, so replay beyond the trim window comes from the outbox rather than the stream. The throughput ceiling is lower than Kafka's, though roughly two orders of magnitude above the modelled peak.

**Migration path, deliberately preserved.** Because publishing goes through the outbox relay rather than direct calls from domain code, replacing the transport is a change to one component. If volume or ordering requirements ever justify Kafka, the producers do not change. That property is worth more than the theoretical headroom Kafka would give today.
