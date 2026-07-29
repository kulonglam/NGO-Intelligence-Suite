# Platform infrastructure (stubs)

> **Status:** stubs only — not applied to any cloud account.
> Replace module bodies with real GCP resources when platform work lands (SDD [21](../docs/sdd/21-deployment-and-infrastructure.md), [31 §31.3.1](../docs/sdd/31-implementation-roadmap.md)).

## Layout

```
infra/
  terraform/           Environments + modules (GKE, Cloud SQL, Redis, KMS, network, DR)
  kubernetes/                Base + per-service Deployment stubs, Argo CD apps
  observability/       OTel, Prometheus, Grafana (D-01…D-06), Loki, Phase-1 alerts
  supply-chain/        Cosign + SBOM notes for CI
```

## Environments

| Env | Path | Notes |
| --- | --- | --- |
| `dev` | `terraform/envs/dev` | Ephemeral / shared-dev |
| `staging` | `terraform/envs/staging` | Production-shaped |
| `prod` | `terraform/envs/prod` | africa-south1 |
| `dr` | `terraform/envs/dr` | Warm DR stub (ADR-0012) |

## Local checks

```powershell
npm run verify:platform   # alert→runbook gate + stub inventory
```

Do **not** run `terraform apply` from these stubs.
