# RB-12 — Regional Failover

| | |
| --- | --- |
| **ID** | RB-12 |
| **Applies to** | Confirmed extended failure of `africa-south1` |
| **Severity** | SEV-1 |
| **Owner** | Platform Lead |
| **Expected duration** | ~4 hours |
| **Last verified** | 2026-06-15, quarterly drill in staging, 3 h 41 m |
| **Related** | [27 §27.6](../27-disaster-recovery-and-bcp.md), [ADR-0016](../adr/0016-single-region-with-warm-dr.md) |

---

## 1. When this runs

Only for a **confirmed, extended** regional failure. This is the most disruptive procedure in the set, it is partially irreversible, and it carries up to 5 minutes of data loss because cross-region replication is asynchronous.

**Do not invoke this for:**

| Situation | Correct runbook |
| --- | --- |
| Cloud SQL primary failure in one zone | [RB-03](rb-03-database-failover.md) — automatic HA failover |
| A single zone failure | Nothing; the regional cluster absorbs it |
| A service failure | [RB-13](rb-13-service-down.md) |
| Network or connectivity problems on our side | [RB-13](rb-13-service-down.md) §5.2 |
| A Cloudflare failure | [RB-04](rb-04-certificate-rotation.md) §5.5 fallback, or the direct-to-LB bypass |

## 2. Authorisation

**Declaration is a Platform Lead decision**, with the Executive Director informed before execution. If the Platform Lead is unreachable, the Chief Architect may declare. The on-call engineer does not declare a regional failover alone, because the data-loss implication is a business decision.

## 3. Prerequisites

- Confirmed regional failure: provider status page, plus external synthetic checks failing from multiple regions, plus at least 15 minutes of sustained failure.
- Break-glass GCP access.
- Terraform repository access and a working local or cloud-shell environment.
- Cloudflare access for DNS.
- Incident channel open, roles assigned ([26 §26.4.2](../26-reliability-and-incident-management.md)).

## 4. Do not

- **Do not promote the replica before fencing the primary region.** A partially recovered primary accepting writes while the replica is also primary is a split brain, and reconciling two divergent databases is far worse than the outage.
- **Do not skip the isolation canary in verification.** A hurried infrastructure rebuild is precisely when an RLS setting or role grant gets misapplied.
- **Do not skip the decryption check.** The KMS keys are multi-regional, but verify rather than assume.
- **Do not fail back the same day.** Failback is planned, and only after the original region has been stable for seven days.
- **Do not tell tenants "no data loss"** without checking the replication lag at promotion. State the actual number.
- **Do not delete anything in the primary region.** It will be needed for reconciliation and for failback.

## 5. Procedure

### 5.1 Confirm — 0 to 15 minutes

1. Verify it is genuinely regional and not us:

```bash
# External synthetics from multiple regions
curl -s "$SYNTHETIC_API/checks?status=failing" | jq '.[] | {name, from_region}'

# Provider status
open https://status.cloud.google.com/

# Is anything in the region responding?
gcloud container clusters describe ngois-prod --region=africa-south1 \
  --format="value(status)" || echo "cluster unreachable"
gcloud sql instances describe ngois-prod-pg \
  --format="value(state)" || echo "instance unreachable"
```

2. Confirm the DR region is healthy:

```bash
gcloud sql instances describe ngois-prod-pg-replica-euw4 \
  --format="value(state,region,replicaConfiguration)"
```

**Expected:** `RUNNABLE`, `europe-west4`, replicating.

3. **Record the replication lag now**, before anything changes. This number is the data loss:

```bash
psql "$REPLICA_URL" -c "
  SELECT now() - pg_last_xact_replay_timestamp() AS lag,
         pg_last_xact_replay_timestamp()         AS last_replayed;"
```

Write both values into the incident timeline. They determine what you tell tenants.

4. Require 15 minutes of sustained failure before declaring. Regional incidents sometimes resolve in under ten, and a failover executed against a recovering region is worse than waiting.

### 5.2 Declare — 15 to 25 minutes

5. Declare SEV-1, assign roles, notify the Executive Director.

6. Notify tenants immediately. Honesty about the estimate matters more than optimism:

```
Subject: [Major outage] Platform unavailable — recovery in progress

What is happening
A failure at our hosting provider's Johannesburg region has made the
platform unavailable. We are recovering into our secondary region.

Who is affected
All users of all modules.

What still works
Field officers can continue capturing data offline on their devices
as normal. That data is safe and will sync once service is restored.

Expected restoration
Approximately 4 hours from now (by <TIME> EAT).

Data
We will confirm the exact position when recovery completes. Our
replication window means at most 5 minutes of the most recent
changes may be affected.

Next update
Hourly, or sooner if the situation changes.
```

7. Update the status page. Post the offline-capability point prominently — for many users it is the difference between a lost day and a normal one.

### 5.3 Fence the primary — 20 to 25 minutes

8. Prevent the primary region from accepting writes if it partially recovers:

```bash
# Remove the primary's backend from the load balancer.
gcloud compute backend-services remove-backend ngois-prod-backend \
  --network-endpoint-group=ngois-prod-neg-africa-south1 \
  --network-endpoint-group-zone=africa-south1-a --global

# If the cluster is reachable at all, scale the gateway to zero.
kubectl --context=africa-south1 -n ngois-edge \
  scale deploy/api-gateway --replicas=0 || true
```

9. Record that fencing was performed and by what method. If the region is entirely unreachable, note that fencing was implicit.

### 5.4 Build the DR region — 25 to 70 minutes

10. Apply Terraform for the DR environment:

```bash
cd infra/envs/production-dr
terraform init
terraform plan  -out=dr.plan
# Review the plan. Even under pressure, read it.
terraform apply dr.plan
```

**Expected:** VPC and subnets (may already exist), GKE regional cluster with the four node pools, Memorystore Redis, Cloud NAT, and service accounts with Workload Identity. Roughly 30–45 minutes, dominated by cluster creation.

11. While Terraform runs, prepare the next steps rather than watching it. Confirm the schema version the replica holds:

```bash
psql "$REPLICA_URL" -c "SELECT max(version) FROM schema_migrations;"
```

Compare against the deployed application version's expectation. A behind-replica needs step 14.

### 5.5 Promote the replica — 70 to 85 minutes

12. **Re-confirm the primary is fenced.** This is the last checkpoint before an irreversible action.

13. Promote:

```bash
# Record the lag one final time — this is the authoritative data-loss figure.
psql "$REPLICA_URL" -c "SELECT now() - pg_last_xact_replay_timestamp() AS final_lag;"

gcloud sql instances promote-replica ngois-prod-pg-replica-euw4
```

**Expected:** the operation completes in 1–3 minutes and the instance becomes a standalone primary. **Replication is now broken and cannot be resumed** — failback requires establishing reverse replication.

14. Apply any missing migrations:

```bash
kubectl --context=europe-west4 -n ngois-core create job migrate-$(date +%s) \
  --from=cronjob/schema-migrate
kubectl --context=europe-west4 -n ngois-core logs -f job/migrate-<ID>
```

15. Enable HA and configure backups on the new primary. It was a replica and has neither:

```bash
gcloud sql instances patch ngois-prod-pg-replica-euw4 \
  --availability-type=REGIONAL \
  --backup-start-time=02:00 \
  --enable-point-in-time-recovery
```

**Do not skip this.** Running the platform on a non-HA instance with no backups, having just survived a disaster, is an unacceptable position to be in for any length of time.

### 5.6 Deploy the application — 85 to 120 minutes

16. Point Argo CD at the new cluster and sync:

```bash
argocd cluster add <DR_CONTEXT> --name ngois-prod-dr
argocd app set ngois-prod-<APP> --dest-server <DR_CLUSTER_URL>
argocd app sync -l env=production --prune=false
argocd app wait -l env=production --health --timeout 900
```

17. Update configuration endpoints — the database and Redis hosts have changed:

```bash
# These live in the DR ConfigMap, applied by Terraform. Verify rather than edit.
kubectl --context=europe-west4 -n ngois-core get configmap platform-config \
  -o jsonpath='{.data.DATABASE_HOST}{"\n"}{.data.REDIS_HOST}'
```

18. Confirm secrets are syncing in the new cluster:

```bash
kubectl --context=europe-west4 -n ngois-core get externalsecrets
```

**Expected:** all `SecretSynced`. Secret Manager and KMS are multi-regional, so this should work without intervention.

19. Wait for all services ready. Redis is empty, so expect cold caches and elevated latency for the first several minutes — that is normal, not a fault.

### 5.7 Verify before DNS — 120 to 150 minutes

**Nothing is exposed to users until this section passes completely.**

20. Health and readiness across all services.

21. Synthetic journeys against the DR endpoint directly, bypassing DNS:

```bash
npm run test:e2e:smoke -- --base-url="https://<DR_LB_IP>" --host-header="app.ngointelligence.org"
```

22. **Decryption check** per affected tenant:

```bash
for t in <TENANT_ID_1> <TENANT_ID_2> <TENANT_ID_3>; do
  echo -n "$t: "
  curl -s -H "Authorization: Bearer $BG_TOKEN" \
    "https://<DR_LB_IP>/v1/beneficiary/beneficiaries?limit=1&tenant=$t" \
    -H "Host: app.ngointelligence.org" | jq -r '.data[0].first_name != null'
done
```

**Expected:** `true` for every tenant.

23. **RLS verification** on the promoted instance:

```bash
psql "$NEW_PRIMARY_URL" -c "
  SELECT c.relname
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);"
```

**Expected:** zero rows. **Any result blocks the DNS cutover.**

24. **Tenant isolation canary:**

```bash
kubectl --context=europe-west4 -n ngois-platform create job \
  --from=cronjob/isolation-canary isolation-canary-dr-$(date +%s)
kubectl --context=europe-west4 -n ngois-platform wait --for=condition=complete \
  job/isolation-canary-dr-<ID> --timeout=300s
```

**Expected:** completes successfully. A failure blocks the cutover and becomes [RB-14](rb-14-security-incident.md).

25. Audit chain integrity:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "https://<DR_LB_IP>/v1/audit/verify-chain?from=<YESTERDAY>" \
  -H "Host: app.ngointelligence.org" | jq .
```

26. Event system: streams are empty in the new Redis, but `outbox_events` in the promoted database holds anything unpublished. Confirm the relays are publishing:

```bash
psql "$NEW_PRIMARY_URL" -c "
  SELECT count(*) FROM outbox_events WHERE published_at IS NULL;"
```

**Expected:** a count that falls over the next few minutes as relays catch up.

### 5.8 Cut over DNS — 150 to 165 minutes

27. Lower the TTL first if it is not already low, then repoint:

```bash
# Via the Cloudflare API or dashboard: point app.ngointelligence.org
# at the DR load balancer IP, TTL 60.
curl -s -X PATCH "https://api.cloudflare.com/client/v4/zones/$ZONE/dns_records/$REC" \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  -d '{"content":"<DR_LB_IP>","ttl":60}' | jq '.success'
```

28. Verify propagation from multiple resolvers:

```bash
for r in 1.1.1.1 8.8.8.8 9.9.9.9; do
  echo -n "$r: "; dig +short @$r app.ngointelligence.org | head -1
done
```

29. Confirm from outside: synthetic checks green, and a real login through the public URL.

### 5.9 Restore and communicate — 165 to 240 minutes

30. Confirm with a pilot tenant before the general announcement. One real user completing a real task is worth more than any check above.

31. Notify tenants of restoration, **stating the data loss explicitly**:

```
Subject: [Resolved] Platform restored

The platform is available again. Please clear your browser cache
if you see anything unexpected.

Data position
Changes saved between <T1> EAT and <T2> EAT — a window of
approximately <N> minutes — were not carried over. If you made
changes in that window, please check and re-enter them. We can
provide a list of affected records on request.

Field data
No field data was lost. Devices will sync normally.

Current status
We are running from our secondary region. Performance may be
slightly slower for users in East Africa. We will return to the
primary region in a planned operation once it is stable, with
advance notice.
```

32. Recompute derived aggregates and dashboards:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/analytics/recompute" -d '{"scope":"all_tenants"}' | jq .
```

33. Expect a **sync surge** as field devices reconnect. Pre-scale `field-data-service` ahead of it:

```bash
kubectl --context=europe-west4 -n ngois-core patch hpa field-data-service \
  --type=merge -p '{"spec":{"minReplicas":6}}'
```

34. Identify the records in the loss window from the audit trail on the primary once it recovers, and offer affected tenants the list. This is what converts "some data may be missing" into something a tenant can actually act on.

## 6. Verification summary

| # | Check | Expected |
| --- | --- | --- |
| 35 | All services ready in DR | Yes |
| 36 | Public URL resolving to DR | Yes, from multiple resolvers |
| 37 | Synthetic journeys | All passing |
| 38 | Decryption per tenant | Working |
| 39 | RLS enabled and forced everywhere | Yes |
| 40 | Isolation canary | Passing |
| 41 | Audit chain | Valid |
| 42 | Outbox draining | Yes |
| 43 | HA and backups enabled on the new primary | Yes |
| 44 | Field sync working | Confirmed by a real device |
| 45 | Pilot tenant confirmation | Received |
| 46 | Replication lag at promotion | Recorded and communicated |
| 47 | Elapsed time against the 4 h RTO | Recorded |

## 7. Rollback

There is no rollback in the sense of undoing the failover. Once the replica is promoted, replication is broken and the DR region holds the authoritative data. Returning to the primary region is **failback**, a separate planned operation:

1. Rebuild or verify the primary region.
2. Establish reverse replication from `europe-west4` to `africa-south1`.
3. Wait for it to catch up and remain caught up.
4. **Wait for seven days of stability in the original region.**
5. Execute a planned maintenance-window cutover with the same verification pass.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Terraform apply fails in the DR region | Platform Lead **and** Chief Architect |
| Replica promotion fails | Data Architect; open a GCP P1 support case |
| Decryption fails on the promoted instance | Security Lead **and** Data Architect. **Halt the cutover** |
| RLS check or isolation canary fails | Security Lead. **Halt the cutover.** [RB-14](rb-14-security-incident.md) |
| Data loss exceeds 5 minutes | Chief Architect **and** Executive Director; this is an RPO breach |
| Both regions affected | Executive Director; there is no recovery path within the current architecture ([27 §27.10.1](../27-disaster-recovery-and-bcp.md)) |
| Exceeding the 4 h RTO | Executive Director; revise the tenant communication |

## 9. Follow-up

- Postmortem, with the provider's incident report attached.
- Record actual elapsed time per phase against the drill baseline. A real event slower than the drill indicates the drill is unrealistic.
- Provide affected tenants with the specific records in the loss window.
- **Plan failback.** Do not leave it indefinite; the DR region has less headroom and higher latency for East African users.
- Reassess the active-active decision in [ADR-0016](../adr/0016-single-region-with-warm-dr.md) with real data about what a regional failure costs.
- Update this runbook the same day with everything that was wrong or missing.
