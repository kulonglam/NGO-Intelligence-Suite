# RB-03 — Database Failover and Recovery

| | |
| --- | --- |
| **ID** | RB-03 |
| **Applies to** | `DatabaseUnavailable`, `ReplicationLagHigh`, Cloud SQL maintenance failure |
| **Severity** | SEV-1 |
| **Owner** | Data Architect |
| **Expected duration** | 15–60 minutes |
| **Last verified** | 2026-04-22, staging forced failover |
| **Related** | [21 §21.6](../21-deployment-and-infrastructure.md), [27 §27.5](../27-disaster-recovery-and-bcp.md) |

---

## 1. Symptoms

- `DatabaseUnavailable`: two or more services reporting the database unreachable.
- Every service readiness endpoint showing `database: error`.
- Widespread 503s at the gateway.
- `ReplicationLagHigh`: replica lag above 30 s, which affects reporting correctness before it affects availability.

## 2. Impact

Total platform unavailability during a primary failure. Field devices continue capturing offline and are unaffected until they attempt to sync ([13](../13-offline-first-architecture.md)), which is the single most valuable property of the architecture during this incident.

## 3. Prerequisites

- Grafana (dashboard D-04, Database).
- Break-glass GCP console or `gcloud` access.
- Cloud SQL instance name and region.

## 4. Do not

- **Do not restore a backup over the primary.** That is a different, much more destructive procedure, and it is almost never the right first action. See [RB-11](rb-11-backup-restore-drill.md).
- **Do not promote the cross-region replica** unless the whole region is gone. Promotion breaks replication and is not easily reversed — see [RB-12](rb-12-region-failover.md).
- **Do not restart services in a loop.** They are failing readiness correctly; restarting them adds a reconnection storm on recovery.
- **Do not increase connection pool sizes** to "get through". The database is the constrained resource; more connections make it worse.
- **Do not disable readiness probes.** Removing unhealthy pods from the load balancer is desirable, not a problem.

## 5. Procedure

### 5.1 Confirm the failure is the database

1. Check the instance state:

```bash
gcloud sql instances describe <INSTANCE> \
  --format="value(state,settings.availabilityType,databaseVersion)"
```

**Expected in a healthy state:** `RUNNABLE  REGIONAL  POSTGRES_15`.

| State | Meaning | Go to |
| --- | --- | --- |
| `RUNNABLE` | Instance is up — the problem is connectivity, not the database | 5.2 |
| `FAILED` | Instance failed | 5.3 |
| `MAINTENANCE` | Managed maintenance in progress | 5.4 |
| `PENDING_CREATE`, `UNKNOWN` | Escalate immediately | §8 |

2. Check the GCP status dashboard for a Cloud SQL incident in `africa-south1`. A provider incident changes the response: there may be nothing to do but wait and communicate.

### 5.2 Instance is up but unreachable

3. Test connectivity from inside the cluster:

```bash
kubectl -n ngois-data exec -it deploy/pgbouncer -- \
  psql "host=<PRIVATE_IP> port=5432 user=<SVC_USER> dbname=ngois \
        sslmode=require connect_timeout=5" -c "SELECT 1;"
```

4. If that fails, check PgBouncer itself — it is the single choke point through which everything passes:

```bash
kubectl -n ngois-data get pods -l app=pgbouncer
kubectl -n ngois-data logs -l app=pgbouncer --tail=200
```

| Observation | Cause | Fix |
| --- | --- | --- |
| PgBouncer pods not running | PgBouncer is the outage, not the database | Restart: `kubectl -n ngois-data rollout restart deploy/pgbouncer` |
| `no more connections allowed` | Server connection limit reached | Go to step 5 |
| Authentication failure | A credential rotation went wrong | Follow [RB-09](rb-09-secret-rotation.md) §7 |
| `connection refused` from PgBouncer to Cloud SQL | Network path | Step 6 |

5. Check connection counts against the ceiling:

```bash
psql "$ADMIN_DB_URL" -c "
  SELECT count(*) AS total,
         count(*) FILTER (WHERE state = 'active') AS active,
         count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_txn
  FROM pg_stat_activity;"
```

**Expected:** total well under 200. A high `idle in transaction` count is the classic signature of a transaction left open across an external call, and it will exhaust the pool. If present, identify the service from `application_name` and restart it, then raise a defect — this is prohibited by [25 §25.3.2](../25-performance-and-capacity.md).

6. Verify private service access and the network policy have not changed. If a recent infrastructure apply is the cause, revert it: `git revert` the Terraform commit and apply.

7. Once connectivity is restored, go to §6.

### 5.3 Instance failed — HA failover

8. Confirm the availability type is `REGIONAL`. If it is `ZONAL`, there is no standby and this is a restore situation: go to [RB-11](rb-11-backup-restore-drill.md).

9. **Automatic failover should already be in progress.** Cloud SQL promotes the standby without intervention; it normally completes in 30–60 seconds. Wait 90 seconds and re-check:

```bash
gcloud sql instances describe <INSTANCE> --format="value(state)"
watch -n 5 'gcloud sql operations list --instance=<INSTANCE> --limit=3 \
  --format="table(name,operationType,status,startTime)"'
```

10. If failover has not started after 3 minutes, force it:

```bash
gcloud sql instances failover <INSTANCE>
```

**Expected:** an operation of type `FAILOVER` reaching `DONE` within 2 minutes.

11. During failover, do nothing to the application tier. Services fail readiness, are removed from the load balancer, and reconnect automatically when the database returns. This is the designed behaviour.

12. Go to §6.

### 5.4 Maintenance in progress

13. Check the operation:

```bash
gcloud sql operations list --instance=<INSTANCE> --limit=5
```

14. A regional HA instance should not be fully unavailable during maintenance; brief connection resets are expected. If it is fully down for more than 5 minutes during maintenance, treat it as 5.3 and force failover.

15. Verify the maintenance window is still configured for Sunday 02:00–04:00 SAST. If maintenance is running during business hours, the window configuration has drifted — raise it after the incident.

### 5.5 Replication lag

Not an availability incident, but it silently corrupts reporting, because the reporting service reads the replica.

16. Measure the lag:

```bash
gcloud sql instances describe <REPLICA> \
  --format="value(state,replicaConfiguration)"

psql "$REPLICA_URL" -c "
  SELECT now() - pg_last_xact_replay_timestamp() AS replay_lag,
         pg_is_in_recovery() AS is_replica;"
```

17. Common causes:

| Cause | Check | Action |
| --- | --- | --- |
| A long-running query on the replica blocking replay | `pg_stat_activity` on the replica | Terminate the query; it is almost always a report |
| Heavy write volume on the primary | D-04 write rate | Usually transient; monitor |
| A bulk operation such as a large backfill | Recent jobs | Expected; wait it out |
| Replica undersized | CPU on the replica | Capacity item |

18. **While lag exceeds 30 s, reports may show stale figures.** If a tenant is generating donor reports under deadline, either route reporting to the primary temporarily — accepting the load — or notify the tenant of the staleness. Do not let a donor report go out silently based on stale data.

```bash
# Temporary: point reporting at the primary. Revert once lag recovers.
kubectl -n ngois-platform set env deploy/reporting-service \
  DATABASE_READ_URL="$PRIMARY_READ_URL"
```

19. Revert this as soon as lag is normal, and record it in the incident timeline.

## 6. Verification

20. Instance state is `RUNNABLE`.
21. Every service readiness endpoint reports `database: ok`:

```bash
for s in api-gateway auth-service grant-service hr-payroll-service \
         beneficiary-service field-data-service; do
  echo -n "$s: "
  kubectl -n ngois-core exec deploy/$s -- \
    wget -qO- localhost:$(kubectl -n ngois-core get svc $s \
    -o jsonpath='{.spec.ports[0].port}')/health/ready 2>/dev/null \
    | jq -r '.checks.database.status' || echo unreachable
done
```

22. Gateway error rate back to baseline on D-01.
23. Connection count healthy and pool wait time under 10 ms on D-04.
24. **Confirm no data loss.** For a zone failover with synchronous replication the RPO is zero; verify by checking that the most recent pre-incident write is present:

```bash
psql "$DB_URL" -c "
  SELECT max(created_at) FROM audit_records;
  SELECT max(created_at) FROM outbox_events;"
```

**Expected:** timestamps at or after the last known activity before the failure.

25. Run the synthetic journeys and confirm they pass.
26. **Run the tenant isolation canary.** Any database-level intervention is a circumstance in which an RLS or role setting could have been disturbed:

```bash
kubectl -n ngois-platform create job --from=cronjob/isolation-canary \
  isolation-canary-manual-$(date +%s)
```

**Expected:** job completes successfully. A failure is an immediate SEV-1 and goes to [RB-14](rb-14-security-incident.md).

27. Confirm event consumer lag recovers; a database outage stalls consumers, and they should drain within a few minutes. If not, go to [RB-02](rb-02-dlq-drain-and-replay.md).

## 7. Rollback

Failover is not reversible in the sense of undoing it, and it does not need to be — the promoted standby becomes the primary and a new standby is provisioned automatically. If reporting was repointed at the primary in step 18, revert that.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Failover does not complete within 5 minutes | Data Architect **and** Platform Lead |
| Instance state `UNKNOWN` or a failed failover operation | Data Architect, Platform Lead, and open a GCP support case at P1 |
| Any indication of data loss | Chief Architect; treat as SEV-1 data incident; [RB-11](rb-11-backup-restore-drill.md) |
| Isolation canary fails after recovery | Security Lead immediately; [RB-14](rb-14-security-incident.md) |
| Region-wide Cloud SQL incident | Platform Lead; consider [RB-12](rb-12-region-failover.md) |
| Unresolved after 60 minutes | Platform Lead **and** Executive Director |

## 9. Follow-up

- Postmortem required — this is a SEV-1 by definition.
- Confirm a new standby has been provisioned and HA is restored, not just that service is back.
- If the cause was `idle in transaction` exhaustion, the action item is a defect against the offending service plus a lint rule, not a pool size increase.
- Check whether the automatic failover behaved as chaos experiment CH-3 predicted; if in-flight transactions did not fail cleanly, that is a defect.
- Record the actual failover duration against the 60-second target.
