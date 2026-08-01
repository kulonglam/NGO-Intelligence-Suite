# Graph Report - NGO Intelligence Suite  (2026-08-01)

## Corpus Check
- 514 files · ~389,117 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 4416 nodes · 5659 edges · 321 communities (301 shown, 20 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.61)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8cdffc45`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Root Workspace Manifest
- File Service Package
- API Gateway Package
- Auth Service Package
- Frontend Package
- Vue App Shell UI
- Grant Service Package
- Outbox Relay Package
- Frontend TypeScript Config
- Audit Package
- RBAC Permission Expand
- Service Kit Package
- Dev Tooling Dependencies
- Tenant Service Package
- SDD PDF Build Tools
- Crypto Package
- Tenant Context Package
- Backend TSConfig Base
- DB Package
- Grant Detail Vue UI
- service-kit/src/index.ts
- pdf/package.json
- finance.ts
- GrantsView.vue
- config/package.json
- check-bundle-budget.mjs
- audit/src/index.ts
- rbac/package.json
- crypto/src/index.ts
- errors/package.json
- logging/package.json
- outbox-relay/src/index.ts
- verify-alerts-runbooks.mjs
- errors/src/index.ts
- service-kit/tsconfig.json
- tenant-context/tsconfig.json
- audit/tsconfig.json
- config/tsconfig.json
- crypto/tsconfig.json
- db/tsconfig.json
- errors/tsconfig.json
- logging/tsconfig.json
- rbac/tsconfig.json
- tenant-context/src/index.ts
- auth-service/tsconfig.json
- file-service/src/index.ts
- auth.ts
- LoginView.vue
- isolation-suite.mjs
- api-gateway/tsconfig.json
- file-service/tsconfig.json
- grant-service/tsconfig.json
- outbox-relay/tsconfig.json
- tenant-service/tsconfig.json
- api-gateway/src/index.ts
- auth-service/src/index.ts
- dependencies
- sdd/README.md
- browser-smoke.mjs
- check-contrast.mjs
- verify-set-local.mjs
- tenant-service/src/index.ts
- validate.mjs
- 10 — API Design Standards
- verify-platform.mjs
- config/src/index.ts
- db/src/index.ts
- migrate.ts
- frontend/tsconfig.json
- verify-rls.mjs
- seed.ts
- vite-env.d.ts
- fix-app-grants.mjs
- fix-app-role.mjs
- compute.ts
- Appendix B — Data Dictionary
- Appendix I — Algorithms and Worked Examples
- dependencies
- 09 — Data Management Strategy
- 24 — Observability
- 11 — Event-Driven Architecture
- 14 — Security Architecture
- 17 — Privacy, Data Protection and Humanitarian Compliance
- dependencies
- 6.3 Service specifications
- 27 — Disaster Recovery and Business Continuity
- 29 — Multi-Tenancy and Tenant Lifecycle
- 31 — Implementation Roadmap
- 05 — Architecture Diagrams
- 13 — Offline-First and Field Operations Architecture
- 15 — RBAC and Authorization Matrix
- 19 — Frontend Architecture
- 23 — Testing Strategy
- 18 — AI and LLM Architecture and Governance
- 21 — Deployment and Infrastructure
- 25 — Performance, Scalability and Capacity Planning
- payroll-routes.ts
- 4.2 The twelve principles
- routes.ts
- 22 — CI/CD, Release Management and Supply Chain Security
- 26 — Reliability, Incident Management and On-Call
- 08 — Database Schema
- 16.5 STRIDE enumeration
- 35 — Engineering Standards and Ways of Working
- 7.3 Entity-relationship diagrams
- 12 — Integration Architecture
- 5. Procedure
- 5. Procedure
- RB-16 — Field Sync Failure
- Document Control
- 20.5 Feature flags
- RB-11 — Backup Restore and Point-in-Time Recovery
- RB-14 — Security Incident and Suspected Data Exposure
- RB-15 — External Integration Failure
- NGO Intelligence Suite
- 33 — Cost Model and FinOps
- Table of contents
- RB-08 — Capacity and Saturation Response
- RB-09 — Secret Rotation, Planned and Emergency
- RB-04 — Certificate Rotation and Expiry Recovery
- RB-06 — Tenant Offboarding and Data Deletion
- RB-07 — Personal Data Erasure Request
- ReportsView.vue
- payroll-engine/package.json
- 02 — Introduction
- 30 — Quality Attributes and Non-Functional Requirements
- Appendix C — RBAC Permission Matrix
- RB-02 — Dead Letter Queue Drain and Event Replay
- RB-03 — Database Failover and Recovery
- RB-05 — Tenant Provisioning
- RB-13 — Service Unavailable or Crash Looping
- Appendix E — Error Code Registry
- RB-10 — Hotfix Deployment
- PayrollView.vue
- 03 — System Overview and Context
- Appendix D — Event Catalog
- Appendix H — Compliance Traceability Matrix
- 32 — Risk Register
- package.json
- 28 — Operational Runbooks
- Appendix G — Runbook Index
- payroll-engine/tsconfig.json
- hr-payroll-service/tsconfig.json
- 34 — Future Extensibility
- App.vue
- drill-backup-restore.mjs
- reporting-service/tsconfig.json
- 01 — Executive Summary
- start-embedded-db.mjs
- ADR-0010 — Anthropic Claude as LLM Provider, with Hard Boundaries
- Appendix A — Glossary
- Appendix F — Architecture Decision Record Index
- drill-audit-chain.mjs
- drill-dr-stub.mjs
- drill-encryption-sample.mjs
- drill-rb05-onboarding.mjs
- smoke-payroll-e2e.mjs
- verify-phase1-gates.mjs
- db/src/payroll-schema.ts
- drill-rollback-local.mjs
- provision-payroll-schemas.mjs
- verify-phase2-gates.mjs
- @ngois/rbac
- ADR-0001 — Domain-Aligned Microservices over a Modular Monolith
- ADR-0002 — Hybrid Multi-Tenancy: Shared Schema with Row-Level Security
- ADR-0003 — Redis Streams as the Event Substrate, not Kafka
- ADR-0004 — Supabase Auth as the Identity Provider
- ADR-0005 — Per-Entity Offline Conflict Resolution, not Last-Write-Wins
- ADR-0006 — Per-Tenant PostgreSQL Schemas for Payroll Data
- ADR-0007 — TypeScript on Node.js 20 LTS Across All Services
- ADR-0008 — Synchronous Only When the User Is Waiting
- ADR-0009 — Major API Version in the URI Path
- ADR-0011 — Transactional Outbox for Event Publication
- ADR-0012 — A Custom Express API Gateway rather than Kong
- ADR-0013 — A Progressive Web App rather than Native Mobile Applications
- ADR-0014 — Google Cloud, GKE Standard, and `africa-south1` as Primary Region
- ADR-0015 — Application-Layer PII Encryption with Per-Tenant Keys
- ADR-0016 — Single Primary Region with Warm Standby, not Active-Active
- ADR-0017 — Self-Hosted Prometheus, Grafana, Loki and Tempo
- ADR-0018 — Trunk-Based Development with Release Flags
- ADR-0019 — Build an Extension Point Only on the Second Concrete Case
- ADR-0020 — Vue 3 with Pinia, TanStack Query and Tailwind
- Supply-chain stubs (SDD §22.4)
- Incident process (stub)
- canary-local-check.mjs
- retention-sweep.mjs
- run-load-tests.mjs
- SDD PDF Export
- SDD Consistency Checks
- Platform infrastructure (stubs)
- On-call rotation (stub)
- Operations baseline (stubs)
- test-coverage.mjs
- backup-restore.md
- regional-failover.md
- drill-phase1.mjs
- audit-chain.md
- rb05-onboarding.md
- LeaveView.vue
- EmployeesView.vue
- smoke-phase2-e2e.mjs
- drill-erasure.mjs
- canary-analysis-stub.mjs
- leave-accrual.mjs
- Retention sweep — prod schedule note
- RB-10 — Canary abort (local ops index)
- accountant-review-pack.mjs
- drill-canary-abort.mjs
- dpia-attest.mjs
- Accountant review checklist — SS & UG
- FieldView.vue
- dependencies
- dependencies
- beneficiary-dedup/src/index.ts
- vulnerability-score/src/index.ts
- beneficiary-dedup/package.json
- vulnerability-score/package.json
- beneficiary-service/src/index.ts
- beneficiary-dedup/tsconfig.json
- vulnerability-score/tsconfig.json
- beneficiary-service/tsconfig.json
- field-data-service/tsconfig.json
- field-data-service/src/index.ts
- offline-harness.mjs
- verify-phase3-gates.mjs
- smoke-field-e2e.mjs
- k-anonymity/package.json
- api.ts
- dpia-attest-phase3.mjs
- lms-service/src/index.ts
- k-anonymity/tsconfig.json
- load-field-2g.mjs
- lms-service/tsconfig.json
- notification-service/tsconfig.json
- chaos-catalogue.mjs
- smoke-paper-fallback.mjs
- k-anonymity/src/index.ts
- smoke-phase3-e2e.mjs
- dependencies
- ai-insights-service/src/index.ts
- ai-redaction/package.json
- ai-redaction/src/index.ts
- generate-redaction-corpus.mjs
- integration-service/src/index.ts
- BaseButton.vue
- AiInsightsView.vue
- ai-redaction/tsconfig.json
- ComplianceView.vue
- ai-insights-service/tsconfig.json
- analytics-service/tsconfig.json
- integration-service/tsconfig.json
- start-embedded-db.mjs
- finops-attribution.mjs
- analytics-service/src/index.ts
- SessionBanner.vue
- eval-ai-injection.mjs
- verify-phase4-gates.mjs
- WebhooksView.vue
- webhook-egress/package.json
- webhook-egress/src/index.ts
- stack-prod-shaped.mjs
- Phase 3 DPIA — Beneficiary / field data (DPO-approved)
- webhook-egress/tsconfig.json
- webhook-dispatcher/tsconfig.json
- drill-dr-failover.mjs
- smoke-webhooks-e2e.mjs
- pen-test-selfcheck.mjs
- Penetration test engagement pack (Phase 1 gate #12)
- terraform-validate.mjs
- Local progressive canary procedure (does not satisfy Phase 1 gate #2)
- verify-webhooks-gates.mjs
- start-embedded-db.mjs
- verify-staging-ready.mjs
- DataTable.vue
- smoke-staging-checklist.mjs
- ReportsView.vue
- i18n/index.ts
- main.ts
- BaseButton.vue
- nav.ts
- AppBreadcrumbs.vue
- FormField.vue
- ThemeSwitcher.vue
- TabGroup.vue
- BaseFileInput.vue
- Accordion.vue
- BaseSwitch.vue
- AppSidebar.vue
- BaseCheckbox.vue
- BaseDatePicker.vue
- BaseRadio.vue
- BaseTooltip.vue
- CurrencyInput.vue
- BaseProgress.vue
- BaseAvatar.vue
- AiApprovalDialog.vue
- BaseTextarea.vue
- Pagination.vue
- AuditTrailList.vue
- PayslipView.vue
- PercentInput.vue
- PhoneInput.vue
- Modal.vue
- SyncStatusPanel.vue

## God Nodes (most connected - your core abstractions)
1. `scripts` - 91 edges
2. `api()` - 43 edges
3. `compilerOptions` - 20 edges
4. `compilerOptions` - 19 edges
5. `05 — Architecture Diagrams` - 19 edges
6. `computePayroll()` - 17 edges
7. `23 — Testing Strategy` - 17 edges
8. `6.3 Service specifications` - 16 edges
9. `10 — API Design Standards` - 16 edges
10. `18 — AI and LLM Architecture and Governance` - 15 edges

## Surprising Connections (you probably didn't know these)
- `main()` --indirect_call--> `channel()`  [INFERRED]
  backend/packages/db/src/seed.ts → scripts/check-contrast.mjs
- `registerPayrollRoutes()` --indirect_call--> `rulesetHash()`  [INFERRED]
  backend/services/hr-payroll-service/src/payroll-routes.ts → backend/packages/payroll-engine/src/types.ts
- `load()` --calls--> `api()`  [EXTRACTED]
  frontend/src/views/ReportsView.vue → frontend/src/lib/api.ts
- `shutdown()` --references--> `embedded-postgres`  [EXTRACTED]
  scripts/start-embedded-db.mjs → package.json
- `dispatchEvent()` --indirect_call--> `sub()`  [INFERRED]
  backend/services/webhook-dispatcher/src/index.ts → backend/packages/payroll-engine/src/decimal.ts

## Import Cycles
- None detected.

## Communities (321 total, 20 thin omitted)

### Community 0 - "Root Workspace Manifest"
Cohesion: 0.02
Nodes (91): scripts, accountant:review-pack, build, build:backend, build:frontend, canary:analysis-stub, canary:local, chaos:catalogue (+83 more)

### Community 1 - "File Service Package"
Cohesion: 0.05
Nodes (37): dependencies, express, multer, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/logging (+29 more)

### Community 2 - "API Gateway Package"
Cohesion: 0.06
Nodes (31): dependencies, express, http-proxy-middleware, jose, @ngois/config, @ngois/errors, @ngois/logging, @ngois/service-kit (+23 more)

### Community 3 - "Auth Service Package"
Cohesion: 0.06
Nodes (31): dependencies, jose, @ngois/config, @ngois/db, @ngois/errors, @ngois/logging, @ngois/rbac, @ngois/service-kit (+23 more)

### Community 4 - "Frontend Package"
Cohesion: 0.06
Nodes (33): dependencies, pinia, @tanstack/vue-virtual, vue, vue-i18n, vue-router, devDependencies, typescript (+25 more)

### Community 5 - "Vue App Shell UI"
Cohesion: 0.09
Nodes (19): auth, closeDrawer(), drawerOpen, drawerRoot(), groupContainsPath(), menuBtn, onGlobalKey(), openGroups (+11 more)

### Community 6 - "Grant Service Package"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, zod (+19 more)

### Community 7 - "Outbox Relay Package"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/config, @ngois/db, @ngois/logging, pg, redis, zod, devDependencies (+19 more)

### Community 8 - "Frontend TypeScript Config"
Cohesion: 0.07
Nodes (27): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+19 more)

### Community 9 - "Audit Package"
Cohesion: 0.07
Nodes (26): dependencies, @ngois/db, @ngois/errors, @ngois/tenant-context, pg, devDependencies, tsx, @types/pg (+18 more)

### Community 10 - "RBAC Permission Expand"
Cohesion: 0.22
Nodes (21): actionOf(), allPermissions(), expandRoleOrThrow(), isTenantDomainPermission(), isWritePermission(), permissionFlags(), permissionsForRole(), roleHasPermission() (+13 more)

### Community 11 - "Service Kit Package"
Cohesion: 0.07
Nodes (26): dependencies, express, @ngois/errors, @ngois/logging, uuid, zod, devDependencies, @types/express (+18 more)

### Community 12 - "Dev Tooling Dependencies"
Cohesion: 0.07
Nodes (28): axe-core, c8, embedded-postgres, @embedded-postgres/windows-x64, eslint, devDependencies, axe-core, c8 (+20 more)

### Community 13 - "Tenant Service Package"
Cohesion: 0.07
Nodes (29): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, @ngois/webhook-egress (+21 more)

### Community 14 - "SDD PDF Build Tools"
Cohesion: 0.16
Nodes (22): assemble(), BOOK, buildDocument(), chapterId(), chapterTitle(), compactControlBlock(), coverHtml(), demoteHeadings() (+14 more)

### Community 15 - "Crypto Package"
Cohesion: 0.09
Nodes (21): dependencies, @ngois/errors, pg, devDependencies, tsx, @types/pg, exports, @ngois/errors (+13 more)

### Community 16 - "Tenant Context Package"
Cohesion: 0.09
Nodes (21): dependencies, @ngois/errors, pg, devDependencies, tsx, @types/pg, exports, @ngois/errors (+13 more)

### Community 17 - "Backend TSConfig Base"
Cohesion: 0.09
Nodes (21): compilerOptions, declaration, declarationMap, esModuleInterop, exactOptionalPropertyTypes, forceConsistentCasingInFileNames, isolatedModules, lib (+13 more)

### Community 18 - "DB Package"
Cohesion: 0.10
Nodes (20): dependencies, pg, devDependencies, tsx, @types/pg, exports, pg, tsx (+12 more)

### Community 19 - "Grant Detail Vue UI"
Cohesion: 0.08
Nodes (25): describedBy, emit, id, props, approveDisbursement(), auditItems, auth, createDisbursement() (+17 more)

### Community 20 - "service-kit/src/index.ts"
Cohesion: 0.13
Nodes (14): BLOCKED, createLogger(), LogFields, Logger, LogLevel, scrub(), write(), createApp() (+6 more)

### Community 21 - "pdf/package.json"
Cohesion: 0.11
Nodes (18): dependencies, jsdom, marked, mermaid, puppeteer-core, description, jsdom, mermaid (+10 more)

### Community 22 - "finance.ts"
Cohesion: 0.13
Nodes (18): coaSchema, expenseSchema, registerCoaExpenseRoutes(), ServiceConfig, assertWithinCeiling(), createBudgetSchema, createDisbursementSchema, disbursedTotal() (+10 more)

### Community 23 - "GrantsView.vue"
Cohesion: 0.14
Nodes (12): columns, createGrant(), error, filterQuery, form, Grant, grants, load() (+4 more)

### Community 24 - "config/package.json"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 25 - "check-bundle-budget.mjs"
Cohesion: 0.15
Nodes (12): assets, BUDGETS, check(), css, files, initialCss, initialJs, js (+4 more)

### Community 26 - "audit/src/index.ts"
Cohesion: 0.24
Nodes (10): AuditActorType, AuditHashInput, AuditOutcome, ChainBreak, computeRecordHash(), stableStringify(), verifyTenantChain(), writeAuditEvent() (+2 more)

### Community 27 - "rbac/package.json"
Cohesion: 0.15
Nodes (12): exports, main, name, private, scripts, build, generate:sql, test (+4 more)

### Community 28 - "crypto/src/index.ts"
Cohesion: 0.29
Nodes (12): blindIndex(), decryptUtf8(), deriveIndexKey(), EncryptedBlob, encryptUtf8(), ensureTenantDek(), masterKeyFromEnv(), unwrapDek() (+4 more)

### Community 29 - "errors/package.json"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 30 - "logging/package.json"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 31 - "outbox-relay/src/index.ts"
Cohesion: 0.22
Nodes (8): config, drainBatch(), log, OutboxRow, pool, publish(), streamFor(), ADR-0011

### Community 32 - "verify-alerts-runbooks.mjs"
Cohesion: 0.17
Nodes (10): map, mapPath, mapText, opsPhase2, rb05, root, ruleAlerts, ruleRunbooks (+2 more)

### Community 34 - "service-kit/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json (+1 more)

### Community 35 - "tenant-context/tsconfig.json"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json (+1 more)

### Community 36 - "audit/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 37 - "config/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 38 - "crypto/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 39 - "db/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 40 - "errors/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 41 - "logging/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 42 - "rbac/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 43 - "tenant-context/src/index.ts"
Cohesion: 0.36
Nodes (5): setTenantLocal(), TenantContext, withTenant(), isTenantRedisKey(), tenantRedisKey()

### Community 44 - "auth-service/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json, references

### Community 45 - "file-service/src/index.ts"
Cohesion: 0.25
Nodes (8): ALLOWED_TYPES, { app, log }, config, pool, root, safeFilename(), tenantKey(), upload

### Community 46 - "auth.ts"
Cohesion: 0.22
Nodes (8): DynamicField, DynamicFieldOption, DynamicFormValue, emit, props, setBool(), setString(), values

### Community 47 - "LoginView.vue"
Cohesion: 0.07
Nodes (28): accountOptions, accountTypeOptions, activeTab, burnBudget, burnCategories, burnSpent, busy, Bva (+20 more)

### Community 48 - "isolation-suite.mjs"
Cohesion: 0.31
Nodes (6): apiAvailable(), CATEGORIES, loadRedisHelpers(), main(), safeFilename(), tenantStorageKey()

### Community 49 - "api-gateway/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 50 - "file-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 51 - "grant-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 52 - "outbox-relay/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 53 - "tenant-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 54 - "api-gateway/src/index.ts"
Cohesion: 0.22
Nodes (7): app, config, DEFAULT_RPM, log, PUBLIC_PATHS, secret, tenantWindows

### Community 55 - "auth-service/src/index.ts"
Cohesion: 0.29
Nodes (6): { app, log }, config, loginSchema, pool, secret, ADR-0004

### Community 56 - "dependencies"
Cohesion: 0.33
Nodes (5): dependencies, jsdom, mermaid, jsdom, mermaid

### Community 57 - "sdd/README.md"
Cohesion: 0.14
Nodes (16): Backend, Frontend, Backup restore drill record (stub template), Checklist (stub), Checklist (stub), Regional failover drill record (stub template), How to refresh local evidence, Phase 1 gate status (SDD §31.3.3) (+8 more)

### Community 58 - "browser-smoke.mjs"
Cohesion: 0.22
Nodes (4): errors, outDir, require, root

### Community 59 - "check-contrast.mjs"
Cohesion: 0.31
Nodes (7): main(), channel(), darkPairs, hexToRgb(), lightPairs, luminance(), ratio()

### Community 60 - "verify-set-local.mjs"
Cohesion: 0.33
Nodes (4): BAD, root, roots, SKIP

### Community 61 - "tenant-service/src/index.ts"
Cohesion: 0.19
Nodes (11): { app, log }, config, createSchema, dsarSchema, erasureSchema, pool, allowPrivateEgress(), createSchema (+3 more)

### Community 62 - "validate.mjs"
Cohesion: 0.40
Nodes (3): dom, failures, SKIP

### Community 63 - "10 — API Design Standards"
Cohesion: 0.05
Nodes (37): 10.10 Concurrency control, 10.11.1 Strategy, 10.11.2 Deprecation process, 10.11 Versioning and deprecation, 10.12.1 Batch requests, 10.12.2 Asynchronous jobs, 10.12 Bulk and asynchronous operations, 10.13 Webhooks (+29 more)

### Community 64 - "verify-platform.mjs"
Cohesion: 0.29
Nodes (6): dashboards, required, root, services, tf, tfScript

### Community 70 - "seed.ts"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, zod (+19 more)

### Community 87 - "compute.ts"
Cohesion: 0.08
Nodes (42): basisAmount(), computePayroll(), cumulativePayeUg(), marginalPayeSs(), prorate(), serialiseResult(), sumAllowances(), add() (+34 more)

### Community 88 - "Appendix B — Data Dictionary"
Cohesion: 0.06
Nodes (36): Appendix B — Data Dictionary, `audit_events`, B.1.1 Standard columns, B.1.2 Type conventions, B.1 How to read this appendix, B.2 Platform and tenancy, B.3 Grants and finance, B.4 HR and payroll (+28 more)

### Community 89 - "Appendix I — Algorithms and Worked Examples"
Cohesion: 0.06
Nodes (35): Appendix I — Algorithms and Worked Examples, I.1 Rules that apply to every algorithm here, I.2.1 Model, I.2.2 Factor bands, I.2.3 Bands, I.2.4 Worked example, I.2.5 Properties and limitations, stated, I.2 Vulnerability scoring (+27 more)

### Community 90 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, @ngois/audit, @ngois/config, @ngois/crypto, @ngois/db, @ngois/errors, @ngois/payroll-engine, @ngois/service-kit (+23 more)

### Community 91 - "09 — Data Management Strategy"
Cohesion: 0.06
Nodes (32): 09 — Data Management Strategy, 9.10 Data quality, 9.1 Why this chapter exists, 9.2.1 Principles, 9.2.2 Index catalog by access pattern, 9.2.3 Indexes deliberately not created, 9.2.4 Index maintenance, 9.2 Indexing strategy (+24 more)

### Community 92 - "24 — Observability"
Cohesion: 0.06
Nodes (32): 24.10 Retention and cost, 24.11.1 New service observability checklist, 24.11 Observability governance, 24.1 What observability is for here, 24.2.1 Conventions, 24.2.2 Registry — HTTP and gateway, 24.2.3 Registry — database and cache, 24.2.4 Registry — events (+24 more)

### Community 93 - "11 — Event-Driven Architecture"
Cohesion: 0.07
Nodes (29): 11.10 Correlation and causation, 11.11 Scheduled events, 11.12 Observability of the event system, 11.13 Testing events, 11.1 Why events, 11.2.1 Stream design, 11.2 Topology, 11.3.1 The problem it solves (+21 more)

### Community 94 - "14 — Security Architecture"
Cohesion: 0.07
Nodes (29): 14.10 Security in the development lifecycle, 14.11 Third-party and supply chain, 14.12 Residual risks accepted, 14.1 Security objectives, 14.2.1 Login flow, 14.2.2 Credentials and account protection, 14.2.3 Multi-factor authentication, 14.2.4 Token design (+21 more)

### Community 95 - "17 — Privacy, Data Protection and Humanitarian Compliance"
Cohesion: 0.07
Nodes (29): 17.10 Data residency and transfers, 17.11.1 Definition and severity, 17.11.2 Response timeline, 17.11.3 Notifying beneficiaries, 17.11 Breach response, 17.12 Compliance mapping, 17.13 Governance, 17.1 The starting position (+21 more)

### Community 96 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, zod (+19 more)

### Community 97 - "6.3 Service specifications"
Cohesion: 0.08
Nodes (26): 06 — Microservice Design, 6.1 Decomposition rationale, 6.2.1 What every service has, from the shared template, 6.2 Service inventory, 6.3.10 `reporting-service` (port 3008, Tier 2), 6.3.11 `audit-service` (port 3009, Tier 2), 6.3.12 `file-service` (port 3010, Tier 2), 6.3.13 `integration-service` (port 3011, Tier 3) (+18 more)

### Community 98 - "27 — Disaster Recovery and Business Continuity"
Cohesion: 0.08
Nodes (26): 27.10.1 Third-party dependency positions, 27.10 Roles and dependencies, 27.1 Scope and posture, 27.2.1 What zero RPO means and does not mean, 27.2 RPO and RTO by tier, 27.3.1 The key management problem, 27.3.2 Backup verification, 27.3 Backup strategy (+18 more)

### Community 99 - "29 — Multi-Tenancy and Tenant Lifecycle"
Cohesion: 0.08
Nodes (26): 29.10 Known residual risks, 29.1 The stakes, 29.2.1 Why hybrid rather than one approach, 29.2.2 The layers, 29.2 The isolation model, 29.3.1 The policy, 29.3.2 Correction to v1.0, 29.3.3 The `SET LOCAL` requirement — the most dangerous defect available (+18 more)

### Community 100 - "31 — Implementation Roadmap"
Cohesion: 0.08
Nodes (26): 31.1.1 Consequences of the revision, 31.1 What changed from v1.0, 31.2 Phase overview, 31.3.1 Scope, 31.3.2 Explicitly deferred, 31.3.3 Gate — none of these are negotiable, 31.3 Phase 1 — Foundation, 31.4.1 Scope (+18 more)

### Community 101 - "05 — Architecture Diagrams"
Cohesion: 0.08
Nodes (25): 05 — Architecture Diagrams, 5.10 Environment and promotion topology, 5.11 Data flow — J1: recording a grant disbursement, 5.12 Data flow — J2: staff onboarding triggering LMS induction, 5.13 Data flow — J3: offline field submission and sync, 5.14 Data flow — J4: monthly payroll run, 5.15 Data flow — J5: donor report generation with AI assistance, 5.16 Data flow — tenant provisioning (+17 more)

### Community 102 - "13 — Offline-First and Field Operations Architecture"
Cohesion: 0.08
Nodes (25): 13.10 Testing the offline path, 13.11 Business continuity for extended outages, 13.1 The requirement and why it dominates the design, 13.2 Architecture overview, 13.3.1 Object stores, 13.3.2 The beneficiary cache is the sensitive decision, 13.3.3 Durability, 13.3 Local storage design (+17 more)

### Community 103 - "15 — RBAC and Authorization Matrix"
Cohesion: 0.08
Nodes (25): 15.1.1 Permission naming, 15.1.2 Role definitions, 15.1.3 Inheritance, 15.1 The model, 15.2.1 Identity and tenant administration, 15.2.2 Grant management, 15.2.3 HR and payroll, 15.2.4 Beneficiary and programme (+17 more)

### Community 104 - "19 — Frontend Architecture"
Cohesion: 0.08
Nodes (25): 19.10 API interaction, 19.11 Security in the client, 19.12 Progressive web app, 19.13 Error handling in the UI, 19.14 Frontend testing, 19.1 Constraints that shape the frontend, 19.2 Technology, 19.3.1 Module boundaries (+17 more)

### Community 105 - "23 — Testing Strategy"
Cohesion: 0.08
Nodes (25): 23.10 AI-specific testing, 23.11.1 Scenarios, 23.11.2 Method, 23.11 Performance and load testing, 23.12 Chaos engineering, 23.13 Security testing, 23.14 Accessibility testing, 23.15 Test data (+17 more)

### Community 106 - "18 — AI and LLM Architecture and Governance"
Cohesion: 0.08
Nodes (24): 18.10 Cost control, 18.11 Evaluation, 18.12 AI-specific threats, 18.13 Transparency and consent, 18.14 Governance, 18.1.1 The five rules, 18.1 Position, 18.2.1 Approved (+16 more)

### Community 107 - "21 — Deployment and Infrastructure"
Cohesion: 0.08
Nodes (24): 21.1 Platform choices, 21.2.1 Why staging holds no production data, 21.2.2 Promotion, 21.2 Environments, 21.3.1 Node pool rationale, 21.3.2 Namespaces, 21.3 Cluster topology, 21.4.1 Resource requests and limits (+16 more)

### Community 108 - "25 — Performance, Scalability and Capacity Planning"
Cohesion: 0.08
Nodes (24): 25.1 What performance means for these users, 25.2.1 Read endpoints, 25.2.2 Write endpoints, 25.2.3 Perceived performance, 25.2 Latency budgets, 25.3.1 The N+1 rule, 25.3.2 Query rules, 25.3.3 Caching (+16 more)

### Community 109 - "payroll-routes.ts"
Cohesion: 0.08
Nodes (31): allowanceSchema, createContractSchema, createDeptSchema, createEmployeeSchema, fxRefreshSchema, registerHrRoutes(), ServiceConfig, { app, log } (+23 more)

### Community 110 - "4.2 The twelve principles"
Cohesion: 0.09
Nodes (23): 04 — Architecture Principles, Assumptions and Constraints, 4.1 Why this chapter exists, 4.2 The twelve principles, 4.3 When principles conflict, 4.4 Design assumptions, 4.5.1 Technical constraints, 4.5.2 Regulatory and contractual constraints, 4.5.3 Organisational and delivery constraints (+15 more)

### Community 111 - "routes.ts"
Cohesion: 0.11
Nodes (27): linesToPdf(), rowsToCsv(), rowsToXlsx(), { app, log }, config, pool, root, quoteIdent() (+19 more)

### Community 112 - "22 — CI/CD, Release Management and Supply Chain Security"
Cohesion: 0.09
Nodes (22): 22.10 Pipeline metrics, 22.1 Objectives, 22.2 Branching and versioning, 22.3.1 Quality gates, 22.3 Pipeline, 22.4.1 Container images, 22.4.2 Dependency policy, 22.4 Build (+14 more)

### Community 113 - "26 — Reliability, Incident Management and On-Call"
Cohesion: 0.09
Nodes (22): 26.1 The honest starting point, 26.2.1 Escalation triggers regardless of initial severity, 26.2 Severity, 26.3.1 Break-glass access, 26.3 On-call, 26.4.1 Mitigate before diagnosing, 26.4.2 Roles, 26.4.3 The timeline (+14 more)

### Community 114 - "08 — Database Schema"
Cohesion: 0.10
Nodes (21): 08 — Database Schema, 8.10 Database roles and grants, 8.11 Schema verification, 8.1.1 Standard columns, 8.1.2 Global rules, 8.1.3 Extensions, 8.1.4 Shared trigger functions, 8.1.5 Row-level security template (+13 more)

### Community 115 - "16.5 STRIDE enumeration"
Cohesion: 0.10
Nodes (21): 16.1.1 Scoring, 16.1 Method and scope, 16.2 Asset register, 16.3 Threat actors, 16.4 Trust boundaries, 16.5 STRIDE enumeration, 16.6 Abuse cases, 16.7 Threat coverage summary (+13 more)

### Community 116 - "35 — Engineering Standards and Ways of Working"
Cohesion: 0.10
Nodes (21): 35.10 Tech radar, 35.1 What standards are for, 35.2 Code ownership, 35.3.1 Expectations, 35.3.2 What a reviewer is responsible for, 35.3.3 Review conduct, 35.3 Code review, 35.4.1 Enforced automatically (+13 more)

### Community 117 - "7.3 Entity-relationship diagrams"
Cohesion: 0.10
Nodes (20): 07 — Domain Model and Entity-Relationship Design, 7.1.1 The `enrollment` collision, 7.1 Bounded context map, 7.2.1 Grant Management, 7.2.2 People Operations, 7.2.3 Beneficiary and Programme, 7.2.4 Field Data, 7.2 Ubiquitous language (+12 more)

### Community 118 - "12 — Integration Architecture"
Cohesion: 0.10
Nodes (20): 12.10 Adding a new integration, 12.1 Principles for external systems, 12.2 Integration inventory, 12.3.1 Connector resilience summary, 12.3 Resilience configuration, 12.4.1 What it is and why it matters, 12.4.2 Flow, 12.4.3 Exclusion policy (+12 more)

### Community 119 - "5. Procedure"
Cohesion: 0.11
Nodes (19): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Establish the facts, 5.2 Classify the failure, 5.3 Missing tax bands, 5.4 Missing or stale exchange rate (+11 more)

### Community 120 - "5. Procedure"
Cohesion: 0.11
Nodes (19): 1. When this runs, 2. Authorisation, 3. Prerequisites, 4. Do not, 5.1 Confirm — 0 to 15 minutes, 5.2 Declare — 15 to 25 minutes, 5.3 Fence the primary — 20 to 25 minutes, 5.4 Build the DR region — 25 to 70 minutes (+11 more)

### Community 121 - "RB-16 — Field Sync Failure"
Cohesion: 0.11
Nodes (19): 10. Escalation, 11. Follow-up, 1. Why this escalates, 2. Symptoms, 3. The absence case, 4. Prerequisites, 5. Do not, 6.1 Establish the shape of the failure (+11 more)

### Community 122 - "Document Control"
Cohesion: 0.11
Nodes (18): 1. Identification, 2. Ownership and accountability, 3. Approval record, 4. Distribution list, 5. Revision history, 6.1 New chapters, 6.2 Expanded chapters, 6.3 Normalisation of identifiers (+10 more)

### Community 123 - "20.5 Feature flags"
Cohesion: 0.11
Nodes (18): 20.1 Principles, 20.2.1 The boot-time contract, 20.2.2 Configuration registry, 20.2 Configuration hierarchy, 20.3.1 Inventory, 20.3.2 Delivery to workloads, 20.3.3 Rotation, 20.3.4 Compromise response (+10 more)

### Community 124 - "RB-11 — Backup Restore and Point-in-Time Recovery"
Cohesion: 0.11
Nodes (18): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Establish scope and choose an approach, 5.2 Undelete soft-deleted rows, 5.3 Targeted repair from the audit trail, 5.4 Tenant-level restore (+10 more)

### Community 125 - "RB-14 — Security Incident and Suspected Data Exposure"
Cohesion: 0.11
Nodes (18): 1. The governing instruction, 2. Immediate actions — first 15 minutes, 3. Prerequisites, 4. Do not, 5.1 Classify, 5.2 Cross-tenant data access — the most serious class, 5.3 PII egress to the LLM provider, 5.4 Audit chain broken (+10 more)

### Community 126 - "RB-15 — External Integration Failure"
Cohesion: 0.11
Nodes (18): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Identify and confirm, 5.2 Email or SMS, 5.3 Mobile money, 5.4 Bank webhooks (+10 more)

### Community 127 - "NGO Intelligence Suite"
Cohesion: 0.12
Nodes (17): Conventions, Database setup, NGO Intelligence Suite, Option A — Docker, Option B — Local PostgreSQL (no Docker), Phase 1 scope, Phase 2 scope (Workforce), Phase 3 scope (Field — full close) (+9 more)

### Community 128 - "33 — Cost Model and FinOps"
Cohesion: 0.12
Nodes (17): 33.1 Why cost is an architectural concern here, 33.2.1 At Phase 2 completion — 8 tenants, ~250 users, 33.2.2 At Phase 4 completion — 35 tenants, ~1,200 users, 33.2.3 Non-production, 33.2 Production infrastructure, 33.3 Third-party services, 33.4.1 The shape of the curve, 33.4.2 Cost per tenant is not uniform (+9 more)

### Community 129 - "Table of contents"
Cohesion: 0.12
Nodes (17): Appendices, Architecture Decision Records, Automated consistency checks, Document conventions, Front matter, How to use this document, Maintaining this document, NGO Intelligence Suite — Software Design Document (+9 more)

### Community 130 - "RB-08 — Capacity and Saturation Response"
Cohesion: 0.12
Nodes (17): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Locate the bottleneck before acting, 5.2 A single service is saturated, 5.3 The database is the constraint, 5.4 Redis pressure (+9 more)

### Community 131 - "RB-09 — Secret Rotation, Planned and Emergency"
Cohesion: 0.12
Nodes (17): 1. When this runs, 2. Prerequisites, 3. Do not, 4. Which secret, 5.1 Database service-role password, 5.2 JWT signing key, 5.3 Per-tenant PII data key, 5.4 Redis AUTH (+9 more)

### Community 132 - "RB-04 — Certificate Rotation and Expiry Recovery"
Cohesion: 0.12
Nodes (16): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Identify which certificate, 5.2 Internal certificate renewal failing, not yet expired, 5.3 Internal certificate already expired — SEV-1, 5.4 Tenant custom domain (+8 more)

### Community 133 - "RB-06 — Tenant Offboarding and Data Deletion"
Cohesion: 0.12
Nodes (16): 1. When this runs, 2. The governing tension, 3. Prerequisites, 4. Do not, 5.1 Day 0 — Confirm and plan, 5.2 Day 0 — Suspend, 5.3 Day 1–7 — Export, 5.4 Day 30 — Delete personal data (+8 more)

### Community 134 - "RB-07 — Personal Data Erasure Request"
Cohesion: 0.12
Nodes (16): 1. When this runs, 2. Who does what, 3. Prerequisites, 4. Do not, 5.1 Record and verify, 5.2 Assess legal holds, 5.3 Approve, 5.4 Execute (+8 more)

### Community 135 - "ReportsView.vue"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, zod (+19 more)

### Community 136 - "payroll-engine/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, exports, tsx, main, name, private, scripts (+6 more)

### Community 137 - "02 — Introduction"
Cohesion: 0.13
Nodes (15): 02 — Introduction, 2.1 Purpose, 2.2.1 Capability domains in scope, 2.2.2 Cross-cutting capabilities in scope, 2.2.3 Explicitly out of scope, 2.2.4 Scope boundaries with adjacent systems, 2.2 Scope, 2.3 Intended audience (+7 more)

### Community 138 - "30 — Quality Attributes and Non-Functional Requirements"
Cohesion: 0.13
Nodes (15): 30.10 Portability and operability, 30.11 Business continuity in the field, 30.12 Explicit non-requirements, 30.13 Verification summary, 30.1.1 Verification methods, 30.1 How to read this chapter, 30.2 Functional suitability, 30.3 Performance efficiency (+7 more)

### Community 139 - "Appendix C — RBAC Permission Matrix"
Cohesion: 0.13
Nodes (15): Appendix C — RBAC Permission Matrix, C.10 Reporting, files, AI and audit, C.11.1 Why `super_admin` cannot read tenant data, C.11 Properties that hold across the whole matrix, C.1.1 Roles, C.1.2 Permission naming, C.1 Reading the matrix, C.2 Identity and access (+7 more)

### Community 140 - "RB-02 — Dead Letter Queue Drain and Event Replay"
Cohesion: 0.13
Nodes (15): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Determine which problem you have, 5.2 Outbox relay stalled, 5.3 Consumer lag, 5.4 Poison events in the DLQ (+7 more)

### Community 141 - "RB-03 — Database Failover and Recovery"
Cohesion: 0.13
Nodes (15): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Confirm the failure is the database, 5.2 Instance is up but unreachable, 5.3 Instance failed — HA failover, 5.4 Maintenance in progress (+7 more)

### Community 142 - "RB-05 — Tenant Provisioning"
Cohesion: 0.13
Nodes (15): 1. When this runs, 2. Prerequisites, 3. Do not, 4.1 Pre-flight, 4.2 Create the tenant, 4.3 Configure, 4.4 First administrator, 4.5 Verify isolation — the step that matters most (+7 more)

### Community 143 - "RB-13 — Service Unavailable or Crash Looping"
Cohesion: 0.13
Nodes (15): 1. Symptoms, 2. Impact, 3. Prerequisites, 4. Do not, 5.1 Two-minute triage, 5.2 Many services affected — find the shared dependency, 5.3 A single service is crash looping, 5.4 Service running but failing readiness (+7 more)

### Community 144 - "Appendix E — Error Code Registry"
Cohesion: 0.14
Nodes (14): Appendix E — Error Code Registry, E.1.1 Format, E.1.2 Number ranges within a domain, E.1.3 What every error response contains, E.1 Why a registry exists, E.2 `API` — cross-cutting, E.3 `AUTH` and `TEN`, E.4 `GRANT` and `FIN` (+6 more)

### Community 145 - "RB-10 — Hotfix Deployment"
Cohesion: 0.14
Nodes (14): 1. Before you use this runbook, 2. Prerequisites, 3. Do not, 4.1 Authorise and scope, 4.2 Make the change, 4.3 Review and pipeline, 4.4 Staging, 4.5 Production (+6 more)

### Community 146 - "PayrollView.vue"
Cohesion: 0.11
Nodes (25): api(), approveExpense(), createCoa(), createExpense(), load(), submitExpense(), approveId, auth (+17 more)

### Community 147 - "03 — System Overview and Context"
Cohesion: 0.15
Nodes (13): 03 — System Overview and Context, 3.1.1 Operating context that drives design, 3.1 Product vision, 3.2.1 Stakeholder register, 3.2.2 RACI for major decisions, 3.2 Stakeholders, 3.3.1 External system inventory, 3.3.2 Data processor implications (+5 more)

### Community 148 - "Appendix D — Event Catalog"
Cohesion: 0.15
Nodes (13): Appendix D — Event Catalog, D.10 Operational notes by stream, D.1.1 Rules that apply to every event, D.1 Conventions, D.2 `identity.events` — producer `auth-service`, D.3 `platform.events` — producers `tenant-service`, `file-service`, `reporting-service`, `integration-service`, scheduled jobs, D.4 `grant.events` — producer `grant-service`, D.5 `hr.events` — producer `hr-payroll-service` (+5 more)

### Community 149 - "Appendix H — Compliance Traceability Matrix"
Cohesion: 0.15
Nodes (13): Appendix H — Compliance Traceability Matrix, H.1.1 Evidence types, H.1 Purpose and honest scope, H.2.1 The two rows that required the most design, H.2 GDPR and equivalent data protection law, H.3.1 Where humanitarian standards exceed legal requirement, H.3 Humanitarian data protection, H.4.1 The tension this creates, and how it is resolved (+5 more)

### Community 150 - "32 — Risk Register"
Cohesion: 0.18
Nodes (11): 32.1 Scoring, 32.2 The critical risks, 32.3 Security and privacy risks, 32.4 Technical risks, 32.5 Operational risks, 32.6 Contextual and field risks, 32.7 Delivery risks, 32.8.1 Governance (+3 more)

### Community 151 - "package.json"
Cohesion: 0.18
Nodes (10): description, engines, node, name, private, version, workspaces, backend/packages/* (+2 more)

### Community 152 - "28 — Operational Runbooks"
Cohesion: 0.20
Nodes (10): 28.1.1 Format, 28.1 What a runbook is for, 28.2 The runbook set, 28.3.1 The mitigation-first reminder, 28.3 Common first steps, 28.4 Access required, 28.5.1 Two rules that keep the set trustworthy, 28.5.2 The offline bundle (+2 more)

### Community 153 - "Appendix G — Runbook Index"
Cohesion: 0.20
Nodes (10): Appendix G — Runbook Index, G.1 The index, G.2.1 From an alert, G.2.2 From a planned activity, G.2.3 From a tenant report, G.2 By entry point, G.3 Verification status, G.4.1 The most consequential "do not" instructions (+2 more)

### Community 154 - "payroll-engine/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 155 - "hr-payroll-service/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 156 - "34 — Future Extensibility"
Cohesion: 0.22
Nodes (9): 34.1 The position on extensibility, 34.2.1 Payroll jurisdictions, 34.2.2 Outbound webhooks, 34.2.3 Dynamic form definitions, 34.2 Extension points that exist, 34.3 Designed seams, 34.4 Roadmap horizon beyond Phase 4, 34.5 Rules for extending the platform (+1 more)

### Community 157 - "App.vue"
Cohesion: 0.12
Nodes (13): Approval, Checklist (completed), Data categories, Data subject rights, Superseded, Phase 2 DPIA — Workforce / Payroll (DPO-approved), Processing purposes, Retention (+5 more)

### Community 158 - "drill-backup-restore.mjs"
Cohesion: 0.22
Nodes (7): dumpDir, dumpPath, evidence, evidenceDir, hasPgDump, root, src

### Community 159 - "reporting-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 160 - "01 — Executive Summary"
Cohesion: 0.25
Nodes (8): 01 — Executive Summary, 1. The problem, 2. The solution, 3. The architecture in one page, 4. What this document commits to, 5. Delivery and investment, 6. The five risks that could sink this, 7. What is deliberately not being built

### Community 161 - "start-embedded-db.mjs"
Cohesion: 0.12
Nodes (12): AfricasTalkingAdapter, ChannelAdapter, LocalEmailAdapter, LocalSmsAdapter, SendGridAdapter, SendResult, { app, log }, config (+4 more)

### Community 162 - "ADR-0010 — Anthropic Claude as LLM Provider, with Hard Boundaries"
Cohesion: 0.29
Nodes (7): ADR-0010 — Anthropic Claude as LLM Provider, with Hard Boundaries, Alternatives considered, Consequences, Context, Decision, The boundaries, The provider

### Community 163 - "Appendix A — Glossary"
Cohesion: 0.29
Nodes (7): A.1 Humanitarian and development terms, A.2 Payroll and finance terms, A.3 Platform and architecture terms, A.4 Security, privacy and operations terms, A.5 Terms used with a deliberately narrow meaning, A.6 Abbreviations used in identifiers, Appendix A — Glossary

### Community 164 - "Appendix F — Architecture Decision Record Index"
Cohesion: 0.29
Nodes (7): Appendix F — Architecture Decision Record Index, F.1 The index, F.2 Grouped by concern, F.3 The load-bearing decisions, F.4 Decisions revisited on a schedule, F.5 Decisions where the reasoning is closest, F.6 Format and lifecycle

### Community 165 - "drill-audit-chain.mjs"
Cohesion: 0.29
Nodes (6): client, evidence, evidenceDir, results, root, TENANTS

### Community 166 - "drill-dr-stub.mjs"
Cohesion: 0.29
Nodes (6): drillDoc, drTf, evidence, evidenceDir, inventory, root

### Community 167 - "drill-encryption-sample.mjs"
Cohesion: 0.29
Nodes (6): { ciphertext }, client, evidence, evidenceDir, plain, root

### Community 168 - "drill-rb05-onboarding.mjs"
Cohesion: 0.29
Nodes (6): app, checklist, evidence, evidenceDir, owner, root

### Community 169 - "smoke-payroll-e2e.mjs"
Cohesion: 0.31
Nodes (6): api(), assert(), createUniqueRun(), csvArt, empNum, login()

### Community 170 - "verify-phase1-gates.mjs"
Cohesion: 0.29
Nodes (6): board, boardPath, EVIDENCE, evidenceDir, MUST_BLOCKED, root

### Community 171 - "db/src/payroll-schema.ts"
Cohesion: 0.40
Nodes (5): payrollSchemaName(), provisionPayrollSchema(), root, templatePath, ADR-0006

### Community 172 - "drill-rollback-local.mjs"
Cohesion: 0.33
Nodes (4): evidence, evidenceDir, root, started

### Community 173 - "provision-payroll-schemas.mjs"
Cohesion: 0.33
Nodes (4): client, root, template, templatePath

### Community 174 - "verify-phase2-gates.mjs"
Cohesion: 0.25
Nodes (6): board, boardPath, MUST_BLOCKED, MUST_PASS, requiredPaths, root

### Community 175 - "@ngois/rbac"
Cohesion: 0.40
Nodes (4): @ngois/rbac, Regenerate DB seed, Tests, Usage

### Community 176 - "ADR-0001 — Domain-Aligned Microservices over a Modular Monolith"
Cohesion: 0.40
Nodes (5): ADR-0001 — Domain-Aligned Microservices over a Modular Monolith, Alternatives considered, Consequences, Context, Decision

### Community 177 - "ADR-0002 — Hybrid Multi-Tenancy: Shared Schema with Row-Level Security"
Cohesion: 0.40
Nodes (5): ADR-0002 — Hybrid Multi-Tenancy: Shared Schema with Row-Level Security, Alternatives considered, Consequences, Context, Decision

### Community 178 - "ADR-0003 — Redis Streams as the Event Substrate, not Kafka"
Cohesion: 0.40
Nodes (5): ADR-0003 — Redis Streams as the Event Substrate, not Kafka, Alternatives considered, Consequences, Context, Decision

### Community 179 - "ADR-0004 — Supabase Auth as the Identity Provider"
Cohesion: 0.40
Nodes (5): ADR-0004 — Supabase Auth as the Identity Provider, Alternatives considered, Consequences, Context, Decision

### Community 180 - "ADR-0005 — Per-Entity Offline Conflict Resolution, not Last-Write-Wins"
Cohesion: 0.40
Nodes (5): ADR-0005 — Per-Entity Offline Conflict Resolution, not Last-Write-Wins, Alternatives considered, Consequences, Context, Decision

### Community 181 - "ADR-0006 — Per-Tenant PostgreSQL Schemas for Payroll Data"
Cohesion: 0.40
Nodes (5): ADR-0006 — Per-Tenant PostgreSQL Schemas for Payroll Data, Alternatives considered, Consequences, Context, Decision

### Community 182 - "ADR-0007 — TypeScript on Node.js 20 LTS Across All Services"
Cohesion: 0.40
Nodes (5): ADR-0007 — TypeScript on Node.js 20 LTS Across All Services, Alternatives considered, Consequences, Context, Decision

### Community 183 - "ADR-0008 — Synchronous Only When the User Is Waiting"
Cohesion: 0.40
Nodes (5): ADR-0008 — Synchronous Only When the User Is Waiting, Alternatives considered, Consequences, Context, Decision

### Community 184 - "ADR-0009 — Major API Version in the URI Path"
Cohesion: 0.40
Nodes (5): ADR-0009 — Major API Version in the URI Path, Alternatives considered, Consequences, Context, Decision

### Community 185 - "ADR-0011 — Transactional Outbox for Event Publication"
Cohesion: 0.40
Nodes (5): ADR-0011 — Transactional Outbox for Event Publication, Alternatives considered, Consequences, Context, Decision

### Community 186 - "ADR-0012 — A Custom Express API Gateway rather than Kong"
Cohesion: 0.40
Nodes (5): ADR-0012 — A Custom Express API Gateway rather than Kong, Alternatives considered, Consequences, Context, Decision

### Community 187 - "ADR-0013 — A Progressive Web App rather than Native Mobile Applications"
Cohesion: 0.40
Nodes (5): ADR-0013 — A Progressive Web App rather than Native Mobile Applications, Alternatives considered, Consequences, Context, Decision

### Community 188 - "ADR-0014 — Google Cloud, GKE Standard, and `africa-south1` as Primary Region"
Cohesion: 0.40
Nodes (5): ADR-0014 — Google Cloud, GKE Standard, and `africa-south1` as Primary Region, Alternatives considered, Consequences, Context, Decision

### Community 189 - "ADR-0015 — Application-Layer PII Encryption with Per-Tenant Keys"
Cohesion: 0.40
Nodes (5): ADR-0015 — Application-Layer PII Encryption with Per-Tenant Keys, Alternatives considered, Consequences, Context, Decision

### Community 190 - "ADR-0016 — Single Primary Region with Warm Standby, not Active-Active"
Cohesion: 0.40
Nodes (5): ADR-0016 — Single Primary Region with Warm Standby, not Active-Active, Alternatives considered, Consequences, Context, Decision

### Community 191 - "ADR-0017 — Self-Hosted Prometheus, Grafana, Loki and Tempo"
Cohesion: 0.40
Nodes (5): ADR-0017 — Self-Hosted Prometheus, Grafana, Loki and Tempo, Alternatives considered, Consequences, Context, Decision

### Community 192 - "ADR-0018 — Trunk-Based Development with Release Flags"
Cohesion: 0.40
Nodes (5): ADR-0018 — Trunk-Based Development with Release Flags, Alternatives considered, Consequences, Context, Decision

### Community 193 - "ADR-0019 — Build an Extension Point Only on the Second Concrete Case"
Cohesion: 0.40
Nodes (5): ADR-0019 — Build an Extension Point Only on the Second Concrete Case, Alternatives considered, Consequences, Context, Decision

### Community 194 - "ADR-0020 — Vue 3 with Pinia, TanStack Query and Tailwind"
Cohesion: 0.40
Nodes (5): ADR-0020 — Vue 3 with Pinia, TanStack Query and Tailwind, Alternatives considered, Consequences, Context, Decision

### Community 195 - "Supply-chain stubs (SDD §22.4)"
Cohesion: 0.40
Nodes (4): Container signing (cosign keyless), Provenance, SBOM, Supply-chain stubs (SDD §22.4)

### Community 196 - "Incident process (stub)"
Cohesion: 0.40
Nodes (5): After-action, Channels (stub), Declare first (security), Incident process (stub), Severity

### Community 197 - "canary-local-check.mjs"
Cohesion: 0.40
Nodes (4): evidence, evidenceDir, rollout, root

### Community 198 - "retention-sweep.mjs"
Cohesion: 0.40
Nodes (3): outDir, pool, root

### Community 199 - "run-load-tests.mjs"
Cohesion: 0.40
Nodes (4): evidenceDir, results, root, which

### Community 200 - "SDD PDF Export"
Cohesion: 0.50
Nodes (4): Build, Cadence, Output, SDD PDF Export

### Community 201 - "SDD Consistency Checks"
Cohesion: 0.50
Nodes (4): SDD Consistency Checks, The checks, What these checks do not catch, Why two checks are advisory rather than hard

### Community 202 - "Platform infrastructure (stubs)"
Cohesion: 0.12
Nodes (14): Environments, Layout, Local checks, Platform infrastructure (staging-ready modules + local prod-shaped stack), 0. Prerequisites, 1. Terraform (enable resources), 2. Argo CD + Rollouts, 3. Provider env secrets (+6 more)

### Community 203 - "On-call rotation (stub)"
Cohesion: 0.50
Nodes (3): Expectations, Handover checklist (stub), On-call rotation (stub)

### Community 204 - "Operations baseline (stubs)"
Cohesion: 0.50
Nodes (3): Files here, Operations baseline (stubs), Phase 1 runbooks (required)

### Community 205 - "test-coverage.mjs"
Cohesion: 0.50
Nodes (3): c8Bin, packages, root

### Community 206 - "backup-restore.md"
Cohesion: 0.07
Nodes (29): dependencies, @ngois/ai-redaction, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context (+21 more)

### Community 207 - "regional-failover.md"
Cohesion: 0.07
Nodes (29): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/k-anonymity, @ngois/service-kit, @ngois/tenant-context (+21 more)

### Community 212 - "LeaveView.vue"
Cohesion: 0.09
Nodes (25): approve(), balanceColumns, balanceFilter, balanceRows, balances, busy, createRequest(), Employee (+17 more)

### Community 213 - "EmployeesView.vue"
Cohesion: 0.07
Nodes (25): describedBy, emit, id, props, describedBy, emit, id, props (+17 more)

### Community 214 - "smoke-phase2-e2e.mjs"
Cohesion: 0.38
Nodes (5): api(), assert(), login(), now, period

### Community 215 - "drill-erasure.mjs"
Cohesion: 0.33
Nodes (4): evidence, outDir, pool, root

### Community 216 - "canary-analysis-stub.mjs"
Cohesion: 0.40
Nodes (4): evidence, outDir, path, root

### Community 217 - "leave-accrual.mjs"
Cohesion: 0.40
Nodes (4): month, now, pool, year

### Community 218 - "Retention sweep — prod schedule note"
Cohesion: 0.12
Nodes (13): baseP95, during, duringP95, EMP_COUNT, evidence, evidenceDir, MAX_MS, root (+5 more)

### Community 221 - "accountant-review-pack.mjs"
Cohesion: 0.14
Nodes (13): attestation, cases, fixtureRun, outDir, packBody, packHash, results, reviewer (+5 more)

### Community 222 - "drill-canary-abort.mjs"
Cohesion: 0.17
Nodes (10): abort, analysisRunAbort, analysisTpl, checks, evidence, evidenceDir, promote, rolloutManifest (+2 more)

### Community 223 - "dpia-attest.mjs"
Cohesion: 0.18
Nodes (10): attestation, body, compliance, dpiaPath, draftPath, evidenceDir, missing, required (+2 more)

### Community 224 - "Accountant review checklist — SS & UG"
Cohesion: 0.33
Nodes (5): Accountant review checklist — SS & UG, Attestation, Fixture corpus, Scope, Workpapers

### Community 225 - "FieldView.vue"
Cohesion: 0.08
Nodes (46): connectivity, { t }, { t }, CachedForm, clearSessionKey(), decryptJson(), encryptJson(), enqueueSubmission() (+38 more)

### Community 226 - "dependencies"
Cohesion: 0.06
Nodes (35): dependencies, @ngois/audit, @ngois/beneficiary-dedup, @ngois/config, @ngois/crypto, @ngois/db, @ngois/errors, @ngois/k-anonymity (+27 more)

### Community 227 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, @ngois/tenant-context, zod (+19 more)

### Community 228 - "beneficiary-dedup/src/index.ts"
Cohesion: 0.19
Nodes (14): buildIndexes(), daysApart(), DedupCandidate, DedupIndexes, DedupResult, DedupSignal, DedupSubject, hmacIndex() (+6 more)

### Community 229 - "vulnerability-score/src/index.ts"
Cohesion: 0.19
Nodes (15): band(), BENTIU_FIXTURE, DisplacementStatus, f1(), f2(), f3(), f4(), f5() (+7 more)

### Community 230 - "beneficiary-dedup/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, exports, tsx, main, name, private, scripts (+6 more)

### Community 231 - "vulnerability-score/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, exports, tsx, main, name, private, scripts (+6 more)

### Community 232 - "beneficiary-service/src/index.ts"
Cohesion: 0.18
Nodes (9): aggregateSchema, { app, log }, assessSchema, config, createBeneficiarySchema, enrollSchema, householdSchema, pool (+1 more)

### Community 233 - "beneficiary-dedup/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 234 - "vulnerability-score/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 235 - "beneficiary-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 236 - "field-data-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 237 - "field-data-service/src/index.ts"
Cohesion: 0.20
Nodes (9): { app, log }, batchSchema, config, createFormSchema, paperBatchSchema, paperRowsSchema, pool, registerDeviceSchema (+1 more)

### Community 238 - "offline-harness.mjs"
Cohesion: 0.29
Nodes (4): evidence, evidenceDir, root, uuids

### Community 239 - "verify-phase3-gates.mjs"
Cohesion: 0.29
Nodes (6): board, boardPath, evidenceFiles, MUST_PASS, required, root

### Community 241 - "k-anonymity/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, exports, tsx, main, name, private, scripts (+6 more)

### Community 242 - "api.ts"
Cohesion: 0.08
Nodes (20): emit, { t }, emit, columns, Delivery, error, filterQuery, loading (+12 more)

### Community 243 - "dpia-attest-phase3.mjs"
Cohesion: 0.18
Nodes (10): attestation, body, compliance, dpiaPath, draftPath, evidenceDir, missing, required (+2 more)

### Community 244 - "lms-service/src/index.ts"
Cohesion: 0.20
Nodes (9): { app, log }, attemptSchema, config, createCourseSchema, enrollSchema, onboardSchema, pool, progressSchema (+1 more)

### Community 245 - "k-anonymity/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 246 - "load-field-2g.mjs"
Cohesion: 0.22
Nodes (7): BUDGET_MS, COUNT, evidence, evidenceDir, root, t0, uuids

### Community 247 - "lms-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 248 - "notification-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 249 - "chaos-catalogue.mjs"
Cohesion: 0.25
Nodes (5): allPass, evidence, evidenceDir, results, root

### Community 250 - "smoke-paper-fallback.mjs"
Cohesion: 0.25
Nodes (6): evidence, evidenceDir, ids, matched, root, serials

### Community 251 - "k-anonymity/src/index.ts"
Cohesion: 0.38
Nodes (5): AggregateCell, KOCH_FIXTURE, PublishedCell, suppressAggregate(), SuppressResult

### Community 253 - "dependencies"
Cohesion: 0.07
Nodes (29): dependencies, @ngois/audit, @ngois/config, @ngois/db, @ngois/errors, @ngois/k-anonymity, @ngois/service-kit, @ngois/tenant-context (+21 more)

### Community 254 - "ai-insights-service/src/index.ts"
Cohesion: 0.11
Nodes (12): { app, log }, approveSchema, config, generateSchema, llm, pool, settingsSchema, createLlmAdapter() (+4 more)

### Community 255 - "ai-redaction/package.json"
Cohesion: 0.12
Nodes (15): devDependencies, tsx, exports, tsx, main, name, private, scripts (+7 more)

### Community 256 - "ai-redaction/src/index.ts"
Cohesion: 0.19
Nodes (14): assertNoFieldTextInPrompt(), COMMON_NAMES, extractFigures(), hasSmallCohort(), numericalGuardrail(), PERMITTED_DEFAULT, RedactionInput, redactionRatio() (+6 more)

### Community 257 - "generate-redaction-corpus.mjs"
Cohesion: 0.13
Nodes (13): admins, banks, coords, emails, fixtures, nids, outDir, path (+5 more)

### Community 258 - "integration-service/src/index.ts"
Cohesion: 0.16
Nodes (11): buildIatiActivity(), GrantForIati, IatiBuildInput, IatiDocument, PII_PATTERNS, validateIatiDocument(), { app, log }, config (+3 more)

### Community 259 - "BaseButton.vue"
Cohesion: 0.09
Nodes (23): allPageSelected, DataColumn, emit, filtered, isSelected(), keyFor(), page, pageCount (+15 more)

### Community 260 - "AiInsightsView.vue"
Cohesion: 0.13
Nodes (13): approve(), approveOpen, attest, busy, edit, error, generate(), Insight (+5 more)

### Community 261 - "ai-redaction/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 262 - "ComplianceView.vue"
Cohesion: 0.11
Nodes (18): props, { t }, formatMoney(), statusLabel(), awardColumns, awardFilter, awardRows, DisbursementReport (+10 more)

### Community 263 - "ai-insights-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 264 - "analytics-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 265 - "integration-service/tsconfig.json"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 266 - "start-embedded-db.mjs"
Cohesion: 0.07
Nodes (29): dependencies, @ngois/config, @ngois/db, @ngois/logging, @ngois/webhook-egress, pg, redis, zod (+21 more)

### Community 267 - "finops-attribution.mjs"
Cohesion: 0.29
Nodes (6): client, evidence, evidenceDir, root, rows, today

### Community 268 - "analytics-service/src/index.ts"
Cohesion: 0.33
Nodes (4): aggregateSchema, { app, log }, config, pool

### Community 269 - "SessionBanner.vue"
Cohesion: 0.07
Nodes (21): ChartSeries, COLORS, hasData, linePaths, maxVal, PAD, props, props (+13 more)

### Community 270 - "eval-ai-injection.mjs"
Cohesion: 0.33
Nodes (5): evidence, evidenceDir, injections, require, root

### Community 272 - "verify-phase4-gates.mjs"
Cohesion: 0.50
Nodes (3): board, required, root

### Community 273 - "WebhooksView.vue"
Cohesion: 0.13
Nodes (14): busy, create(), deliveries, Delivery, disable(), endpoint, error, load() (+6 more)

### Community 274 - "webhook-egress/package.json"
Cohesion: 0.13
Nodes (14): devDependencies, tsx, exports, tsx, main, name, private, scripts (+6 more)

### Community 275 - "webhook-egress/src/index.ts"
Cohesion: 0.26
Nodes (9): buildWebhookEnvelope(), isPrivateIp(), PII_KEYS, RETRY_DELAYS_MS, signBody(), stripPii(), UrlValidation, validateWebhookUrl() (+1 more)

### Community 276 - "stack-prod-shaped.mjs"
Cohesion: 0.15
Nodes (9): checks, compose, down, evidenceDir, pg, redis, redisOk, root (+1 more)

### Community 277 - "Phase 3 DPIA — Beneficiary / field data (DPO-approved)"
Cohesion: 0.20
Nodes (8): Checklist, Data subject rights, Superseded, Erasure + DSAR, Lawful bases, Phase 3 DPIA — Beneficiary / field data (DPO-approved), Retention, Risks & mitigations

### Community 278 - "webhook-egress/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 279 - "webhook-dispatcher/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 280 - "drill-dr-failover.mjs"
Cohesion: 0.28
Nodes (6): compose, composeFailover(), dc(), evidenceDir, ready(), root

### Community 281 - "smoke-webhooks-e2e.mjs"
Cohesion: 0.22
Nodes (4): env, mock, received, suspended

### Community 282 - "pen-test-selfcheck.mjs"
Cohesion: 0.25
Nodes (7): board, checks, evidence, evidenceDir, gate12Blocked, results, root

### Community 283 - "Penetration test engagement pack (Phase 1 gate #12)"
Cohesion: 0.29
Nodes (6): Assets to provide, Closure criterion, Penetration test engagement pack (Phase 1 gate #12), Rules of engagement, Scope (in), Scope (out)

### Community 284 - "terraform-validate.mjs"
Cohesion: 0.33
Nodes (5): envs, evidenceDir, results, root, tfCheck

### Community 285 - "Local progressive canary procedure (does not satisfy Phase 1 gate #2)"
Cohesion: 0.33
Nodes (5): Apply, Local / CI, Prerequisites, Progressive canary — Argo Rollouts (staging-ready), Weights (gate #2 prep)

### Community 286 - "verify-webhooks-gates.mjs"
Cohesion: 0.50
Nodes (3): board, required, root

### Community 287 - "start-embedded-db.mjs"
Cohesion: 0.07
Nodes (26): auth, minutesLeft, now, remainingMs, router, show, { t }, toast (+18 more)

### Community 289 - "DataTable.vue"
Cohesion: 0.17
Nodes (14): active, auth, close(), emit, filtered, go(), input, onKey() (+6 more)

### Community 290 - "smoke-staging-checklist.mjs"
Cohesion: 0.25
Nodes (5): ENV_NAMES, envPath, MARKERS, mdPath, root

### Community 291 - "ReportsView.vue"
Cohesion: 0.40
Nodes (5): AddressValue, emit, patch(), props, value

### Community 292 - "i18n/index.ts"
Cohesion: 0.24
Nodes (8): localeStore, { t }, AppLocale, isRtlLocale(), loadLocale(), MessageSchema, SUPPORTED_LOCALES, useLocaleStore

### Community 293 - "main.ts"
Cohesion: 0.25
Nodes (7): i18n, installRouteFocus(), app, localeStore, pinia, themeStore, router

### Community 294 - "BaseButton.vue"
Cohesion: 0.20
Nodes (7): emit, onKey(), panel, previouslyFocused, props, error, { t }

### Community 295 - "nav.ts"
Cohesion: 0.33
Nodes (5): PaletteItem, NAV_GROUPS, NavGroup, NavItem, paletteItemsFromNav()

### Community 296 - "AppBreadcrumbs.vue"
Cohesion: 0.40
Nodes (4): Crumb, crumbs, route, { t }

### Community 298 - "ThemeSwitcher.vue"
Cohesion: 0.24
Nodes (5): { t }, theme, ResolvedTheme, ThemePreference, useThemeStore

### Community 299 - "TabGroup.vue"
Cohesion: 0.31
Nodes (8): emit, focusTab(), onKeydown(), props, select(), selectedIndex, TabItem, tablistRef

### Community 300 - "BaseFileInput.vue"
Cohesion: 0.29
Nodes (7): describedBy, emit, id, inputRef, onChange(), props, selectedName

### Community 301 - "Accordion.vue"
Cohesion: 0.33
Nodes (5): AccordionItem, emit, openIds, props, toggle()

### Community 302 - "BaseSwitch.vue"
Cohesion: 0.40
Nodes (5): describedBy, emit, id, props, toggle()

### Community 303 - "AppSidebar.vue"
Cohesion: 0.40
Nodes (5): emit, onToggle(), props, SidebarNavGroup, SidebarNavItem

### Community 304 - "BaseCheckbox.vue"
Cohesion: 0.14
Nodes (11): describedBy, emit, id, props, auth, email, localError, password (+3 more)

### Community 305 - "BaseDatePicker.vue"
Cohesion: 0.38
Nodes (6): close(), emit, onKey(), panel, previouslyFocused, props

### Community 306 - "BaseRadio.vue"
Cohesion: 0.40
Nodes (4): describedBy, emit, id, props

### Community 308 - "CurrencyInput.vue"
Cohesion: 0.13
Nodes (14): c, clamped, offset, props, r, tone, busy, error (+6 more)

### Community 309 - "BaseProgress.vue"
Cohesion: 0.50
Nodes (3): clamped, id, props

### Community 310 - "BaseAvatar.vue"
Cohesion: 0.25
Nodes (4): initials, props, props, tone

### Community 311 - "AiApprovalDialog.vue"
Cohesion: 0.25
Nodes (7): close(), emit, { t }, describedBy, emit, id, props

### Community 312 - "BaseTextarea.vue"
Cohesion: 0.22
Nodes (6): emit, { t }, describedBy, emit, id, props

### Community 313 - "Pagination.vue"
Cohesion: 0.43
Nodes (6): emit, next(), onPageSizeChange(), prev(), props, { t }

### Community 318 - "PercentInput.vue"
Cohesion: 0.33
Nodes (5): describedBy, displayValue, emit, id, props

### Community 319 - "PhoneInput.vue"
Cohesion: 0.40
Nodes (4): describedBy, emit, id, props

### Community 320 - "Modal.vue"
Cohesion: 0.38
Nodes (6): close(), emit, onKey(), panel, previouslyFocused, props

### Community 321 - "SyncStatusPanel.vue"
Cohesion: 0.06
Nodes (25): { t }, address, amount, check, currency, date, drawerOpen, dyn (+17 more)

## Knowledge Gaps
- **2841 isolated node(s):** `name`, `version`, `private`, `type`, `main` (+2836 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **20 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `10 — API Design Standards` connect `10 — API Design Standards` to `sdd/README.md`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Why does `23 — Testing Strategy` connect `23 — Testing Strategy` to `sdd/README.md`?**
  _High betweenness centrality (0.008) - this node is a cross-community bridge._
- **Why does `24 — Observability` connect `24 — Observability` to `sdd/README.md`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _2841 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Root Workspace Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.02197802197802198 - nodes in this community are weakly interconnected._
- **Should `File Service Package` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `API Gateway Package` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._