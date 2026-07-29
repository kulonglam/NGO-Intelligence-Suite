# ADR-0011 — Transactional Outbox for Event Publication

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-18 |
| **Deciders** | Chief Architect, Data Architect |
| **Consulted** | Platform Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [11](../11-event-driven-architecture.md), [ADR-0003](0003-redis-streams-over-kafka.md) |

---

## Context

Services publish events for everything a user is not waiting on ([ADR-0008](0008-sync-vs-async-boundaries.md)). The naive implementation writes to the database, commits, then publishes to Redis:

```
BEGIN; UPDATE grants SET status='approved'; COMMIT;
await redis.xadd('grant.events', ...);   // ← may fail
```

This is a dual-write, and it has two failure modes, both of which occur in practice:

**Publish fails after commit.** The grant is approved and no event exists. The audit record is never written, the notification never sent, the dashboard never updated. Nothing is visibly broken, which is the worst property: an audit record silently missing is a compliance failure discovered during an audit.

**Publish succeeds and the transaction rolls back**, if published inside the transaction. Consumers act on a state change that did not happen — a notification about an approval that never occurred.

Neither is acceptable when one of the consumers is the audit trail, which is a compliance obligation ([14 §14.7](../14-security-architecture.md)), and another is a financial notification.

## Decision

**Events are written to an `outbox_events` table in the same transaction as the domain change, and relayed to Redis Streams by a separate poller.**

```sql
BEGIN;
  UPDATE grants SET status = 'approved' WHERE id = $1;
  INSERT INTO outbox_events (event_id, tenant_id, stream, event_type,
                             schema_version, payload, correlation_id, causation_id)
  VALUES (...);
COMMIT;
```

The relay polls every 500 ms in batches of 100, publishes, and marks rows as published. Key properties:

| Property | Detail |
| --- | --- |
| Atomicity | The event exists if and only if the state change committed. **No dual-write anywhere in the platform** |
| Delivery | At-least-once. The relay may publish and fail before marking, so a duplicate is possible by design |
| Idempotency | Mandatory on every consumer, keyed on `event_id`. This is a hard requirement, not a recommendation |
| Ordering | Per-stream by insertion order. Not guaranteed across streams |
| Durability | Independent of Redis. If Redis is unavailable, the outbox accumulates and drains on recovery |
| Replay | From the outbox table, beyond whatever the Redis trim window retains |
| Retention | Published rows retained 7 days for replay, then swept |
| Monitoring | `ngois_outbox_pending` and `ngois_outbox_relay_lag_seconds`; a stalled relay pages via `OutboxRelayStalled` ([RB-02 §5.2](../runbooks/rb-02-dlq-drain-and-replay.md)) |

No domain code calls Redis directly. Publishing is an `INSERT`, which also means publishing works in tests without a broker.

## Alternatives considered

**Direct publication after commit.** The default and the reason this ADR exists. Rejected as described: silent event loss, with the audit trail as the first casualty.

**Publication inside the transaction.** Rejected: a rollback after a successful publish means consumers act on state that does not exist, which is worse than loss because it is actively wrong.

**Change data capture from the write-ahead log**, via Debezium or logical replication. The most robust option, requiring no application change at all, and used widely at larger scale. Rejected on operational cost: a connector to run and monitor, replication slot management where a stalled slot can fill the primary's disk — a genuinely dangerous failure mode — and events derived from row diffs rather than from domain intent. The last point is the substantive one: an event should say `grant.disbursement.approved` with the semantics the domain intends, not describe a column change and leave consumers to infer meaning.

**Two-phase commit between PostgreSQL and Redis.** Rejected: Redis does not support it meaningfully, and distributed transactions would be the wrong answer even if it did.

**Accepting occasional loss for non-critical events**, with a synchronous audit write and events for the rest. Rejected because the classification would drift — every event is non-critical until the day it matters — and because the outbox is cheap enough that a two-tier scheme would add complexity to save an `INSERT`.

## Consequences

**Positive.** No event loss under any single failure. Redis becomes transport rather than a durability dependency, which is what makes [ADR-0003](0003-redis-streams-over-kafka.md) defensible. Publication is testable without a broker. Replay is available from a queryable table with full payloads. Transport is replaceable by changing one component. `correlation_id` and `causation_id` are captured at the source of truth.

**Negative.** Added publication latency: median around 250 ms, up to 500 ms, which is invisible for notifications and fine for audit. One extra write per event, which is a measurable share of write volume during a payroll run and is accounted for in the capacity model. **Duplicates are guaranteed to occur eventually**, so a non-idempotent consumer is a latent defect — enforced by contract tests rather than by hope. The relay is a component that can stall, needing its own monitoring and runbook. Ordering within a stream depends on insertion order rather than commit order, so two concurrent transactions can produce events in an order that surprises a consumer assuming otherwise.

**The rule that carries the risk.** Consumer idempotency. Every other property here is structural; that one depends on each handler being written correctly. A duplicate-processed `payroll.approved` would be a financial error, which is why idempotency is in the reviewer's priority list ([35 §35.3.2](../35-engineering-standards.md)) and why the contract test suite asserts it per consumer.
