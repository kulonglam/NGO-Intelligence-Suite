# RB-02 — Dead Letter Queue Drain and Event Replay

| | |
| --- | --- |
| **ID** | RB-02 |
| **Applies to** | `EventsDeadLettered`, `EventConsumerLagCritical`, `OutboxRelayStalled`, `RedisEvictionsOccurring` |
| **Severity** | SEV-2 |
| **Owner** | Platform Lead |
| **Expected duration** | 30–120 minutes |
| **Last verified** | 2026-06-03, staging |
| **Related** | [11](../11-event-driven-architecture.md), [Appendix D](../appendices/d-event-catalog.md) |

---

## 1. Symptoms

- `ngois_events_dlq_total` has increased.
- `ngois_stream_consumer_lag` above 5,000, or `ngois_stream_oldest_pending_seconds` above 600.
- `ngois_outbox_relay_lag_seconds` above 300.
- Downstream effects users notice: notifications not arriving, dashboards stale, audit records missing for recent actions.

## 2. Impact

Depends on which stream. Events are **asynchronous by design**, so the primary user action already succeeded; what is delayed is the consequence. The impact ladder:

| Stream stalled | User-visible effect |
| --- | --- |
| `platform.events` (audit) | **Audit records missing for recent actions.** Compliance-relevant; treat as SEV-2 minimum |
| `grant.events` | Dashboards and burn rate stale; notifications delayed |
| `hr.events` | LMS auto-enrolment not happening; leave balance updates delayed |
| `fielddata.events` | Analytics stale; **submissions themselves are safe** — they are committed before the event |
| `beneficiary.events` | Deduplication flags and aggregate counts stale |
| `identity.events` | **Role and permission changes not propagating.** Security-relevant |

## 3. Prerequisites

- Grafana access (dashboard D-05, Event system).
- Break-glass Kubernetes access.
- Redis CLI access via the ops pod.
- Break-glass database read.

## 4. Do not

- **Do not `XTRIM` or delete a stream.** Undelivered events are business data.
- **Do not `XACK` a pending entry to clear lag.** Acknowledging an unprocessed event silently discards it.
- **Do not replay from the DLQ before the cause is fixed.** The events will fail again and re-enter the DLQ, doubling the work and the noise.
- **Do not change the eviction policy on the stream database to `allkeys-lru`.** It will silently delete events under memory pressure ([21 §21.6.3](../21-deployment-and-infrastructure.md)).
- **Do not delete outbox rows.** They are the source of truth for what should have been published.

## 5. Procedure

### 5.1 Determine which problem you have

1. Open dashboard **D-05**. Identify which of the three distinct problems this is:

| Signal | Problem | Go to |
| --- | --- | --- |
| `ngois_outbox_pending` rising, publication rate near zero | **Producer side** — the outbox relay is not publishing | 5.2 |
| Publication healthy, `ngois_stream_consumer_lag` rising | **Consumer side** — a handler is slow or stuck | 5.3 |
| `ngois_events_dlq_total` increasing | **Poison events** — specific events fail repeatedly | 5.4 |
| Redis memory above 85 per cent, or evictions | **Capacity** | 5.5 |

More than one may be true. Fix in the order producer, consumer, DLQ, because a stalled relay looks like a healthy consumer.

### 5.2 Outbox relay stalled

2. Check the relay is running:

```bash
kubectl -n ngois-core get pods -l app=grant-service -o wide
kubectl -n ngois-core logs -l app=<SERVICE> --tail=100 | grep -i outbox
```

3. Check the pending depth and the oldest row:

```bash
psql "$DB_URL" -c "
  SELECT count(*) AS pending,
         min(created_at) AS oldest,
         now() - min(created_at) AS age
  FROM outbox_events
  WHERE published_at IS NULL;"
```

4. Common causes, in order of likelihood:

| Cause | Check | Fix |
| --- | --- | --- |
| Redis unreachable from the service | Readiness endpoint shows `redis: error` | Follow 5.5, or [RB-13](rb-13-service-down.md) |
| The relay pod is crash-looping | `kubectl get pods` restart count | [RB-13](rb-13-service-down.md) |
| A single malformed outbox row blocking the batch | The relay log names an `event_id` repeatedly | Go to step 5 |
| The relay was scaled to zero | Replica count | Scale back up |

5. If one row is blocking the batch, move it aside rather than deleting it:

```bash
psql "$DB_URL" -c "
  UPDATE outbox_events
  SET quarantined_at = now(),
      quarantine_reason = 'blocking relay, RB-02 step 5, incident <INC>'
  WHERE id = '<OUTBOX_ID>';"
```

**Expected:** 1 row updated, the relay resumes on its next poll (within 500 ms), and `ngois_outbox_pending` begins falling. The quarantined row is investigated afterwards, not discarded.

6. Confirm publication resumes on D-05. Go to §6.

### 5.3 Consumer lag

7. Identify the group that is behind:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls XINFO GROUPS <STREAM>
```

**Expected:** per-group `pending` and `lag`. The group with a large `pending` is the problem.

8. Check whether the consumer is alive and what it is doing:

```bash
logcli query '{service="<CONSUMER_SERVICE>"} | json | operation=~"event.consume.*"' --since=15m
```

9. Classify:

| Observation | Cause | Action |
| --- | --- | --- |
| No consume log lines at all | Consumer not running | Check pods; [RB-13](rb-13-service-down.md) |
| Consume lines with long `duration_ms` | Handler slow | Step 10 |
| Consume lines cycling on the same `event_id` | Poison event | Go to 5.4 |
| Consumer healthy, volume simply high | Burst | Step 11 |

10. If the handler is slow, find out why before scaling. Check whether it is blocked on the database (D-04 pool wait) or on an external call (D-11 integration latency). Scaling a handler that is blocked on a saturated database makes the database worse.

11. If it is a genuine volume burst, add consumers:

```bash
kubectl -n ngois-core scale deploy/<CONSUMER_SERVICE> --replicas=<CURRENT+3>
```

**Expected:** lag begins falling within 2 minutes. Note the HPA is normally lag-driven ([21 §21.4.3](../21-deployment-and-infrastructure.md)); a manual scale is needed only when the HPA maximum is the constraint.

12. Reclaim entries orphaned by a dead consumer:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls \
  XAUTOCLAIM <STREAM> <GROUP> <NEW_CONSUMER> 60000 0 COUNT 100
```

**Expected:** entries are reassigned and reprocessed. Handlers are idempotent, so redelivery is safe ([11 §11.6](../11-event-driven-architecture.md)).

13. Watch until lag returns under 500. Go to §6.

### 5.4 Poison events in the DLQ

14. Inspect the dead letter stream. **Read, do not consume:**

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls XRANGE <STREAM>.dlq.<GROUP> - + COUNT 20
```

**Expected:** entries carrying the original envelope plus `failure_reason`, `attempts` and the last error.

15. Group the failures by reason. Almost always one of:

| Reason | Cause | Fix |
| --- | --- | --- |
| Schema validation failure | A producer emitted a shape the consumer does not accept — usually a version skew | Fix the producer or deploy the consumer that understands it, then replay |
| Referenced entity not found | An ordering problem, or the entity was deleted | If the entity is genuinely gone, the event is obsolete: discard with a record. Otherwise replay after the entity exists |
| Handler exception | A defect | Fix, deploy, replay |
| Foreign key or constraint violation | Data inconsistency | Investigate before replaying; replaying will fail identically |
| Timeout | Transient | Replay directly |

16. **Fix the cause before replaying.** This is the step most often skipped, and skipping it doubles the DLQ.

17. Replay:

```bash
# Dry run first, always.
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  node dist/tools/replay-dlq.js \
  --stream <STREAM> --group <GROUP> --limit 50 --dry-run

# Then for real.
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  node dist/tools/replay-dlq.js \
  --stream <STREAM> --group <GROUP> --limit 50 \
  --reason "fixed in <VERSION>, incident <INC>"
```

**Expected:** the dry run reports what would be replayed with no side effects. The real run re-publishes to the source stream, records the replay in the audit trail, and removes the entries from the DLQ only after successful processing.

18. Replay in batches of 50 and check after each. If a batch fails, stop — the cause is not fixed.

19. For an event that is genuinely obsolete and must not be replayed:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  node dist/tools/discard-dlq.js --stream <STREAM> --group <GROUP> \
  --event-id <EVENT_ID> \
  --reason "entity deleted, event obsolete, incident <INC>, approved by <NAME>"
```

**Expected:** the discard is recorded permanently in the audit trail with the reason and the approver. Discarding requires the Platform Lead's approval — it is the only step in this runbook that destroys business data.

### 5.5 Redis capacity

20. Check memory and stream sizes:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls INFO memory
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls XLEN <STREAM>
```

21. Confirm the eviction policy on the stream database is `noeviction`:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls CONFIG GET maxmemory-policy
```

**Expected:** `noeviction`. **If it is anything else, events may already have been silently lost. Escalate as a SEV-1** and reconcile from `outbox_events` to determine what was published but never delivered.

22. If a stream has grown because a consumer was stalled, fixing the consumer (5.3) is the remedy. Trim only entries that every group has acknowledged:

```bash
# Verify first that all groups' last-delivered-id is beyond the trim point.
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls XINFO GROUPS <STREAM>

kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls XTRIM <STREAM> MINID <SAFE_ID>
```

23. If memory pressure is structural rather than incident-driven, raise the Memorystore size — a managed scale-up with no downtime — and record it for the capacity review.

## 6. Verification

24. `ngois_outbox_pending` under 100 and falling.
25. `ngois_stream_consumer_lag` under 500 for every group.
26. `ngois_stream_oldest_pending_seconds` under 60.
27. DLQ depth zero, or containing only entries deliberately left for investigation.
28. Reconcile publication against the outbox, which is the definitive check that nothing was lost:

```bash
psql "$DB_URL" -c "
  SELECT count(*) FILTER (WHERE published_at IS NULL)     AS unpublished,
         count(*) FILTER (WHERE quarantined_at IS NOT NULL) AS quarantined
  FROM outbox_events
  WHERE created_at > now() - interval '24 hours';"
```

**Expected:** `unpublished` near zero; `quarantined` matches what you deliberately quarantined.

29. Confirm the downstream effect is restored: a recent action has an audit record, a notification arrived, a dashboard figure moved.

## 7. Rollback

Replay is additive and idempotent, so there is nothing to roll back. If a replay caused unexpected downstream writes, the handler is not idempotent — that is a defect, and it goes to the Chief Architect.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Eviction policy was wrong and events may be lost | Platform Lead **and** Chief Architect, SEV-1 |
| `platform.events` (audit) stalled over 1 hour | Security Lead — audit completeness is a compliance obligation |
| `identity.events` stalled over 15 minutes | Security Lead — permission changes are not propagating |
| DLQ still growing after the fix | Chief Architect |
| Any discard of business data | Platform Lead approval required, not optional |
| Unresolved after 2 hours | Platform Lead |

## 9. Follow-up

- Postmortem for any SEV-2.
- If the cause was a schema skew, the action item is a **contract test gap** ([23 §23.5](../23-testing-strategy.md)) — the producer change should not have shipped.
- If a poison event stalled a whole stream, verify chaos experiment CH-12 still passes; the consumer should have isolated it.
- Review quarantined outbox rows within 24 hours and either publish or record why not.
