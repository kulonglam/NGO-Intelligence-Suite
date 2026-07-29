# RB-10 — Canary abort (local ops index)

| | |
| --- | --- |
| **ID** | RB-10 |
| **Applies to** | Automated canary analysis aborting a rollout |
| **Owner** | Platform |
| **SDD** | [docs/sdd/runbooks](../../docs/sdd/runbooks) / Argo Rollouts |
| **Local drill** | `node scripts/canary-analysis-stub.mjs` with `CANARY_INJECT_REGRESSION=1` |

## Procedure (local)

1. Inject regression: `$env:CANARY_INJECT_REGRESSION='1'; node scripts/canary-analysis-stub.mjs`
2. Expect `decision.action = abort`
3. Evidence: `ops/drills/evidence/canary-analysis.json`

Production gate #10 still requires live Argo analysis in cluster.
