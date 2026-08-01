# Staging-ready production path (post local PASS)

Engineering-complete local gates stay as-is. This document is the **single operator checklist** to turn staging-ready wiring into a real staging environment.

Local inventory gate: `npm run verify:staging-ready`  
Checklist content gate: `npm run smoke:staging-checklist`

## Operator checklist

### 0. Prerequisites

- [ ] GCP project with billing enabled
- [ ] `gcloud`, `terraform`, `kubectl`, and Docker (or CI equivalents) installed
- [ ] Access to create VPC / GKE / Cloud SQL / Memorystore / KMS in the target project
- [ ] Secrets ready (DB password, provider API keys) — never commit them

### 1. Terraform (enable resources)

```powershell
cd infra/terraform/envs/staging
copy terraform.tfvars.example terraform.tfvars
# edit project_id, enable_resources = true
$env:TF_VAR_db_password = '…'
terraform init
terraform plan
terraform apply   # only with a real GCP project
```

Modules create VPC, GKE Standard, Cloud SQL HA+PITR, Memorystore Redis, KMS when `enable_resources=true`. Default `false` keeps CI `terraform validate` safe.

**Checklist marker:** `ENABLE_RESOURCES_APPLY`

### 2. Argo CD + Rollouts

1. Install Argo CD + Argo Rollouts on the cluster.
2. Apply [`infra/kubernetes/argo/root-app.yaml`](../infra/kubernetes/argo/root-app.yaml) (point `repoURL` at your fork).
3. Sync `ngois-canary` → Rollout + AnalysisTemplate.
4. Hold ≤10% canary for **14 consecutive days** before claiming Phase 1 gate #2.

**Checklist marker:** `ARGO_CANARY_SYNC`

### 3. Provider env secrets

Set these on staging workloads (names must match [`.env.example`](../.env.example)):

| Flag | Service | Effect |
| --- | --- | --- |
| `NOTIFY_PROVIDER=sendgrid` + `SENDGRID_API_KEY` | notification | Live email |
| `NOTIFY_PROVIDER=africas_talking` + `AT_API_KEY` + `AT_USERNAME` | notification | Live SMS |
| `AI_LLM_PROVIDER=openai\|anthropic` + `AI_LLM_API_KEY` | ai-insights | Live LLM (still behind redaction/HITL) |
| `AUTH_MODE=oidc` + `OIDC_ISSUER` + `OIDC_CLIENT_ID` | auth | `/v1/auth/oidc/start` authorize URL |
| `IATI_REGISTRY_MODE=remote` + `IATI_REGISTRY_TOKEN` | integration | Registry API upload |

Without keys, adapters fail visibly or fall back to local stubs.

**Checklist marker:** `PROVIDER_ENV_FLAGS`

### 4. Smoke matrix (against staging URL)

Point `APP_URL` / gateway at staging, then:

```powershell
npm run test:browser
npm run smoke:webhooks-e2e   # if stack endpoints are reachable
```

Minimum manual checks: login → grants list (tenant isolation) → finance BVA → payroll list → intelligence KPIs → webhooks settings.

**Checklist marker:** `STAGING_SMOKE_MATRIX`

### 5. Remains BLOCKED (do not claim PASS)

| Gate | Why still BLOCKED |
| --- | --- |
| Phase 1 #2 — 14-day production canary | Needs live telemetry for 14 consecutive days |
| Phase 1 #12 — external pen-test | External firm; local prep only via `pen-test:selfcheck` |

Wet-ink DPIA / accountant sign-off and live SendGrid/AT/LLM/IATI Registry in **production** are also outside this checklist.

## Verify inventory (local)

```powershell
npm run verify:staging-ready
npm run smoke:staging-checklist
```

## Production experience (product UX)

Focused+ operator UI (grouped nav, shared empty/loading/toast/confirm, polished top journeys) ships in the frontend. Staging activation above is the ops half of the same “production experience” tranche.
