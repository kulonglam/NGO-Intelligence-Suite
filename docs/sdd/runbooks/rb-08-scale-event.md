# RB-08 — Capacity and Saturation Response

| | |
| --- | --- |
| **ID** | RB-08 |
| **Applies to** | `LatencyHigh`, `DatabaseConnectionsHigh`, `DatabasePoolWaitHigh`, `RedisMemoryHigh`, `NotificationBacklog`, `DiskGrowthAnomalous` |
| **Severity** | SEV-2 or SEV-3 |
| **Owner** | Platform Lead |
| **Expected duration** | 15–45 minutes |
| **Last verified** | 2026-05-06, staging load test |
| **Related** | [25](../25-performance-and-capacity.md), [21 §21.4.3](../21-deployment-and-infrastructure.md) |

---

## 1. Symptoms

- p95 latency above 2× the SLO target for 10 minutes.
- Database pool utilisation above 85 per cent, or p95 pool wait above 100 ms.
- Redis memory above 85 per cent.
- Notification or report queue depth growing and not draining.
- Disk projected to fill within 14 days.

## 2. Impact

Degradation rather than outage, but saturation has a cliff: connection exhaustion and memory pressure both turn into total unavailability within seconds once a threshold is crossed. Treat a rising trend as urgent even while the platform still looks healthy.

## 3. Prerequisites

- Grafana (D-01, D-02, D-04, D-05, D-06, D-07).
- Break-glass Kubernetes write for scaling.
- Break-glass GCP console for managed-service resizing.

## 4. Do not

- **Do not scale a service that is blocked on the database.** More replicas means more connections competing for the same constrained resource, and it makes the incident worse. Confirm where the bottleneck is first.
- **Do not raise `DATABASE_POOL_MAX`** to relieve pool pressure. The total across replicas is bounded by the PgBouncer and Cloud SQL ceilings ([21 §21.6.2](../21-deployment-and-infrastructure.md)); raising it moves the failure from a queue into the database.
- **Do not change the Redis eviction policy** to relieve memory pressure. On the stream database it silently discards events.
- **Do not disable autoscaling** to stabilise things. Fix the trigger.
- **Do not resize Cloud SQL during a live payroll run.** Wait, or the run fails and you are in [RB-01](rb-01-failed-payroll-run.md) as well.

## 5. Procedure

### 5.1 Locate the bottleneck before acting

The single most important step. Scaling the wrong tier is the most common mistake in this runbook.

1. Open **D-01**, then answer in order:

| # | Question | Where | If yes |
| --- | --- | --- | --- |
| 1 | Was anything deployed in the last 2 hours? | D-01 deployment annotations | Consider rollback first — a performance regression is a common release defect |
| 2 | Is the database the constraint? | D-04: pool wait, active connections, query latency | Go to 5.3. **Do not scale services** |
| 3 | Is Redis the constraint? | D-06: memory, latency, evictions | Go to 5.4 |
| 4 | Is one service saturated while others are fine? | D-02 per service: CPU, event loop lag, in-flight requests | Go to 5.2 |
| 5 | Is a queue growing? | D-05 consumer lag, notification depth | Go to 5.5 |
| 6 | Is the cluster out of capacity? | D-07: pending pods, node CPU | Go to 5.6 |
| 7 | Is it a legitimate demand spike? | D-15 business activity; is it a payroll or reporting window? | Go to 5.7 |

2. Check event loop lag specifically — in Node.js it is the earliest saturation signal and usually moves before latency does:

```bash
curl -s "$PROM/api/v1/query?query=nodejs_eventloop_lag_p99_seconds" | \
  jq -r '.data.result[] | "\(.metric.service) \(.value[1])"' | sort -k2 -rn
```

**Expected in health:** under 0.05 s. Above 0.2 s the service is CPU-starved.

### 5.2 A single service is saturated

3. Confirm it is CPU or event loop bound, not blocked on a dependency:

```bash
kubectl -n <NS> top pods -l app=<SERVICE>
kubectl -n <NS> get hpa <SERVICE>
```

**Expected:** if CPU is near the limit and the HPA is at `maxReplicas`, scaling is the right action.

4. Check whether it is throttled rather than busy — CPU throttling in Node.js presents as erratic latency:

```bash
curl -s "$PROM/api/v1/query?query=rate(container_cpu_cfs_throttled_seconds_total{container=\"<SERVICE>\"}[5m])" | jq .
```

5. Raise the HPA ceiling and the floor:

```bash
kubectl -n <NS> patch hpa <SERVICE> --type=merge \
  -p '{"spec":{"minReplicas":<CURRENT+2>,"maxReplicas":<MAX+4>}}'
kubectl -n <NS> rollout status deploy/<SERVICE> --timeout=180s
```

**Expected:** new pods ready within 60 s; latency improving within 3 minutes.

6. If new pods do not schedule, the cluster is the constraint — go to 5.6.

7. Record the change. **A manual HPA change must be reverted or made permanent in the Helm chart within 24 hours**, or the next Argo sync will silently undo it.

### 5.3 The database is the constraint

8. Establish what kind of database pressure this is:

```bash
psql "$ADMIN_DB_URL" -c "
  SELECT state, count(*),
         max(now() - state_change) AS longest
  FROM pg_stat_activity
  WHERE datname = 'ngois'
  GROUP BY state ORDER BY count(*) DESC;"
```

| Observation | Cause | Action |
| --- | --- | --- |
| High `idle in transaction` | A transaction left open across an external call | Step 9 |
| High `active` with long durations | Slow queries | Step 10 |
| High total, mostly `idle` | Pool sizing across too many replicas | Step 12 |
| Lock waits | Contention, often a migration | Step 11 |

9. Find and stop the offender:

```bash
psql "$ADMIN_DB_URL" -c "
  SELECT pid, application_name, state,
         now() - state_change AS idle_for, left(query,120)
  FROM pg_stat_activity
  WHERE state = 'idle in transaction'
    AND now() - state_change > interval '30 seconds'
  ORDER BY idle_for DESC;"
```

Restart the offending service rather than killing individual backends; the connections will simply reopen:

```bash
kubectl -n <NS> rollout restart deploy/<SERVICE>
```

Then raise a defect. Holding a transaction across an external call is prohibited ([25 §25.3.2](../25-performance-and-capacity.md)).

10. Identify slow queries:

```bash
psql "$ADMIN_DB_URL" -c "
  SELECT calls, round(mean_exec_time::numeric,1) AS mean_ms,
         round(total_exec_time::numeric/1000,1) AS total_s, left(query,100)
  FROM pg_stat_statements
  ORDER BY total_exec_time DESC LIMIT 15;"
```

If one query dominates, terminate it if it is a report and the tenant can wait:

```bash
psql "$ADMIN_DB_URL" -c "SELECT pg_cancel_backend(<PID>);"
# Only if cancel fails:
psql "$ADMIN_DB_URL" -c "SELECT pg_terminate_backend(<PID>);"
```

Prefer `pg_cancel_backend`; termination drops the connection and can leave the client in a confused state.

11. Check for lock waits:

```bash
psql "$ADMIN_DB_URL" -c "
  SELECT blocked.pid AS blocked_pid, blocking.pid AS blocking_pid,
         blocked.query AS blocked_query, blocking.query AS blocking_query
  FROM pg_stat_activity blocked
  JOIN pg_stat_activity blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid));"
```

If a migration is holding a lock, let it finish if it is short. If it is long and blocking production, cancel it — migrations are designed to be re-runnable and lock-safe, so a cancelled one is recoverable ([22 §22.6](../22-cicd-release-supply-chain.md)).

12. Shed load rather than adding capacity. This is the correct move under database pressure:

```bash
# Highest-value, lowest-cost reductions first.
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/flags/analytics_recompute_enabled" -d '{"enabled":false,"reason":"incident <INC>"}'
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/flags/scheduled_reports_enabled" -d '{"enabled":false,"reason":"incident <INC>"}'
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/flags/bulk_export_enabled" -d '{"enabled":false,"reason":"incident <INC>"}'
```

**Expected:** connection count and pool wait falling within 2 minutes. These three flags remove the heaviest non-interactive load while leaving every interactive workflow intact ([20 §20.5.2](../20-configuration-secrets-feature-flags.md)).

13. If shedding is insufficient and the pressure is structural, resize Cloud SQL. **Not during a payroll run:**

```bash
gcloud sql instances describe <INSTANCE> --format="value(settings.tier)"
gcloud sql instances patch <INSTANCE> --tier=<LARGER_TIER>
```

A tier change on a regional HA instance performs a failover, so expect a 30–60 second interruption. Treat it as a deliberate short outage, announce it, and verify afterwards as in [RB-03](rb-03-database-failover.md) §6.

### 5.4 Redis pressure

14. Establish where the memory has gone:

```bash
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls INFO memory | grep -E 'used_memory_human|maxmemory_human'
kubectl -n ngois-platform exec -it deploy/ops-tools -- \
  redis-cli -h $REDIS_HOST --tls --bigkeys
```

15. If streams have grown, a consumer is stalled — that is the real problem. Go to [RB-02](rb-02-dlq-drain-and-replay.md) §5.3.

16. If the cache database has grown, reducing a TTL is safe and immediate. If the growth is structural, resize:

```bash
gcloud redis instances update <INSTANCE> --size=<GB>
```

17. **Verify the eviction policy is still `noeviction` on the stream database.** If it is not, events may already have been lost — escalate as SEV-1 ([RB-02](rb-02-dlq-drain-and-replay.md) §5.5 step 21).

### 5.5 A queue is growing

18. Identify which:

```bash
curl -s "$PROM/api/v1/query?query=ngois_stream_consumer_lag" | \
  jq -r '.data.result[] | "\(.metric.stream)/\(.metric.consumer_group) \(.value[1])"' | sort -k2 -rn
```

19. For event streams, go to [RB-02](rb-02-dlq-drain-and-replay.md). For notification or report queues, scale the consumer:

```bash
kubectl -n ngois-platform scale deploy/notification-service --replicas=<CURRENT+2>
```

20. If a queue is growing because of a downstream provider failure, scaling will not help — go to [RB-15](rb-15-integration-failure.md).

### 5.6 Cluster capacity

21. Check for unschedulable pods and node pressure:

```bash
kubectl get pods -A --field-selector=status.phase=Pending
kubectl describe nodes | grep -A5 'Allocated resources'
kubectl get events -A --field-selector reason=FailedScheduling --sort-by=.lastTimestamp | tail -20
```

22. The cluster autoscaler should add nodes within 2–3 minutes. If it is at the pool maximum:

```bash
gcloud container clusters describe <CLUSTER> --region=<REGION> \
  --format="value(nodePools[].name,nodePools[].autoscaling.maxNodeCount)"

gcloud container clusters update <CLUSTER> --region=<REGION> \
  --node-pool=application --enable-autoscaling \
  --min-nodes=<MIN> --max-nodes=<NEW_MAX>
```

23. If scheduling is blocked by a PodDisruptionBudget during a concurrent node operation, wait — do not weaken the PDB to make room.

### 5.7 Legitimate demand spike

24. Confirm from D-15 and the calendar whether this is a payroll window, a quarter-end reporting period, or a known campaign.

25. If it is predictable, it should have been pre-scaled ([25 §25.7.2](../25-performance-and-capacity.md)). Apply the pre-scale now and raise the gap: the schedule either did not exist or did not fire.

```bash
kubectl -n ngois-core patch hpa hr-payroll-service --type=merge \
  -p '{"spec":{"minReplicas":4}}'
kubectl -n ngois-platform patch hpa reporting-service --type=merge \
  -p '{"spec":{"minReplicas":4}}'
```

26. If a single tenant is generating the load, check their quota consumption and rate tier:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/quota-usage" | jq .
```

A tenant consistently saturating their tier is a commercial conversation, not an engineering problem ([29 §29.5](../29-multi-tenancy-and-tenant-lifecycle.md)).

## 6. Verification

27. p95 latency back within the SLO target on D-01.
28. Database pool utilisation under 70 per cent and pool wait under 10 ms.
29. Redis memory under 75 per cent, no evictions.
30. Consumer lag under 500 and falling.
31. No pending pods.
32. Every kill switch flipped in step 12 has been **turned back on** and the deferred work has caught up:

```bash
for f in analytics_recompute_enabled scheduled_reports_enabled bulk_export_enabled; do
  curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
    "$API/v1/platform/flags/$f" -d '{"enabled":true,"reason":"incident <INC> resolved"}'
done
```

**This step is the one most often forgotten.** A kill switch left off silently degrades the product for weeks.

33. Every manual HPA or tier change either reverted or committed to the Helm chart.
34. Synthetic journeys passing.

## 7. Rollback

Scaling changes are reversible by reverting them. If a Cloud SQL resize caused a problem, resizing back also performs a failover — treat it as another deliberate interruption rather than a free undo.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Redis eviction policy wrong on the stream database | Platform Lead **and** Chief Architect, SEV-1 |
| A Cloud SQL resize is required during business hours | Platform Lead |
| Saturation recurs within 24 hours of resolution | Chief Architect — this is a capacity model failure, not an incident |
| A single tenant is degrading others | Platform Lead; consider a temporary rate tier reduction |
| Cluster at its maximum with quota exhausted | Platform Lead; GCP quota increase request |
| Unresolved after 45 minutes | Platform Lead |

## 9. Follow-up

- Postmortem if SEV-2.
- **Every manual scaling change becomes either a Helm chart change or a reverted change within 24 hours.** Argo will otherwise undo it at the next sync, at an unpredictable moment.
- If the cause was predictable calendar load, add or fix the pre-scale schedule.
- If the cause was `idle in transaction`, the action item is a code defect plus a lint rule, never a pool increase.
- Feed observed volumes into the monthly capacity review, and revise the bottleneck table in [25 §25.6](../25-performance-and-capacity.md) if this incident revealed a new one.
