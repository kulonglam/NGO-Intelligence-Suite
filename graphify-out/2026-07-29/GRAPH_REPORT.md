# Graph Report - .  (2026-07-28)

## Corpus Check
- 254 files · ~289,984 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1023 nodes · 1100 edges · 87 communities (78 shown, 9 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 2 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

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
- Community 20
- Community 21
- Community 22
- Community 23
- Community 24
- Community 25
- Community 26
- Community 27
- Community 28
- Community 29
- Community 30
- Community 31
- Community 32
- Community 33
- Community 34
- Community 35
- Community 36
- Community 37
- Community 38
- Community 39
- Community 40
- Community 41
- Community 42
- Community 43
- Community 44
- Community 45
- Community 46
- Community 47
- Community 48
- Community 49
- Community 50
- Community 51
- Community 52
- Community 53
- Community 54
- Community 55
- Community 56
- Community 57
- Community 58
- Community 59
- Community 60
- Community 61
- Community 62
- Community 63
- Community 64
- Community 65
- Community 66
- Community 67
- Community 68
- Community 69
- Community 73
- Community 74
- Community 75

## God Nodes (most connected - your core abstractions)
1. `scripts` - 32 edges
2. `compilerOptions` - 20 edges
3. `compilerOptions` - 19 edges
4. `assemble()` - 11 edges
5. `parseGrantCell()` - 9 edges
6. `ROLES` - 8 edges
7. `api()` - 8 edges
8. `useAuthStore` - 8 edges
9. `permissionsForRole()` - 7 edges
10. `scripts` - 7 edges

## Surprising Connections (you probably didn't know these)
- `shutdown()` --references--> `embedded-postgres`  [EXTRACTED]
  scripts/start-embedded-db.mjs → package.json
- `api()` --calls--> `useAuthStore`  [EXTRACTED]
  frontend/src/lib/api.ts → frontend/src/stores/auth.ts
- `createGrant()` --calls--> `api()`  [EXTRACTED]
  frontend/src/views/GrantsView.vue → frontend/src/lib/api.ts
- `main()` --calls--> `verifyTenantChain()`  [EXTRACTED]
  backend/packages/audit/src/verify-chain.ts → backend/packages/audit/src/index.ts
- `createApp()` --references--> `Logger`  [EXTRACTED]
  backend/packages/service-kit/src/index.ts → backend/packages/logging/src/index.ts

## Import Cycles
- None detected.

## Communities (87 total, 9 thin omitted)

### Community 0 - "Root Workspace Manifest"
Cohesion: 0.05
Nodes (42): description, engines, node, name, private, scripts, build, build:backend (+34 more)

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
Nodes (31): dependencies, pinia, vue, vue-i18n, vue-router, devDependencies, typescript, vite (+23 more)

### Community 5 - "Vue App Shell UI"
Cohesion: 0.10
Nodes (19): connectivity, { t }, { t }, localeStore, { t }, AppLocale, i18n, isRtlLocale() (+11 more)

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
Cohesion: 0.08
Nodes (24): embedded-postgres, @embedded-postgres/windows-x64, eslint, devDependencies, embedded-postgres, @embedded-postgres/windows-x64, eslint, prettier (+16 more)

### Community 13 - "Tenant Service Package"
Cohesion: 0.08
Nodes (23): dependencies, @ngois/config, @ngois/db, @ngois/errors, @ngois/service-kit, zod, devDependencies, tsx (+15 more)

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
Cohesion: 0.13
Nodes (19): api(), approveDisbursement(), auth, createDisbursement(), Disbursement, disbursements, error, fileInput (+11 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (14): BLOCKED, createLogger(), LogFields, Logger, LogLevel, scrub(), write(), createApp() (+6 more)

### Community 21 - "Community 21"
Cohesion: 0.11
Nodes (18): dependencies, jsdom, marked, mermaid, puppeteer-core, description, jsdom, mermaid (+10 more)

### Community 22 - "Community 22"
Cohesion: 0.20
Nodes (13): assertWithinCeiling(), createBudgetSchema, createDisbursementSchema, disbursedTotal(), ensureInitialBudget(), grantCeiling(), money, registerFinanceRoutes() (+5 more)

### Community 23 - "Community 23"
Cohesion: 0.17
Nodes (12): props, { t }, formatMoney(), statusLabel(), createGrant(), error, form, Grant (+4 more)

### Community 24 - "Community 24"
Cohesion: 0.14
Nodes (13): dependencies, zod, exports, zod, main, name, private, scripts (+5 more)

### Community 25 - "Community 25"
Cohesion: 0.15
Nodes (12): assets, BUDGETS, check(), css, files, initialCss, initialJs, js (+4 more)

### Community 26 - "Community 26"
Cohesion: 0.23
Nodes (10): AuditActorType, AuditHashInput, AuditOutcome, ChainBreak, computeRecordHash(), stableStringify(), verifyTenantChain(), writeAuditEvent() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.15
Nodes (12): exports, main, name, private, scripts, build, generate:sql, test (+4 more)

### Community 28 - "Community 28"
Cohesion: 0.27
Nodes (10): blindIndex(), decryptUtf8(), deriveIndexKey(), EncryptedBlob, encryptUtf8(), ensureTenantDek(), masterKeyFromEnv(), unwrapDek() (+2 more)

### Community 29 - "Community 29"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.18
Nodes (10): exports, main, name, private, scripts, build, typecheck, type (+2 more)

### Community 31 - "Community 31"
Cohesion: 0.22
Nodes (8): config, drainBatch(), log, OutboxRow, pool, publish(), streamFor(), ADR-0011

### Community 32 - "Community 32"
Cohesion: 0.18
Nodes (9): map, mapPath, mapText, rb05, root, ruleAlerts, ruleRunbooks, rulesPath (+1 more)

### Community 34 - "Community 34"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json (+1 more)

### Community 35 - "Community 35"
Cohesion: 0.20
Nodes (9): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json (+1 more)

### Community 36 - "Community 36"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 37 - "Community 37"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 38 - "Community 38"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 40 - "Community 40"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 41 - "Community 41"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 42 - "Community 42"
Cohesion: 0.22
Nodes (8): compilerOptions, composite, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 43 - "Community 43"
Cohesion: 0.36
Nodes (5): setTenantLocal(), TenantContext, withTenant(), isTenantRedisKey(), tenantRedisKey()

### Community 44 - "Community 44"
Cohesion: 0.22
Nodes (8): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json, references

### Community 45 - "Community 45"
Cohesion: 0.25
Nodes (8): ALLOWED_TYPES, { app, log }, config, pool, root, safeFilename(), tenantKey(), upload

### Community 46 - "Community 46"
Cohesion: 0.28
Nodes (6): AuthUser, Envelope, useAuthStore, auth, { t }, welcome

### Community 47 - "Community 47"
Cohesion: 0.22
Nodes (7): auth, email, localError, password, route, router, { t }

### Community 48 - "Community 48"
Cohesion: 0.31
Nodes (6): apiAvailable(), CATEGORIES, loadRedisHelpers(), main(), safeFilename(), tenantStorageKey()

### Community 49 - "Community 49"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 50 - "Community 50"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 51 - "Community 51"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 52 - "Community 52"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 53 - "Community 53"
Cohesion: 0.25
Nodes (7): compilerOptions, outDir, rootDir, extends, include, src/**/*, ../../tsconfig.base.json

### Community 54 - "Community 54"
Cohesion: 0.29
Nodes (5): app, config, log, PUBLIC_PATHS, secret

### Community 55 - "Community 55"
Cohesion: 0.29
Nodes (6): { app, log }, config, loginSchema, pool, secret, ADR-0004

### Community 56 - "Community 56"
Cohesion: 0.33
Nodes (5): dependencies, jsdom, mermaid, jsdom, mermaid

### Community 57 - "Community 57"
Cohesion: 0.33
Nodes (3): auth, router, { t }

### Community 58 - "Community 58"
Cohesion: 0.33
Nodes (3): errors, outDir, root

### Community 59 - "Community 59"
Cohesion: 0.53
Nodes (5): channel(), hexToRgb(), luminance(), pairs, ratio()

### Community 60 - "Community 60"
Cohesion: 0.33
Nodes (4): BAD, root, roots, SKIP

### Community 61 - "Community 61"
Cohesion: 0.40
Nodes (4): { app, log }, config, createSchema, pool

### Community 62 - "Community 62"
Cohesion: 0.40
Nodes (3): dom, failures, SKIP

### Community 63 - "Community 63"
Cohesion: 0.40
Nodes (4): describedBy, emit, id, props

### Community 64 - "Community 64"
Cohesion: 0.40
Nodes (4): dashboards, required, root, services

## Knowledge Gaps
- **583 isolated node(s):** `name`, `version`, `private`, `type`, `main` (+578 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **9 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useAuthStore` connect `Community 46` to `Community 57`, `Grant Detail Vue UI`, `Vue App Shell UI`, `Community 47`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **Why does `devDependencies` connect `Dev Tooling Dependencies` to `Root Workspace Manifest`?**
  _High betweenness centrality (0.001) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _583 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Root Workspace Manifest` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._
- **Should `File Service Package` be split into smaller, more focused modules?**
  _Cohesion score 0.05263157894736842 - nodes in this community are weakly interconnected._
- **Should `API Gateway Package` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._
- **Should `Auth Service Package` be split into smaller, more focused modules?**
  _Cohesion score 0.0625 - nodes in this community are weakly interconnected._