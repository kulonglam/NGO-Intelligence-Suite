# Progressive canary — Argo Rollouts (staging-ready)

## Prerequisites

1. Argo Rollouts controller installed in the cluster.
2. Prometheus scraping gateway metrics (or adapt AnalysisTemplate query).
3. Image digests set via CD (replace `digest-replace-me`).

## Apply

```bash
kubectl apply -k infra/kubernetes/canary/
# Promote / abort
kubectl argo rollouts get rollout api-gateway -n ngois
kubectl argo rollouts promote api-gateway -n ngois
kubectl argo rollouts abort api-gateway -n ngois
```

## Weights (gate #2 prep)

| Step | Weight | Pause |
| --- | --- | --- |
| 1 | 5% | 1h + analysis |
| 2 | 25% | 6h |
| 3 | 50% | 24h |
| 4 | 100% | — |

For **Phase 1 gate #2**, hold ≤10% for **14 consecutive days** with green analysis before full promote. Local drills (`npm run drill:canary-abort`) do not satisfy that gate.

## Local / CI

```powershell
npm run drill:canary-abort
npm run canary:local
```
