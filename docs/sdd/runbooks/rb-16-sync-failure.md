# RB-16 — Field Sync Failure

| | |
| --- | --- |
| **ID** | RB-16 |
| **Applies to** | `SyncFailureRateHigh`, `SyncVolumeAnomalous`, field officers reporting sync failures |
| **Severity** | **SEV-2, escalating to SEV-1 after 6 hours** |
| **Owner** | Platform Lead |
| **Expected duration** | 30–120 minutes |
| **Last verified** | 2026-05-28, staging with the offline harness |
| **Related** | [13](../13-offline-first-architecture.md), [27 §27.8](../27-disaster-recovery-and-bcp.md) |

---

## 1. Why this escalates

Field devices hold captured data for **72 hours** by design. Beyond that the offline budget begins to be consumed, and data loss becomes possible if a device is lost, damaged or reset before it can sync ([13 §13.8](../13-offline-first-architecture.md)).

This is why sync has a higher SLO (99.5 per cent) than general platform availability, and why a sync failure escalates on a clock:

| Elapsed | Severity | Reason |
| --- | --- | --- |
| 0–6 h | SEV-2 | Well within the device budget |
| 6 h+ | **SEV-1** | The budget is being consumed and field teams need to be told |
| 48 h+ | SEV-1 with continuity planning | Prepare tenants for the paper fallback ([27 §27.8](../27-disaster-recovery-and-bcp.md)) |

**Start the clock now** and record it in the incident timeline.

## 2. Symptoms

- Sync session failure rate above 10 per cent for 15 minutes.
- Submission arrival rate below 20 per cent of the same weekday baseline for 2 hours.
- Field officers reporting a sync that never completes, or that reports success without the data appearing.
- `field-data-service` errors on the sync endpoints.

## 3. The absence case

`SyncVolumeAnomalous` deserves separate attention because **nothing is erroring**. Submissions have simply stopped arriving, and no conventional error-rate alert would notice. The causes are quite different:

| Cause | How to distinguish |
| --- | --- |
| A client-side defect after an app update | Correlates with a frontend release; devices on the old version still sync |
| An authentication problem affecting devices | Auth failures in logs from device user agents |
| A real-world event affecting field teams | No technical signal at all; confirm with the tenant |
| A programme pause or holiday | Check the calendar before declaring an incident |
| Devices unable to reach us — DNS, certificate, or a provider issue on their route | Synthetic checks from the region |

Rule out the mundane before investigating deeply. A public holiday in South Sudan looks exactly like a total sync failure.

## 4. Prerequisites

- Grafana (D-09, Field operations).
- Break-glass Kubernetes read.
- Contact for at least one field supervisor per affected tenant.
- A test device, or the offline harness in staging.

## 5. Do not

- **Do not turn off `offline_sync_enabled`** except as a genuine last resort to protect the database. Devices will retain data and retry, but if it stays off past the 72-hour budget, data loss becomes possible ([20 §20.5.2](../20-configuration-secrets-feature-flags.md)).
- **Do not instruct field officers to clear app data, reinstall, or log out.** Any of these can destroy unsynced local data. This is the single most damaging piece of well-meant support advice available.
- **Do not deploy a frontend change** while diagnosing a client-side sync problem; you will lose the ability to compare versions.
- **Do not assume a reported success means data arrived.** Verify server-side counts.
- **Do not resolve conflicts on behalf of field teams.** Conflict resolution is a programme decision ([13 §13.5](../13-offline-first-architecture.md)).

## 6. Procedure

### 6.1 Establish the shape of the failure

1. Open **D-09** and answer:

```bash
# Failure rate and where it fails
curl -s "$PROM/api/v1/query?query=sum(rate(ngois_sync_sessions_total[15m]))by(result)" | jq .

# Are submissions arriving at all?
curl -s "$PROM/api/v1/query?query=sum(rate(ngois_submissions_accepted_total[1h]))by(source)" | jq .

# How long has data been waiting on devices?
curl -s "$PROM/api/v1/query?query=histogram_quantile(0.95,rate(ngois_sync_queue_age_seconds_bucket[1h]))" | jq .
```

**The queue-age figure is the important one** — it tells you how much of the 72-hour budget is consumed.

2. Classify:

| Observation | Cause class | Go to |
| --- | --- | --- |
| Sync requests arriving and failing with 5xx | Server-side | 6.2 |
| Sync requests arriving and failing with 4xx | Validation, auth or version | 6.3 |
| **No sync requests arriving at all** | Client-side or connectivity | 6.4 |
| Sync succeeding but data not appearing | Event processing | 6.5 |
| Sync slow but succeeding | Performance | 6.6 |
| One tenant only | Tenant-specific | 6.7 |

### 6.2 Server-side failures

3. Check `field-data-service`:

```bash
kubectl -n ngois-core get pods -l app=field-data-service
kubectl -n ngois-core logs -l app=field-data-service --tail=200 | \
  grep -E 'error|sync'
```

4. If the service is unhealthy, go to [RB-13](rb-13-service-down.md). If the database or Redis is the cause, go to [RB-03](rb-03-database-failover.md) or [RB-08](rb-08-scale-event.md) §5.4.

5. Common sync-specific server failures:

| Error | Cause | Fix |
| --- | --- | --- |
| Statement timeout on batch insert | Batch too large, or database pressure | Reduce the accepted batch size; address the pressure |
| Encryption failure | KMS unavailable or a key disabled | Check KMS; PII cannot be written without it |
| Constraint violation on `client_uuid` | Should be handled idempotently — this is a defect | Escalate; the idempotency path is broken |
| Pool exhaustion under a sync burst | Capacity | [RB-08](rb-08-scale-event.md); scale on stream lag |
| Outbox insert failure | Database write problem | [RB-03](rb-03-database-failover.md) |

6. If it is a burst rather than a fault, scale:

```bash
kubectl -n ngois-core patch hpa field-data-service --type=merge \
  -p '{"spec":{"minReplicas":6,"maxReplicas":14}}'
```

**Expected:** failure rate falling within 3 minutes. A sync storm is a known load pattern ([25 §25.4.2](../25-performance-and-capacity.md)); if the HPA did not react, its stream-lag trigger needs review.

### 6.3 Client requests rejected — 4xx

7. Identify the rejection reason:

```bash
logcli query '{service="field-data-service"} | json | http_status>=400 and http_status<500' --since=1h | \
  jq -r '.error_code' | sort | uniq -c | sort -rn
```

8. By code:

| Code | Cause | Action |
| --- | --- | --- |
| 401 | Device token expired while offline | Officers must re-authenticate. **Local data is preserved** — say so explicitly when telling them |
| 403 | Permission changed while offline | Check whether a role change removed their submission permission |
| `NGOIS-FLD-0031` | Submission against an unknown form version | **This should be accepted.** The server accepts against the version captured ([13 §13.5.2](../13-offline-first-architecture.md)). A rejection is a defect — escalate |
| `NGOIS-FLD-0042` | Validation failure on a field | Check whether a form was republished with a stricter rule. **Do not reject days of captured work over a new validation rule**; relax it or accept with a flag |
| 409 | Idempotency conflict | Should be handled transparently; a surfaced 409 is a defect |
| 413 | Payload too large | Batch size or an attachment; check the client's chunking |
| 429 | Rate limited | Check the tenant's rate tier against their device count |

9. The form-version and validation cases are the ones most likely to be a genuine design failure. The rule is that **a submission binds to the form version it was captured against**, and a later change must not invalidate it. If it has, that is a SEV-2 defect and a hotfix candidate.

### 6.4 No requests arriving

10. First rule out the mundane: is it a holiday, a programme pause, or the weekend? Confirm with the tenant before treating it as technical.

11. Verify the platform is reachable from the field's perspective:

```bash
# Synthetic checks from the African region specifically
curl -s "$SYNTHETIC_API/checks?region=af-south&status=failing" | jq .

# DNS from multiple resolvers
for r in 1.1.1.1 8.8.8.8; do dig +short @$r app.ngointelligence.org; done

# Certificate valid
echo | openssl s_client -servername app.ngointelligence.org \
  -connect app.ngointelligence.org:443 2>/dev/null | \
  openssl x509 -noout -dates
```

An expired or untrusted certificate is a particularly nasty cause here, because a PWA on a device with an out-of-date trust store may fail while desktop browsers work fine.

12. Check whether a frontend release correlates:

```bash
argocd app history ngois-prod-frontend | head -5
```

Compare sync arrival by client version:

```bash
logcli query '{service="field-data-service"} | json | operation="sync.batch"' --since=6h | \
  jq -r '.context.client_version' | sort | uniq -c
```

**If only the new version has stopped syncing, roll back the frontend immediately.** Do not diagnose first.

```bash
argocd app rollback ngois-prod-frontend <PREVIOUS_REVISION>
```

13. Test with a real device against production. The offline harness in staging will not reproduce a device-specific trust store or a service worker caching problem.

14. Contact a field supervisor and ask what the officers actually see. The error message on the device is the most direct diagnostic available and is frequently more informative than any server log.

### 6.5 Sync succeeds but data does not appear

15. Confirm the submissions are actually stored — they are committed before any event is published, so they should be present:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT count(*), max(received_at), max(captured_at)
  FROM submissions
  WHERE received_at > now() - interval '6 hours';"
```

**Expected:** counts matching what officers report submitting. **If the rows are there, no data is lost** — this is a visibility problem, not a data problem, and the communication to tenants should say exactly that.

16. Check event processing, which is what populates dashboards and aggregates:

```bash
curl -s "$PROM/api/v1/query?query=ngois_stream_consumer_lag{stream=\"fielddata.events\"}" | jq .
```

If lag is high, go to [RB-02](rb-02-dlq-drain-and-replay.md).

17. Check whether the submissions are flagged for review rather than missing. Probable duplicates are accepted and flagged, never silently dropped ([13 §13.6](../13-offline-first-architecture.md)):

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT review_status, count(*)
  FROM submissions
  WHERE received_at > now() - interval '6 hours'
  GROUP BY review_status;"
```

A large `pending_review` count means the deduplication threshold is flagging too aggressively — worth reviewing, but not data loss.

### 6.6 Sync slow but succeeding

18. Check batch latency against the budget:

```bash
curl -s "$PROM/api/v1/query?query=histogram_quantile(0.95,rate(ngois_sync_batch_duration_seconds_bucket[15m]))" | jq .
```

**Expected:** p95 under 3 s per batch ([25 §25.2.2](../25-performance-and-capacity.md)).

19. Slow sync on a 2G connection may be entirely normal — 40 submissions over 50 kbps takes time by physics, not by defect. Distinguish server processing time from transfer time using the trace rather than the total.

20. If server-side latency is the problem, it is usually database pressure: [RB-08](rb-08-scale-event.md).

### 6.7 One tenant only

21. Check their quotas and rate tier:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/quota-usage" | jq .
```

22. Check their device registrations — an unregistered or revoked device cannot sync:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/devices" | \
  jq '.data[] | {id, last_sync_at, status, unsynced_count}'
```

23. Check whether their configuration changed — an offline TTL reduction, a cache limit change, or a module being disabled.

## 7. Communicating with field teams

This is not optional, and it needs to happen early rather than at resolution.

24. Notify the affected tenants' supervisors within 30 minutes, with these points:

```
Field data sync is currently failing.

IMPORTANT — please pass to all field officers:

  - Keep capturing data as normal. It is saved on the device.
  - DO NOT log out.
  - DO NOT clear app data or storage.
  - DO NOT uninstall or reinstall the app.
  - Do not worry if sync shows an error; retrying is safe.

Data captured on devices is safe for at least 72 hours. We expect
to restore sync well within that window and will confirm when
officers can sync.

Current position: data has been waiting approximately <N> hours.
Next update: <TIME>.
```

25. The four "do not" instructions are the most important content in this runbook. A well-meaning supervisor telling officers to reinstall the app to fix it will destroy days of work.

26. **At 48 hours**, brief tenants on the paper fallback ([27 §27.8.1](../27-disaster-recovery-and-bcp.md)) so they can prepare rather than being surprised at hour 71.

27. On resolution, confirm to supervisors that officers should sync, and ask them to report back whether it worked. Their confirmation is the real verification.

## 8. Verification

28. Sync session success rate above 99 per cent:

```bash
curl -s "$PROM/api/v1/query?query=sum(rate(ngois_sync_sessions_total{result=\"completed\"}[15m]))/sum(rate(ngois_sync_sessions_total[15m]))" | jq -r '.data.result[0].value[1]'
```

29. Submission arrival rate back to the weekday baseline on D-09.
30. Queue age p95 falling toward zero as the backlog clears.
31. Batch latency p95 under 3 s.
32. Event consumer lag on `fielddata.events` recovering.
33. **Reconcile counts with a field supervisor.** Ask them how many submissions a given officer had pending and confirm that number arrived. This is the only verification that actually proves nothing was lost:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT s.created_by, count(*), min(captured_at), max(captured_at)
  FROM submissions s
  WHERE received_at > now() - interval '2 hours'
  GROUP BY s.created_by ORDER BY count(*) DESC;"
```

34. Confirm no device still shows unsynced data:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/devices?unsynced=true" | jq '.data | length'
```

**Expected:** `0`, or only devices genuinely still offline in the field.

35. Confirm `offline_sync_enabled` is **on** if it was ever turned off.
36. Conflicts flagged during the backlog clearance are routed to the tenant for resolution, not resolved by us.

## 9. Rollback

If a frontend rollback was performed, keep the previous version deployed until the client-side defect is understood. Server-side scaling changes are reverted or committed within 24 hours ([RB-08](rb-08-scale-event.md) §9).

## 10. Escalation

| Condition | Escalate to |
| --- | --- |
| Unresolved after 6 hours | **Escalate to SEV-1**; Platform Lead and Executive Director |
| Any confirmed loss of captured field data | Chief Architect and Executive Director. **SEV-1 data loss** — the submission durability SLO is 100 per cent ([24 §24.8.1](../24-observability.md)) |
| A submission rejected because a form was republished | Chief Architect; this violates a design rule and is a hotfix candidate |
| `offline_sync_enabled` needs to be turned off | Platform Lead approval required. Record the data-loss risk explicitly |
| Approaching 48 hours | Executive Director; brief tenants on continuity |
| A client-side defect requiring an app change | Frontend Lead; consider whether devices can update at all on their connectivity |
| Support advice may have caused officers to clear data | Executive Director immediately. Assess what was lost and how much |

## 11. Follow-up

- Postmortem for any SEV-2. **Any data loss requires an SLO breach review** ([24 §24.8.2](../24-observability.md)).
- If the offline harness did not catch the cause, extend it ([23 §23.8](../23-testing-strategy.md)). The scenario table there exists for exactly this purpose.
- If a client-side defect, review why E2E offline tests passed.
- If a form-version or validation rejection occurred, fix the binding rule and add a test.
- Review whether the 72-hour budget is adequate for the tenant's actual field patterns; some programmes are away for longer.
- Feed the observed sync burst profile into the capacity model.
- **Update the support script** if any support advice risked data loss. This is the follow-up most likely to prevent real harm next time.
