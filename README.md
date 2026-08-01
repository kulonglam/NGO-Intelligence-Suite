# NGO Intelligence Suite

Multi-tenant SaaS for humanitarian NGO operations (grants, HR/payroll, field data, LMS, beneficiaries).

**Source of truth for design:** [`docs/sdd/`](docs/sdd/README.md) (SDD v2.0).

## Stack

- TypeScript / Node.js 20 (ADR-0007)
- Express microservices behind a custom API gateway (ADR-0012)
- PostgreSQL 15 + RLS (ADR-0002)
- Redis 7 (cache + streams)
- Vue 3 frontend (ADR-0020)

## Repo layout

```
backend/
  packages/              Shared libraries (config, db, errors, logging, rbac, audit, crypto, tenant-context, service-kit)
  services/
    api-gateway/         Port 3000
    auth-service/        Port 3001
    grant-service/       Port 3002
    hr-payroll-service/  Port 3006
    reporting-service/   Port 3008
    file-service/        Port 3010
    tenant-service/      Port 3014
    outbox-relay/        Polls outbox → Redis Streams (or log sink)
  db/migrations/         SQL migrations
frontend/                Vue 3 application (Vite)
infra/                   Platform stubs (Terraform, K8s/Argo, observability, supply-chain)
ops/                     Ops stubs (on-call, incident process, drills, alert→runbook map)
docs/sdd/                Software Design Document v2.0
scripts/                 Local setup helpers
```

## Prerequisites

- Node.js 20+
- PostgreSQL 15+ (18 is fine) **or** Docker Desktop for `docker compose up`
- Redis optional for Phase 1 (outbox relay defaults to log sink; set `OUTBOX_SINK=redis` when Redis is up)

## Database setup

### Option A — Docker

```powershell
npm run db:up
```

### Option B — Local PostgreSQL (no Docker)

```powershell
$env:PGPASSWORD = '<your postgres superuser password>'
npm run db:setup-local
# or: .\scripts\setup-local-db.ps1
$env:DATABASE_URL = 'postgres://ngois:ngois_dev@127.0.0.1:5432/ngois'
```

Repair helpers (optional, after a broken local DB): `npm run db:repair-app-role`, `npm run db:repair-app-grants`, `npm run db:provision-payroll`.

Then migrate and seed:

```powershell
npm run db:migrate
npm run db:seed
```

## Quick start

```powershell
# 1. Install
npm install

# 2. Database (see above) then:
npm run db:migrate
npm run db:seed

# 3. Build backend shared packages
npm run build -w @ngois/errors -w @ngois/logging -w @ngois/config -w @ngois/db -w @ngois/tenant-context -w @ngois/service-kit

# 4. Run backend services (five+ terminals)
npm run dev:auth
npm run dev:tenant
npm run dev:grant
npm run dev:file
npm run dev:gateway
npm run dev:outbox   # optional

# 5. Frontend
npm run dev:frontend
```

- Gateway: `http://localhost:3000`
- Web: `http://localhost:5173`
- Seed login: `admin@design-partner.example` / `changeme` (`org_admin`)
- Finance seed: `finance@design-partner.example` / `changeme` (`finance_manager`)

### Smoke test

```powershell
# Health
curl http://localhost:3000/v1/health

# Dev login (local only — issues a JWT)
curl -X POST http://localhost:3000/v1/auth/dev/login `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@design-partner.example","password":"changeme"}'

# List grants (use token from login)
curl http://localhost:3000/v1/grant/grants `
  -H "Authorization: Bearer <token>"
```

## Phase 1 scope

Identity, tenancy, RLS, **Appendix C RBAC**, grants core, frontend shell, observability baseline. See [docs/sdd/31-implementation-roadmap.md](docs/sdd/31-implementation-roadmap.md).

RBAC lives in `@ngois/rbac` (single source of truth with the SDD matrix). Auth expands role → permissions into the JWT; `requirePermission` checks that claim — no role bypass.

Data foundation: `audit_events` hash chain (`@ngois/audit`), per-tenant AES-GCM keys (`@ngois/crypto`), grant budgets/disbursements/file_objects + RLS, outbox relay (`npm run dev:outbox`). Verify with `npm run verify:rls` and `npm run verify:audit`.

Grants finance: budget versions + disbursement maker-checker (`/v1/grant/grants/:id/summary|budgets|disbursements`) with ceiling check `NGOIS-GRANT-0021`. Files: `@ngois/file-service` on `:3010` (`/v1/file/objects`) with tenant-prefixed local storage under `.data/files/`. Grant detail UI at `/grants/:id`.

Isolation & CI: `.github/workflows/ci.yml` runs typecheck, unit tests, gitleaks, `verify:set-local`, `verify:rls`, Semgrep, and the **15-category** tenant isolation suite (`npm run test:isolation`, SDD §23.9). Redis key helper: `tenantRedisKey` in `@ngois/tenant-context`.

Frontend baseline: Vue 3 shell with design tokens, `vue-i18n` (en/ar + RTL `dir`), core base components, skip link / focus management / status badges (not colour-alone), offline banner + PWA shell (`vite-plugin-pwa`), contrast gate (`npm run check:contrast`) and gzip bundle budgets (`npm run verify:frontend`).

Platform / ops: `infra/` stubs + local **prod-shaped** compose (`docker-compose.prod-shaped.yml`). Validate with `npm run verify:platform` — does **not** apply cloud resources.

**Phase 1 release gate status:** see [`ops/phase1-gate-status.md`](ops/phase1-gate-status.md). Most gates are `PASS (local)`; **#2** (14-day prod canary) and **#12** (external pen-test) stay **BLOCKED**. Gates **#10** (DR failover) and **#16** (rollback &lt; 5 min) are **PASS (local)** via compose drills.

```powershell
npm run stack:prod-shaped
npm run drill:dr-failover
npm run drill:rollback-local
npm run pen-test:selfcheck
npm run terraform:validate
npm run drill:phase1
npm run verify:phase1-gates
```

Optional local PgBouncer (transaction pooling on `:6432`): `docker compose up -d pgbouncer` then point `DATABASE_URL` at `postgres://ngois_app:ngois_app_dev@127.0.0.1:6432/ngois`. Retention dry-run: `npm run retention:sweep`.

Reports UI: `/reports` (portfolio + disbursement totals). Second design partner: `admin@design-partner-b.example` / `changeme`.

```powershell
# Local gates (DB on :5433 + stack running for API categories)
$env:DATABASE_URL = 'postgres://ngois:ngois_dev@127.0.0.1:5433/ngois'
$env:DATABASE_APP_URL = 'postgres://ngois_app:ngois_app_dev@127.0.0.1:5433/ngois'
$env:ISOLATION_REQUIRE_API = '1'
npm run verify:set-local
npm run verify:rls
npm run test:isolation
npm run verify:frontend
npm run test:coverage
```

## Phase 2 scope (Workforce)

HR core + statutory payroll for **South Sudan** and **Uganda**, plus finance COA/expenses, fair report queue, quotas, and compliance erasure/DSAR. See [docs/sdd/31-implementation-roadmap.md §31.4](docs/sdd/31-implementation-roadmap.md).

- **`@ngois/payroll-engine`** — jurisdiction-agnostic calculation (NSIF deductible before PAYE; NSSF not; Appendix I fixtures)
- **`hr-payroll-service`** on `:3006` — employees, leave accrue/balances, positions/onboarding, payroll calculate/submit/approve
- **`grant-service`** — chart of accounts, expense maker-checker, budget vs actual (`/finance` UI)
- **`reporting-service`** on `:3008` — payslip export + fair-share job queue (CSV/XLSX/PDF), concurrent report quota
- **`tenant-service`** — `GET /v1/tenant/quotas`, erasure + DSAR workflows
- **Gateway** — per-tenant RPM (`NGOIS-API-0429`)
- **Migrations:** `005`–`013` (workforce, payroll schema, reporting, accrual/onboarding, COA, quotas/compliance, fair claim)
- **UI:** `/employees`, `/leave` (balances + accrue), `/payroll`, `/finance`
- **Seed users:** `hr@design-partner.example` / `changeme` (`hr_manager`), `finance@…` approves payroll & expenses; synthetic tenants 3–8 for gate #12

```powershell
npm run dev:hr          # hr-payroll-service :3006
npm run dev:reporting   # reporting-service :3008
npm run test:payroll-fixtures
npm run load:payroll-500
npm run drill:canary-abort
npm run accountant:review-pack
npm run dpia:attest
npm run verify:phase2-gates
npm run smoke:payroll-e2e
npm run smoke:phase2-e2e    # accrue, expense, BvA, report claim, quotas, erasure
npm run drill:erasure
npm run canary:analysis-stub
npm run retention:sweep     # dry-run default; see ops/compliance/retention-schedule.md
```

Gate board: [`ops/phase2-gate-status.md`](ops/phase2-gate-status.md). All thirteen Phase 2 gates are **PASS (local)** including load (`load:payroll-500`), canary abort (`drill:canary-abort`), accountant review pack, and DPO-attested DPIA. Tenant policy may still require wet-ink countersignature before production payroll go-live.

## Phase 3 scope (Field — full close)

Offline-first capture, beneficiaries, LMS, notifications, devices/wipe, paper fallback, chaos catalogue, and k-anonymity. See [docs/sdd/31-implementation-roadmap.md §31.5.1](docs/sdd/31-implementation-roadmap.md).

- **`@ngois/beneficiary-dedup`** / **`@ngois/vulnerability-score`** / **`@ngois/k-anonymity`**
- **`beneficiary-service`** `:3004` · **`field-data-service`** `:3005` · **`lms-service`** `:3003` · **`notification-service`** `:3007` (local SendGrid/AT adapters)
- **Frontend** — `/field`, `/training`, `/notifications`; IndexedDB + remote wipe
- **Migrations:** `014`, `015`
- **DPIA:** [`ops/compliance/dpia-phase3-beneficiary.md`](ops/compliance/dpia-phase3-beneficiary.md) (`npm run dpia:attest:phase3`)

```powershell
npm run dev:beneficiary   # :3004
npm run dev:field         # :3005
npm run dev:lms           # :3003
npm run dev:notify        # :3007
npm run verify:phase3-gates
npm run smoke:field-e2e
npm run smoke:phase3-e2e
npm run smoke:paper-fallback
npm run offline:harness
npm run load:field-2g
npm run chaos:catalogue
npm run dpia:attest:phase3
```

Gate board: [`ops/phase3-gate-status.md`](ops/phase3-gate-status.md) — all fifteen gates **PASS (local)**.

## Phase 4 scope (Intelligence)

Analytics, constrained AI, IATI local publish. See [docs/sdd/31-implementation-roadmap.md §31.5.2](docs/sdd/31-implementation-roadmap.md).

- **`@ngois/ai-redaction`** — deny-by-default gate + 400-fixture corpus
- **`analytics-service`** `:3012` — dashboard, KPIs, k-anon preview, compliance score
- **`ai-insights-service`** `:3013` — local LLM stub, HITL approve, kill switch, token budgets
- **`integration-service`** `:3011` — IATI v2.03 preview/publish (local artifact, exclusion policy)
- **UI:** `/intelligence`, `/ai`, `/compliance`
- **Migration:** `016_phase4_intelligence.sql`

```powershell
npm run dev:analytics      # :3012
npm run dev:ai             # :3013
npm run dev:integration    # :3011
npm run test:ai-redaction
npm run eval:ai-injection
npm run smoke:phase4-e2e
npm run finops:attribution
npm run verify:phase4-gates
```

Gate board: [`ops/phase4-gate-status.md`](ops/phase4-gate-status.md).

## Post-M4 — Production readiness + webhooks

There is no SDD Phase 5 gate board. This tranche closes what can be closed locally after M4 and adds outbound webhooks ([§34.2.2](docs/sdd/34-future-extensibility.md)).

- **Prod-shaped stack:** Postgres primary/DR, Redis, OTel, Prometheus, Loki
- **`@ngois/webhook-egress`** — SSRF, PII strip, HMAC
- **`webhook-dispatcher`** — Redis Streams consumer + outbox fallback
- **APIs:** `/v1/tenant/webhooks` · **UI:** `/settings/webhooks`
- **Migration:** `017_webhooks.sql`

```powershell
npm run stack:prod-shaped
npm run verify:platform
npm run test -w @ngois/webhook-egress
npm run smoke:webhooks-e2e
npm run verify:webhooks-gates
```

Gate board: [`ops/webhooks-gate-status.md`](ops/webhooks-gate-status.md).

## Staging-ready (production path)

Wiring for a real staging cutover — still **not** a claim of production canary / pen-test PASS.

- Terraform modules with `enable_resources` (VPC, GKE, Cloud SQL HA+PITR, Redis, KMS)
- Argo Rollouts canary for `api-gateway` + AnalysisTemplate
- Provider switches: OIDC start, SendGrid / Africa’s Talking, OpenAI/Anthropic LLM, IATI Registry

```powershell
npm run verify:staging-ready
npm run smoke:staging-checklist
# Then follow ops/staging-ready.md with a GCP project
```

## Production experience (focused+)

Operator UX tranche on top of local PASS gates:

- Grouped shell IA + mobile drawer ([`frontend/src/layouts/AppShell.vue`](frontend/src/layouts/AppShell.vue))
- Shared PageHeader / EmptyState / Skeleton / Toast / Confirm / DataTable / StatCard
- Polished journeys: Login, Home, Grants, Finance, Payroll, Intelligence
- Ops half: [`ops/staging-ready.md`](ops/staging-ready.md) checklist (no live apply without your GCP project)

## Conventions

- Conventional Commits · trunk-based development (ADR-0018)
- TypeScript `strict` · Zod at boundaries · no `any` in domain code
- Monetary values as strings end-to-end; arithmetic in `NUMERIC` / decimal libs
- Every tenant-owned query runs under RLS session context (`SET LOCAL`)
- Authorisation: Appendix C permissions in JWT; `requirePermission` has no role bypass
