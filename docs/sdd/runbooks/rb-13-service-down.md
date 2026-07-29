# RB-13 — Service Unavailable or Crash Looping

| | |
| --- | --- |
| **ID** | RB-13 |
| **Applies to** | `PlatformDown`, `Tier1ServiceDown`, `Tier1ErrorRateHigh`, `PodCrashLooping` |
| **Severity** | SEV-1 for a Tier 1 service or the platform; SEV-2 otherwise |
| **Owner** | Platform Lead |
| **Expected duration** | 10–45 minutes |
| **Last verified** | 2026-06-02, staging |
| **Related** | [26 §26.4.1](../26-reliability-and-incident-management.md), [21 §21.4](../21-deployment-and-infrastructure.md) |

---

## 1. Symptoms

- A service has zero ready replicas.
- Pods restarting repeatedly, `CrashLoopBackOff`.
- 5xx rate above 5 per cent for a service.
- Gateway availability below 50 per cent.
- Readiness probes failing across a service.

## 2. Impact

Per the service tier ([06 §6.2](../06-microservice-design.md)):

| Down | Effect |
| --- | --- |
| `api-gateway` | **Total outage.** Nothing is reachable |
| `auth-service` | No new logins; existing sessions work for up to 15 minutes |
| `grant-service`, `beneficiary-service`, `field-data-service`, `hr-payroll-service` | That module unavailable. **Field devices continue capturing offline** |
| Tier 2 | Degraded: reports, notifications, files or audit writes delayed |
| `ai-insights-service` | AI drafting unavailable; nothing else affected |

## 3. Prerequisites

- Grafana (D-01, D-02).
- Break-glass Kubernetes read; write for restarts and rollbacks.
- Argo CD access.

## 4. Do not

- **Do not restart in a loop.** If a pod crashes on startup, restarting it repeatedly produces no new information and delays diagnosis.
- **Do not disable the readiness probe** to force traffic to an unhealthy pod. Removing a broken pod from the load balancer is the probe doing its job.
- **Do not scale up a crash-looping service.** More crashing pods is not more capacity.
- **Do not `kubectl edit` the deployment.** Argo reverts it later at an unpredictable moment. Change Git, or use `argo rollouts undo`.
- **Do not delete a PersistentVolumeClaim** to "clean state". No service here holds durable local state, so if you find yourself considering this, you have misdiagnosed.

## 5. Procedure

### 5.1 Two-minute triage

1. Establish scope. **One service or everything?**

```bash
kubectl get pods -A -l 'tier in (core,platform,edge)' \
  --field-selector=status.phase!=Running
kubectl get deploy -A -o custom-columns=\
'NS:.metadata.namespace,NAME:.metadata.name,READY:.status.readyReplicas,DESIRED:.spec.replicas' \
  | awk '$3!=$4'
```

| Observation | Meaning | Go to |
| --- | --- | --- |
| Many services unhealthy | A shared dependency is the cause, not the services | 5.2 |
| One service unhealthy | Service-specific | 5.3 |
| Pods `Pending`, not crashing | Scheduling or capacity | [RB-08](rb-08-scale-event.md) §5.6 |
| Pods running but failing readiness | A dependency this service needs | 5.2, then 5.4 |

2. **Check what changed.** This resolves the majority of incidents:

```bash
argocd app history ngois-prod-<SERVICE> | head -5
kubectl -n <NS> rollout history deploy/<SERVICE> | tail -5
```

3. **If anything was deployed in the last two hours, roll back now.** Do not diagnose first:

```bash
kubectl argo rollouts undo <SERVICE> -n <NS>
kubectl argo rollouts status <SERVICE> -n <NS> --timeout=300s
```

**Expected:** healthy within 2–3 minutes. Rolling back before understanding is correct on expected value: it is fast, safe because migrations are backward-compatible, and eliminates the most probable cause ([26 §26.4.1](../26-reliability-and-incident-management.md)).

If rollback resolves it, go to §6 and diagnose afterwards from the failed image.

### 5.2 Many services affected — find the shared dependency

4. Check the dependencies in order of likelihood:

```bash
# Database
gcloud sql instances describe ngois-prod-pg --format="value(state)"

# Redis
gcloud redis instances describe ngois-prod-redis --region=<REGION> \
  --format="value(state)"

# What do the services themselves say?
for s in grant-service beneficiary-service field-data-service; do
  echo "=== $s"
  kubectl -n ngois-core exec deploy/$s -- \
    wget -qO- localhost:<PORT>/health/ready 2>/dev/null | jq -c '.checks' \
    || echo "unreachable"
done
```

**Expected:** the readiness output names the failing dependency, which is precisely why readiness reports per-dependency detail ([24 §24.5](../24-observability.md)).

| Failing dependency | Go to |
| --- | --- |
| `database` | [RB-03](rb-03-database-failover.md) |
| `redis` | [RB-08](rb-08-scale-event.md) §5.4, or check Memorystore state |
| `migrations` | Step 5 |
| Node-level problem | Step 6 |
| Certificate errors in logs | [RB-04](rb-04-certificate-rotation.md) §5.3 |
| Nothing — services report ready but the gateway 5xxs | Step 7 |

5. Migration mismatch — services block at startup until the expected schema version is present:

```bash
kubectl -n ngois-core get pods -l app=<SERVICE> \
  -o jsonpath='{.items[*].status.initContainerStatuses[*].state}' | jq .
psql "$DB_URL" -c "SELECT max(version), max(applied_at) FROM schema_migrations;"
kubectl -n ngois-core get jobs | grep migrate
```

If a migration job failed, that is the root cause — check its logs and fix it before anything else. Services correctly refuse to start against a schema they do not understand.

6. Node problems:

```bash
kubectl get nodes -o wide
kubectl describe nodes | grep -E 'Taints|Conditions|MemoryPressure|DiskPressure'
kubectl get events -A --sort-by=.lastTimestamp | tail -30
```

If a node is unhealthy, cordon and drain it. PDBs will pace the eviction, which is the intended behaviour — do not override them:

```bash
kubectl cordon <NODE>
kubectl drain <NODE> --ignore-daemonsets --delete-emptydir-data --timeout=300s
```

7. Gateway 5xx with healthy upstreams — the gateway itself, or its view of the upstreams:

```bash
kubectl -n ngois-edge logs -l app=api-gateway --tail=200 | \
  grep -E 'upstream|circuit|timeout'
curl -s "$PROM/api/v1/query?query=ngois_gateway_circuit_breaker_state" | \
  jq -r '.data.result[] | "\(.metric.service) \(.value[1])"'
```

**Expected:** all `0` (closed). A stuck-open breaker after the upstream has recovered is a defect; restarting the gateway clears it and the defect is raised afterwards.

### 5.3 A single service is crash looping

8. **Get the logs from the previous, crashed container** — the running one has no history:

```bash
kubectl -n <NS> logs -l app=<SERVICE> --previous --tail=200
kubectl -n <NS> describe pod -l app=<SERVICE> | tail -40
```

9. Read the exit code and the reason:

| Exit code / reason | Cause | Action |
| --- | --- | --- |
| **78** | **Configuration validation failed** ([20 §20.2.1](../20-configuration-secrets-feature-flags.md)). The log names the offending field | Step 10 |
| 137 / `OOMKilled` | Memory limit exceeded | Step 11 |
| 139 | Segmentation fault, usually a native module | Roll back; escalate |
| 1 with a stack trace | Application error at startup | Step 12 |
| `CreateContainerConfigError` | A missing secret or ConfigMap | Step 13 |
| `ImagePullBackOff` | Image unavailable or unsigned | Step 14 |
| No logs at all | Failing before the logger initialises, or an admission rejection | Step 14 |

10. Configuration failure. The error names field names, never values:

```bash
kubectl -n <NS> logs -l app=<SERVICE> --previous --tail=20 | jq -r '.issues'
kubectl -n <NS> get configmap platform-config -o json | jq '.data | keys'
```

Almost always a recent ConfigMap change. Revert it in Git and sync.

11. `OOMKilled`:

```bash
kubectl -n <NS> get pod -l app=<SERVICE> \
  -o jsonpath='{.items[0].spec.containers[0].resources}' | jq .
curl -s "$PROM/api/v1/query?query=container_memory_working_set_bytes{container=\"<SERVICE>\"}" | jq .
```

Check whether `NODE_OPTIONS --max-old-space-size` is roughly 85 per cent of the memory limit. If the heap ceiling exceeds the container limit, Node will be killed rather than garbage-collecting ([22 §22.4.1](../22-cicd-release-supply-chain.md)).

A **sudden** OOM after a release is a leak or an unbounded query in the new code — roll back. A **gradual** trend is a capacity item.

Raising the limit is a stopgap that must be done through Git, and it needs a follow-up defect:

```bash
# In the Helm values, not by kubectl edit.
# resources.limits.memory: <NEW>
```

12. Application startup error. Read the stack trace. Common causes: a required environment variable absent, a database role lacking a grant that a new query needs, or an event stream or consumer group that does not exist. If it followed a release, roll back.

13. Missing secret or ConfigMap:

```bash
kubectl -n <NS> get externalsecrets
kubectl -n <NS> describe externalsecret <NAME> | tail -20
kubectl -n <NS> get secret <NAME> -o jsonpath='{.data}' | jq 'keys'
```

If External Secrets cannot reach Secret Manager, that is the cause — check its service account and the egress policy. If a rotation went wrong, go to [RB-09](rb-09-secret-rotation.md).

14. Image problems:

```bash
kubectl -n <NS> describe pod -l app=<SERVICE> | grep -A5 Events
```

| Message | Cause | Fix |
| --- | --- | --- |
| `manifest unknown` | The digest does not exist | The deployment references a bad digest; revert the Git commit |
| `unauthorized` | Workload Identity or registry permission | Check the service account binding |
| Admission webhook denied: signature | The image is unsigned or unverifiable | **Do not bypass admission control.** Rebuild through the pipeline ([22 §22.8](../22-cicd-release-supply-chain.md)) |

The admission rejection case usually means someone attempted a manual image push. The correct response is to go through the pipeline, not to relax the policy.

### 5.4 Service running but failing readiness

15. Readiness failing is correct behaviour when a dependency is unavailable — the pod is deliberately removed from the load balancer rather than serving errors. Get the detail:

```bash
kubectl -n <NS> exec deploy/<SERVICE> -- \
  wget -qO- localhost:<PORT>/health/ready | jq .
```

16. Fix the named dependency. **Do not weaken the probe.**

17. If readiness reports everything healthy but Kubernetes still marks it unready, check the probe configuration for a timeout that is too tight — a probe timeout shorter than the dependency check duration produces exactly this symptom.

### 5.5 Restart, if diagnosis points to a stuck process

18. Only when a restart is indicated — a leaked resource, a stuck-open circuit breaker, an exhausted connection pool. Never as a substitute for diagnosis:

```bash
kubectl -n <NS> rollout restart deploy/<SERVICE>
kubectl -n <NS> rollout status deploy/<SERVICE> --timeout=300s
```

19. If a restart resolves it and nothing was deployed, **that is a defect, not a resolution.** Something accumulates until the process is unusable. Capture heap and log state before restarting if the service is not fully down, and raise it.

## 6. Verification

20. Desired replicas ready:

```bash
kubectl -n <NS> get deploy <SERVICE> \
  -o custom-columns='READY:.status.readyReplicas,DESIRED:.spec.replicas'
```

21. No restarts in the last 10 minutes:

```bash
kubectl -n <NS> get pods -l app=<SERVICE> \
  -o custom-columns='NAME:.metadata.name,RESTARTS:.status.containerStatuses[0].restartCount,AGE:.metadata.creationTimestamp'
```

22. Error rate and p95 latency at baseline on D-01 and D-02.
23. Readiness reporting all dependencies `ok`.
24. Synthetic journeys passing.
25. **Domain metrics recovered** on D-15 — submissions being accepted, disbursements being recorded. A service can be technically healthy and functionally broken.
26. Event consumer lag recovering; a service outage stalls consumers ([RB-02](rb-02-dlq-drain-and-replay.md) if it does not drain).
27. Argo reports `Synced` and `Healthy`, so nothing you did by hand will be reverted later:

```bash
argocd app get ngois-prod-<SERVICE> | grep -E 'Sync Status|Health Status'
```

28. If a Tier 1 service was down for more than 15 minutes, notify affected tenants of restoration.

## 7. Rollback

If the fix made things worse, roll back to the last known-good revision:

```bash
kubectl argo rollouts undo <SERVICE> -n <NS> --to-revision=<N>
```

Any manual `kubectl` change should be reverted and made through Git instead, or Argo will undo it unpredictably.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| `api-gateway` down over 5 minutes | Platform Lead **and** Executive Director |
| Rollback does not resolve it | Chief Architect |
| Multiple Tier 1 services down and the cause is not a shared dependency | Chief Architect, SEV-1 |
| Admission control rejecting a legitimate image | Security Lead. **Do not bypass** |
| Repeated OOM after a limit increase | Chief Architect; there is a leak |
| A restart resolves it repeatedly | Chief Architect; this is a defect being masked |
| Unresolved after 45 minutes | Platform Lead |

## 9. Follow-up

- Postmortem for SEV-1 or SEV-2.
- **If a restart resolved it, the incident is not closed** until the underlying accumulation is understood.
- If a release caused it, add the test that would have caught it, and check why canary analysis did not abort ([22 §22.5.1](../22-cicd-release-supply-chain.md)) — the analysis missing a defect is itself a finding.
- If a configuration change caused it, the action item is a validation gap: the schema should have rejected it at boot in CI, not in production.
- Revert or commit every manual change within 24 hours.
