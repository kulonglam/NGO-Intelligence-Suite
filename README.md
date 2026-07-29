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
.\scripts\setup-local-db.ps1
$env:DATABASE_URL = 'postgres://ngois:ngois_dev@127.0.0.1:5432/ngois'
```

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

Platform / ops stubs: `infra/` (Terraform envs + modules, K8s/Argo, OTel/Prometheus/Grafana D-01…D-06, Loki, Phase-1 alerts, cosign/SBOM notes) and `ops/` (on-call, incident process, drill templates, alert→runbook map). Validate with `npm run verify:platform` — does **not** apply cloud resources.

**Phase 1 release gate status:** see [`ops/phase1-gate-status.md`](ops/phase1-gate-status.md). Closable in-repo gates are `PASS (local)`; production canary (#2), cloud DR RTO (#10), external pen-test (#12), and production rollback (#16) stay **BLOCKED** until real infra/vendors. Refresh local evidence with:

```powershell
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
npm run verify:phase2-gates
npm run smoke:payroll-e2e
npm run smoke:phase2-e2e    # accrue, expense, BvA, report claim, quotas, erasure
npm run drill:erasure
npm run canary:analysis-stub
npm run retention:sweep     # dry-run default; see ops/compliance/retention-schedule.md
```

Gate board: [`ops/phase2-gate-status.md`](ops/phase2-gate-status.md). Still **BLOCKED** (by design): #4 scale load, #10 live Argo canary, #13 accountant review; DPIA is draft-only (not DPO-approved).

## Conventions

- Conventional Commits · trunk-based development (ADR-0018)
- TypeScript `strict` · Zod at boundaries · no `any` in domain code
- Monetary values as strings end-to-end; arithmetic in `NUMERIC` / decimal libs
- Every tenant-owned query runs under RLS session context (`SET LOCAL`)
- Authorisation: Appendix C permissions in JWT; `requirePermission` has no role bypass
