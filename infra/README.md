# Platform infrastructure (staging-ready modules + local prod-shaped stack)

> **Status:** Terraform modules contain real `google_*` resources gated by `enable_resources`
> (default `false` for CI validate). **Do not apply** until `project_id` and credentials are set.
> See [`ops/staging-ready.md`](../ops/staging-ready.md).

## Layout

```
infra/
  terraform/           Environments + modules (GKE, Cloud SQL, Redis, KMS, network, DR)
  kubernetes/                Base + per-service Deployment stubs, Argo CD apps, canary
  observability/       OTel, Prometheus, Grafana (D-01…D-06), Loki, Phase-1 alerts
  supply-chain/        Cosign + SBOM notes for CI
```

Root compose: [`docker-compose.prod-shaped.yml`](../docker-compose.prod-shaped.yml)


## Environments

| Env | Path | Notes |
| --- | --- | --- |
| `dev` | `terraform/envs/dev` | Ephemeral / shared-dev |
| `staging` | `terraform/envs/staging` | Production-shaped |
| `prod` | `terraform/envs/prod` | africa-south1 |
| `dr` | `terraform/envs/dr` | Warm DR stub (ADR-0012) |

## Local checks

```powershell
npm run stack:prod-shaped     # compose primary (pg/redis/otel/prom/loki)
npm run terraform:validate    # validate stub envs (skip if no CLI)
npm run drill:dr-failover     # primary→dr RTO (PASS local gate #10)
npm run drill:rollback-local  # <5min recovery (PASS local gate #16)
npm run verify:platform       # inventory + terraform validate + alert→runbook
```

| Local | Still cloud / vendor BLOCKED |
| --- | --- |
| Compose stack, DR failover drill, rollback drill | Gate #2 14-day prod canary |
| Terraform validate (no apply) | `terraform apply` to GCP |
| Pen-test engagement pack + selfcheck | Gate #12 external pen-test report |

Do **not** run `terraform apply` from these stubs.
