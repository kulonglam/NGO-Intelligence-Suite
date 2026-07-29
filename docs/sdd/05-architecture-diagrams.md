# 05 — Architecture Diagrams

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 05 — Architecture Diagrams
> **Owner:** Principal Architect
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Related ADRs:** [ADR-0001](adr/0001-microservices-over-modular-monolith.md), [ADR-0003](adr/0003-redis-streams-over-kafka.md), [ADR-0008](adr/0008-sync-vs-async-boundaries.md), [ADR-0014](adr/0014-gke-and-region-selection.md)

---

## 5.1 Diagram index and conventions

This chapter is the visual reference for the whole architecture. Every diagram is authored in Mermaid inline in this file so it is reviewable in a diff and cannot drift from a binary asset.

| § | Diagram | C4 level | Answers |
| --- | --- | --- | --- |
| 5.2 | System context | 1 | Who uses the system and what does it talk to |
| 5.3 | Container view | 2 | What are the deployable units and their data stores |
| 5.4 | Service interaction | — | Which service calls which, synchronously and asynchronously |
| 5.5 | Service dependency graph | — | What breaks when a given service fails |
| 5.6 | Component view, grant-service | 3 | How is a service structured internally |
| 5.7 | Network security zones | — | Where are the trust boundaries |
| 5.8 | Kubernetes deployment topology | — | How is it laid out in the cluster |
| 5.9 | Pod and container internals | — | What runs inside a pod |
| 5.10 | Environment and promotion topology | — | How code reaches production |
| 5.11–5.16 | Six data flow diagrams | — | How the key journeys actually work |
| 5.17 | Event flow overview | — | How events propagate across the system |
| 5.18 | Multi-region DR topology | — | What the failover picture looks like |

**Reading conventions.** Solid arrows are synchronous request/response. Dotted arrows are asynchronous messages. A double-headed arrow indicates bidirectional traffic. Cylinders are data stores. Subgraph boxes are deployment or trust boundaries.

---

## 5.2 System context (C4 Level 1)

Reproduced from [03](03-system-overview-and-context.md) for completeness of this chapter.

```mermaid
flowchart TB
    subgraph actors [Actors]
        Staff["NGO office staff"]
        Field["Field officer, offline"]
        DonorUser["Donor representative"]
        Auditor["Auditor"]
        Operator["Platform operator"]
    end

    Suite["<b>NGO Intelligence Suite</b><br/>Multi-tenant humanitarian<br/>operations platform"]

    subgraph systems [External systems]
        IATI["IATI Registry"]
        MoMo["Mobile money APIs"]
        Bank["Bank webhooks"]
        Mail["SendGrid"]
        SMS["Africa's Talking"]
        Claude["Anthropic Claude API"]
        FX["Central bank FX rates"]
        OIDC["Tenant OIDC provider"]
    end

    Staff --> Suite
    Field --> Suite
    DonorUser --> Suite
    Auditor --> Suite
    Operator --> Suite

    Suite --> IATI
    Suite <--> MoMo
    Bank --> Suite
    Suite --> Mail
    Suite --> SMS
    Suite --> Claude
    FX --> Suite
    OIDC --> Suite
```

---

## 5.3 Container view (C4 Level 2)

The deployable units and the stores they own. Fifteen services; each owns its tables and no service reads another's tables directly (PRIN-07).

```mermaid
flowchart TB
    subgraph clients [Client tier]
        SPA["Web application<br/>Vue 3 + Vite<br/>Served from CDN"]
        FieldPWA["Field PWA<br/>Vue 3 + Service Worker<br/>+ IndexedDB"]
        DonorPortal["Donor portal<br/>Vue 3, read-only subset"]
    end

    subgraph edgez [Edge]
        CF["Cloudflare<br/>CDN, WAF, DDoS"]
        GW["api-gateway :3000<br/>Express<br/>Auth, routing, rate limit,<br/>tenant injection"]
    end

    subgraph platformsvc [Platform services]
        Auth["auth-service :3001"]
        Tenant["tenant-service :3014"]
        Notify["notification-service :3007"]
        Report["reporting-service :3008"]
        Audit["audit-service :3009"]
        Files["file-service :3010"]
        Integr["integration-service :3011"]
        Analytics["analytics-service :3012"]
        AI["ai-insights-service :3013"]
    end

    subgraph domainsvc [Domain services]
        Grant["grant-service :3002"]
        LMS["lms-service :3003"]
        Ben["beneficiary-service :3004"]
        FieldData["field-data-service :3005"]
        HR["hr-payroll-service :3006"]
    end

    Bus[["Redis Streams<br/>event bus"]]

    subgraph stores [Data stores]
        PGCore[("PostgreSQL<br/>core cluster<br/>schemas per service")]
        PGPayroll[("PostgreSQL<br/>payroll schemas<br/>tenant_xxx.payroll_*")]
        RedisCache[("Redis 7<br/>cache, sessions,<br/>rate limits, BullMQ")]
        Blob[("Object storage<br/>documents, media,<br/>generated reports")]
        Warehouse[("Read replica<br/>analytics queries")]
    end

    SPA --> CF
    FieldPWA --> CF
    DonorPortal --> CF
    CF --> GW

    GW --> Auth
    GW --> Tenant
    GW --> Grant
    GW --> LMS
    GW --> Ben
    GW --> FieldData
    GW --> HR
    GW --> Report
    GW --> Files
    GW --> Analytics
    GW --> AI
    GW --> Audit

    Grant -.-> Bus
    LMS -.-> Bus
    Ben -.-> Bus
    FieldData -.-> Bus
    HR -.-> Bus
    Tenant -.-> Bus
    Auth -.-> Bus
    Bus -.-> Audit
    Bus -.-> Notify
    Bus -.-> Analytics
    Bus -.-> LMS
    Bus -.-> Report
    Bus -.-> Integr

    Grant --> PGCore
    LMS --> PGCore
    Ben --> PGCore
    FieldData --> PGCore
    Auth --> PGCore
    Tenant --> PGCore
    Audit --> PGCore
    Files --> PGCore
    Integr --> PGCore
    HR --> PGPayroll
    HR --> PGCore
    Analytics --> Warehouse
    AI --> PGCore

    GW --> RedisCache
    Grant --> RedisCache
    Notify --> RedisCache
    Analytics --> RedisCache
    Files --> Blob
    Report --> Blob
    FieldData --> Blob
```

### 5.3.1 Container responsibilities at a glance

| Container | Owns | Never does |
| --- | --- | --- |
| `api-gateway` | Ingress, token validation, tenant and role header injection, rate limiting, circuit breaking, request correlation | Business logic, database access |
| `auth-service` | Users, roles, permissions, sessions, MFA | Domain data |
| `tenant-service` | Tenant records, provisioning, subscription tier, quotas, lifecycle | Per-domain data |
| `grant-service` | Donors, grants, budgets, budget lines, disbursements, grant reports, activities | Payroll, beneficiaries |
| `lms-service` | Courses, modules, lessons, assessments, LMS enrollments, progress, certificates | Employee records |
| `beneficiary-service` | Beneficiaries, households, programmes, programme enrollments, attendance | Form definitions |
| `field-data-service` | Form templates, fields, validation rules, submissions, submission values, sync state | Beneficiary master records |
| `hr-payroll-service` | Employees, contracts, positions, departments, leave, payroll runs and records, statutory rules | System user accounts |
| `notification-service` | Templates, delivery attempts, preferences, throttling | Deciding business meaning of an event |
| `reporting-service` | Report definitions, generated artefacts, PDF rendering | Source-of-truth data |
| `audit-service` | Append-only audit log | Mutating anything else |
| `file-service` | Object metadata, virus scan state, signed URL issuance, retention | Interpreting file contents |
| `integration-service` | External connectors, outbound webhooks, IATI publishing, FX ingestion | Domain rules |
| `analytics-service` | Materialised KPI aggregates, dashboard queries | Writing to domain tables |
| `ai-insights-service` | Prompt orchestration, redaction, LLM calls, review queue | Auto-committing AI output |

---

## 5.4 Service interaction

Two views, because conflating them is how distributed systems get accidentally coupled.

### 5.4.1 Synchronous call graph

Synchronous calls are permitted only where the user is waiting on the result. Every edge here is a latency and availability dependency.

```mermaid
flowchart LR
    GW["api-gateway"]
    Auth["auth-service"]
    Grant["grant-service"]
    HR["hr-payroll-service"]
    LMS["lms-service"]
    Ben["beneficiary-service"]
    FD["field-data-service"]
    Files["file-service"]
    Report["reporting-service"]
    Analytics["analytics-service"]
    AI["ai-insights-service"]
    Integr["integration-service"]
    Tenant["tenant-service"]

    GW --> Auth
    GW --> Tenant
    GW --> Grant
    GW --> HR
    GW --> LMS
    GW --> Ben
    GW --> FD
    GW --> Files
    GW --> Report
    GW --> Analytics
    GW --> AI

    FD --> Ben
    Report --> Grant
    Report --> HR
    Report --> Analytics
    AI --> Analytics
    HR --> Integr
    Grant --> Files
    Ben --> Files
    FD --> Files
```

**Rules enforced on this graph.** Maximum call depth from the gateway is two. A synchronous call from one domain service to another requires an ADR; the only ones permitted today are `field-data-service` → `beneficiary-service` for duplicate checking during submission processing, and `hr-payroll-service` → `integration-service` for the FX rate at payroll time. Domain services **MUST NOT** call `audit-service`, `notification-service` or `analytics-service` synchronously — those are event consumers only.

### 5.4.2 Asynchronous event graph

```mermaid
flowchart LR
    subgraph producers [Producers]
        Grant["grant-service"]
        HR["hr-payroll-service"]
        LMS["lms-service"]
        Ben["beneficiary-service"]
        FD["field-data-service"]
        Auth["auth-service"]
        Tenant["tenant-service"]
        Files["file-service"]
    end

    Bus[["Redis Streams<br/>stream per bounded context"]]

    subgraph consumers [Consumers]
        Audit["audit-service"]
        Notify["notification-service"]
        Analytics["analytics-service"]
        LMSc["lms-service<br/>consumes hr events"]
        Reportc["reporting-service"]
        Integrc["integration-service"]
        AIc["ai-insights-service"]
        DLQ[["Dead letter streams"]]
    end

    Grant -.-> Bus
    HR -.-> Bus
    LMS -.-> Bus
    Ben -.-> Bus
    FD -.-> Bus
    Auth -.-> Bus
    Tenant -.-> Bus
    Files -.-> Bus

    Bus -.-> Audit
    Bus -.-> Notify
    Bus -.-> Analytics
    Bus -.-> LMSc
    Bus -.-> Reportc
    Bus -.-> Integrc
    Bus -.-> AIc

    Audit -.-> DLQ
    Notify -.-> DLQ
    Analytics -.-> DLQ
    LMSc -.-> DLQ
```

`audit-service` and `analytics-service` subscribe to every stream. Other consumers subscribe selectively; the full publisher/subscriber matrix is in [Appendix D](appendices/d-event-catalog.md).

---

## 5.5 Service dependency graph and criticality tiers

This is the diagram to look at during an incident. Tier 0 failures take the platform down; Tier 2 failures are noticed by nobody for an hour.

```mermaid
flowchart TB
    subgraph t0 [Tier 0 — platform is down without these]
        PG[("PostgreSQL primary")]
        GWt["api-gateway"]
        Autht["auth-service"]
    end

    subgraph t1 [Tier 1 — core business function lost]
        Grantt["grant-service"]
        HRt["hr-payroll-service"]
        Bent["beneficiary-service"]
        FDt["field-data-service"]
        Redist[("Redis")]
        Tenantt["tenant-service"]
    end

    subgraph t2 [Tier 2 — degraded, work continues]
        LMSt["lms-service"]
        Filest["file-service"]
        Reportt["reporting-service"]
        Notifyt["notification-service"]
        Audit2["audit-service"]
    end

    subgraph t3 [Tier 3 — enhancement only]
        Analyticst["analytics-service"]
        AIt["ai-insights-service"]
        Integrt["integration-service"]
    end

    GWt --> Autht
    GWt --> Redist
    Autht --> PG
    Grantt --> PG
    HRt --> PG
    Bent --> PG
    FDt --> PG
    Tenantt --> PG
    LMSt --> PG
    Filest --> PG
    Audit2 --> PG
    Reportt --> Grantt
    Reportt --> HRt
    Analyticst --> Grantt
    AIt --> Analyticst
    Integrt --> Grantt
    Notifyt --> Redist
    FDt --> Bent
    HRt --> Integrt
```

| Tier | Availability target | Paging policy | Recovery priority |
| --- | --- | --- | --- |
| Tier 0 | 99.9% | Page immediately, 24/7 | 1 |
| Tier 1 | 99.5% | Page during extended hours; ticket overnight for single-service failure | 2 |
| Tier 2 | 99.0% | Ticket; page only if sustained beyond 4 hours | 3 |
| Tier 3 | 98.0% | Ticket | 4 |

**Notable properties.** `audit-service` is Tier 2 rather than Tier 0 only because the transactional outbox ([11](11-event-driven-architecture.md)) means audit records are durable in the producing service's database before `audit-service` consumes them — an outage delays the audit trail but cannot lose it. `hr-payroll-service` depends on `integration-service` for the FX rate, which is why the FX rate is cached with a 7-day validity: a Tier 3 outage must not block payroll.

---

## 5.6 Component view — grant-service (C4 Level 3)

All services follow this internal shape, produced from the shared service template. Showing it once establishes the pattern.

```mermaid
flowchart TB
    subgraph svc [grant-service]
        subgraph http [HTTP layer]
            Routes["Route definitions<br/>with declared permissions"]
            Validate["Joi/Zod request validation"]
            Ctl["Controllers<br/>thin, no business logic"]
        end
        subgraph domain [Domain layer]
            GrantSvc["GrantService"]
            BudgetSvc["BudgetService"]
            DisbSvc["DisbursementService"]
            BurnCalc["BurnRateCalculator"]
            ComplCalc["ComplianceScorer"]
        end
        subgraph data [Data access layer]
            Repos["Repositories<br/>parameterised SQL"]
            UoW["Unit of work<br/>transaction boundary"]
            Outbox["Outbox writer"]
        end
        subgraph platform [Platform concerns from template]
            Mw["Middleware: tenant context,<br/>authz, correlation, logging"]
            Metrics["Metrics and tracing"]
            Health["Health, readiness, liveness"]
            Publisher["Outbox relay to Redis Streams"]
            Consumer["Event consumers"]
        end
    end

    PG[("PostgreSQL<br/>schema: grant")]
    R[("Redis")]
    Stream[["Redis Streams"]]

    Routes --> Validate --> Ctl --> GrantSvc
    Ctl --> BudgetSvc
    Ctl --> DisbSvc
    GrantSvc --> BurnCalc
    GrantSvc --> ComplCalc
    GrantSvc --> Repos
    BudgetSvc --> Repos
    DisbSvc --> Repos
    Repos --> UoW --> PG
    UoW --> Outbox --> PG
    Publisher --> PG
    Publisher -.-> Stream
    Stream -.-> Consumer
    BurnCalc --> R
    Mw --> Routes
```

Key structural rules, enforced by lint rules and review:

1. Controllers contain no business logic. They validate, call a domain service, and shape a response.
2. Domain services contain no SQL. Repositories contain no business rules.
3. A domain event is written to the outbox table inside the same transaction as the state change it describes. Nothing publishes directly to Redis from business logic.
4. The platform concerns block is identical across all fifteen services and is upgraded centrally.

---

## 5.7 Network and security zones

```mermaid
flowchart TB
    Internet(("Internet"))

    subgraph dmz [DMZ — public zone]
        direction TB
        CDN["Cloudflare CDN + WAF<br/>TLS 1.3 termination at edge<br/>DDoS, bot, rate limiting"]
        LB["GCP external load balancer<br/>Cloud Armor policies"]
        Ingress["Kubernetes ingress<br/>nginx, TLS re-termination"]
    end

    subgraph appzone [Application zone — private VPC subnet]
        direction TB
        GWz["api-gateway pods<br/>only pod reachable from ingress"]
        Mesh["Service mesh sidecars<br/>mTLS between all pods"]
        Svcs["All other service pods<br/>no ingress route"]
        Jobs["Job workers<br/>BullMQ consumers"]
    end

    subgraph datazone [Data zone — restricted private subnet]
        direction TB
        SQL[("Cloud SQL PostgreSQL<br/>private IP only<br/>AES-256 at rest")]
        Mem[("Memorystore Redis<br/>private IP, AUTH + TLS")]
        GCS[("Object storage<br/>uniform bucket access,<br/>CMEK encryption")]
        KMS["Cloud KMS<br/>per-tenant data keys"]
    end

    subgraph mgmt [Management zone]
        Prom["Prometheus, Grafana, Loki, Tempo"]
        Bastion["Identity-aware proxy<br/>no SSH bastion, no public IP"]
    end

    Internet --> CDN --> LB --> Ingress --> GWz
    GWz --> Mesh --> Svcs
    Svcs --> Jobs
    Svcs --> SQL
    Svcs --> Mem
    Svcs --> GCS
    Svcs --> KMS
    Svcs -.-> Prom
    Bastion -.-> Svcs
    Bastion -.-> SQL
```

### 5.7.1 Zone rules

| Boundary | Allowed direction | Controls |
| --- | --- | --- |
| Internet → DMZ | Inbound 443 only | WAF rules, Cloud Armor, geo and rate policies, TLS 1.3 minimum |
| DMZ → Application | Inbound to `api-gateway` service port only | Kubernetes NetworkPolicy; no other pod accepts ingress traffic |
| Application → Application | Only declared service-to-service flows | Default-deny NetworkPolicy, mTLS with service identity, authorisation policy per service |
| Application → Data | Outbound to private IPs of managed data services only | VPC Service Controls, private service connect, no public IP on any data resource |
| Application → Internet | Only to an allow-listed egress set through a NAT with logging | Egress NetworkPolicy plus an egress gateway; prevents exfiltration to arbitrary hosts |
| Management → all | Read-only, identity-aware, session-recorded | IAP, no standing access, just-in-time elevation with approval |
| Data → anything | None. Data services never initiate connections | Enforced by firewall rules |

**Explicit prohibitions.** No service exposes a public IP. There is no SSH bastion; administrative access is through the identity-aware proxy with recorded sessions. Database credentials are short-lived and issued through workload identity, not stored as long-lived secrets.

---

## 5.8 Kubernetes deployment topology

```mermaid
flowchart TB
    subgraph cluster ["GKE cluster — africa-south1, regional, 3 zones"]
        subgraph nsingress ["Namespace: ingress"]
            NginxDep["nginx-ingress<br/>3 replicas, one per zone"]
            CertMgr["cert-manager"]
        end

        subgraph nsplatform ["Namespace: platform"]
            GWDep["api-gateway<br/>HPA 3-12"]
            AuthDep["auth-service<br/>HPA 3-8"]
            TenantDep["tenant-service<br/>2 replicas"]
            AuditDep["audit-service<br/>HPA 2-6"]
            FilesDep["file-service<br/>HPA 2-6"]
            NotifyDep["notification-service<br/>2 replicas + workers"]
        end

        subgraph nsdomain ["Namespace: domain"]
            GrantDep["grant-service<br/>HPA 2-8"]
            HRDep["hr-payroll-service<br/>HPA 2-6"]
            LMSDep["lms-service<br/>HPA 2-6"]
            BenDep["beneficiary-service<br/>HPA 2-8"]
            FDDep["field-data-service<br/>HPA 2-10"]
        end

        subgraph nsanalytics ["Namespace: analytics"]
            AnalyticsDep["analytics-service<br/>HPA 2-6"]
            AIDep["ai-insights-service<br/>2 replicas"]
            ReportDep["reporting-service<br/>HPA 2-6"]
            IntegrDep["integration-service<br/>2 replicas"]
            SupersetDep["Superset<br/>1 replica"]
        end

        subgraph nsobs ["Namespace: observability"]
            PromDep["Prometheus"]
            GrafDep["Grafana"]
            LokiDep["Loki"]
            TempoDep["Tempo"]
            AMDep["Alertmanager"]
        end

        subgraph nsjobs ["Namespace: jobs"]
            Cron["CronJobs: FX ingest, IATI publish,<br/>compliance recompute, retention sweep"]
            Workers["BullMQ workers:<br/>reports, notifications, exports"]
        end
    end

    subgraph managed ["Managed services — same region"]
        CloudSQL[("Cloud SQL PostgreSQL 15<br/>HA regional + read replica")]
        Memorystore[("Memorystore Redis 7<br/>standard tier HA")]
        GCSb[("Cloud Storage buckets")]
        KMSb["Cloud KMS"]
        SecretMgr["Secret Manager"]
    end

    NginxDep --> GWDep
    GWDep --> AuthDep
    GWDep --> GrantDep
    GWDep --> HRDep
    GWDep --> BenDep
    GWDep --> FDDep
    GWDep --> LMSDep
    GWDep --> AnalyticsDep
    nsdomain --> CloudSQL
    nsplatform --> CloudSQL
    nsanalytics --> CloudSQL
    nsjobs --> Memorystore
    nsplatform --> Memorystore
    FilesDep --> GCSb
    nsplatform --> KMSb
    nsdomain --> SecretMgr
```

### 5.8.1 Node pools

| Node pool | Machine type | Size | Scheduling | Purpose |
| --- | --- | --- | --- | --- |
| `app-pool` | `n2-standard-4` | 3–8, autoscaled, regional | Default | All stateless services |
| `jobs-pool` | `n2-standard-4` | 1–6, autoscaled, includes spot nodes | Taint `workload=jobs` | Queue workers and cron jobs, interruption-tolerant |
| `monitoring-pool` | `n2-standard-2` | 2, fixed | Taint `workload=monitoring` | Observability stack, isolated so an application incident does not starve the tooling that diagnoses it |

> **Correction to v1.0.** v1.0 specified a `db-pool` running PostgreSQL as a StatefulSet and a `cache-pool` running a self-managed Redis cluster. Both are removed for staging and production: databases and caches are managed services on private IPs, which is what the data-zone isolation in §5.7 actually requires. A local PostgreSQL and Redis in Docker Compose remain the development environment.

### 5.8.2 Workload defaults

Every service Deployment inherits the following from the Helm base chart, overridable per service with justification:

| Setting | Value | Reason |
| --- | --- | --- |
| Replicas, minimum | 2 (3 for Tier 0) | Survive a node loss without downtime |
| Pod anti-affinity | `preferredDuringScheduling`, spread across zones | A zone loss should not take a whole service |
| PodDisruptionBudget | `minAvailable: 1`, or 50% for Tier 0 | Node drains cannot evict the last replica |
| Resource requests | CPU 100m, memory 256Mi | Sized from observed p95, reviewed quarterly |
| Resource limits | CPU 1000m, memory 512Mi | Memory limit is a hard stop; CPU limit prevents noisy neighbours |
| `terminationGracePeriodSeconds` | 45 | Long enough to drain in-flight requests and return unacked jobs |
| `preStop` hook | `sleep 5` then drain | Lets the load balancer deregister before the process stops accepting |
| Probes | Startup, liveness, readiness, all distinct | See [24 §24.7](24-observability.md) |
| Security context | `runAsNonRoot`, read-only root filesystem, all capabilities dropped, seccomp `RuntimeDefault` | Container hardening baseline |
| Image | Distroless, pinned by digest, signed | Supply chain, [22](22-cicd-release-supply-chain.md) |

---

## 5.9 Pod and container internals

```mermaid
flowchart TB
    subgraph pod ["Pod: grant-service"]
        subgraph init ["Init containers"]
            InitCfg["config-validator<br/>fails fast on bad or missing config"]
            InitMig["migration-check<br/>verifies schema version compatibility,<br/>does not run migrations"]
        end
        subgraph main ["Application container"]
            App["node dist/server.js<br/>distroless base, non-root UID 10001,<br/>read-only rootfs"]
            Tmp["emptyDir /tmp<br/>the only writable path"]
        end
        subgraph side ["Sidecars"]
            Proxy["Service mesh proxy<br/>mTLS, retries, outlier ejection,<br/>traffic metrics"]
            OTel["OpenTelemetry collector agent<br/>trace and metric forwarding"]
        end
        subgraph vols ["Projected volumes"]
            SA["Workload identity token<br/>projected, short-lived"]
            Sec["Secrets from Secret Manager<br/>CSI driver, tmpfs, never on disk"]
            CM["ConfigMap<br/>non-sensitive configuration"]
        end
    end

    InitCfg --> InitMig --> App
    App --- Tmp
    App --> Proxy
    App --> OTel
    SA --> App
    Sec --> App
    CM --> App
    Proxy --> Outbound(("Mesh / egress"))
```

**Why each piece exists.** The config validator init container turns a misconfiguration into a crash loop with a clear message at deploy time rather than a runtime failure hours later (PRIN-12). The migration-check container refuses to start a pod whose code expects a schema version the database does not have, which is what makes the expand-contract migration process in [09](09-data-management-strategy.md) safe. The read-only root filesystem with a single `emptyDir` at `/tmp` means a code-execution vulnerability cannot persist anything. Secrets arrive through the CSI driver into tmpfs so they never touch a disk or an image layer.

---

## 5.10 Environment and promotion topology

```mermaid
flowchart LR
    Dev["Local development<br/>Docker Compose<br/>PostgreSQL + Redis containers<br/>seeded synthetic data"]
    PR["Ephemeral PR environment<br/>namespace per pull request<br/>shared small database<br/>auto-destroyed on merge"]
    Staging["Staging<br/>GKE, own namespace<br/>Cloud SQL small<br/>anonymised production-shaped data"]
    Prod["Production<br/>GKE regional<br/>Cloud SQL HA + replica<br/>real tenant data"]
    DR["DR standby<br/>second region<br/>cross-region replica<br/>infrastructure defined, not running"]

    Dev -->|"push"| PR
    PR -->|"merge to main"| Staging
    Staging -->|"manual approval<br/>+ green smoke tests"| Prod
    Prod -.->|"continuous replication"| DR
```

| Environment | Data | Access | Purpose |
| --- | --- | --- | --- |
| Local | Synthetic only. Production data on a laptop is a policy violation | Developer | Fast iteration |
| PR environment | Synthetic seed | Team | Review and manual verification of a change in isolation |
| Staging | Anonymised, production-shaped volumes | Team, read-write | Integration, load, chaos, migration rehearsal |
| Production | Real | Break-glass only, audited | Serving tenants |
| DR | Replica of production | Emergency only | Regional failover, [27](27-disaster-recovery-and-bcp.md) |

---

## 5.11 Data flow — J1: recording a grant disbursement

Expanded from Appendix B of v1.0, with the failure paths that the original omitted.

```mermaid
sequenceDiagram
    autonumber
    participant FM as Finance Manager
    participant GW as api-gateway
    participant GS as grant-service
    participant DB as PostgreSQL
    participant OB as Outbox relay
    participant ST as Redis Streams
    participant AU as audit-service
    participant NT as notification-service
    participant AN as analytics-service

    FM->>GW: POST /v1/grant/grants/{id}/disbursements<br/>Idempotency-Key: {uuid}
    GW->>GW: Validate JWT (RS256), check exp and audience
    GW->>GW: Resolve tenant_id and role from claims
    GW->>GW: Rate limit check, circuit breaker state
    GW->>GS: Proxy with X-Tenant-ID, X-User-Id,<br/>X-User-Role, X-Correlation-Id
    GS->>GS: Authorise grant:disbursement:create
    GS->>DB: Check idempotency key already processed?
    alt Key seen before
        DB-->>GS: Prior response stored
        GS-->>FM: 200 with original response body
    else New request
        GS->>GS: Validate body against schema
        GS->>DB: BEGIN
        GS->>DB: SELECT grant FOR UPDATE, set tenant context
        GS->>GS: Business rule: cumulative disbursed<br/>+ amount <= total_amount
        alt Rule violated
            GS->>DB: ROLLBACK
            GS-->>FM: 422 NGOIS-GRANT-0021 with remaining ceiling
        else Rule satisfied
            GS->>DB: INSERT disbursements
            GS->>DB: UPDATE grants SET received_to_date
            GS->>DB: INSERT outbox (grant.disbursement.recorded)
            GS->>DB: INSERT idempotency_keys
            GS->>DB: COMMIT
            GS-->>FM: 201 Created with disbursement
        end
    end

    Note over OB,ST: Asynchronous from here — the user is not waiting
    OB->>DB: Poll unpublished outbox rows
    OB->>ST: XADD grant.events
    OB->>DB: Mark outbox row published

    ST-->>AU: Consume
    AU->>DB: Append audit record with before/after state
    ST-->>NT: Consume
    NT->>NT: Resolve recipients, apply preferences and throttle
    NT-->>FM: Email to finance_manager and org_admin
    ST-->>AN: Consume
    AN->>AN: Invalidate burn-rate cache, update aggregate
```

**What the diagram encodes that prose would miss.** The response returns at step 20 — before audit, notification or analytics have run. That is deliberate: the user's write is durable and acknowledged, and the downstream effects are guaranteed by the outbox, not by keeping the user waiting. If `audit-service` is down, the outbox row remains unconsumed and the audit record appears when it recovers; nothing is lost. If the notification email fails, it retries independently without affecting the disbursement.

---

## 5.12 Data flow — J2: staff onboarding triggering LMS induction

```mermaid
sequenceDiagram
    autonumber
    participant HRM as HR Manager
    participant GW as api-gateway
    participant HR as hr-payroll-service
    participant DB as PostgreSQL
    participant ST as Redis Streams
    participant AS as auth-service
    participant LMS as lms-service
    participant NT as notification-service

    HRM->>GW: PATCH /v1/hr/employees/{id} {status: active}
    GW->>HR: Proxy with tenant and role context
    HR->>DB: BEGIN
    HR->>DB: UPDATE employees SET status = 'active'
    HR->>DB: INSERT outbox (hr.employee.onboarded)
    HR->>DB: COMMIT
    HR-->>HRM: 200 OK

    ST-->>AS: hr.employee.onboarded
    alt Employee needs portal access
        AS->>DB: Create user, link user_id to employee
        AS->>ST: identity.user.created
        ST-->>NT: identity.user.created
        NT-->>HRM: Invitation email to employee
    end

    ST-->>LMS: hr.employee.onboarded
    LMS->>DB: Resolve mandatory course set for<br/>position, department, employment_type
    LMS->>DB: INSERT lms_enrollments with due dates
    LMS->>DB: INSERT outbox (lms.enrollment.created)
    ST-->>NT: lms.enrollment.created
    NT-->>HRM: Induction assignment notification

    Note over LMS: Later, on a schedule
    LMS->>LMS: Nightly job scans overdue mandatory enrollments
    LMS->>ST: lms.enrollment.overdue
    ST-->>NT: Escalation to employee, then line manager, then HR
```

Note the ordering hazard this design avoids: `auth-service` creating the user and `lms-service` creating enrollments are independent consumers of the same event. Neither waits for the other, and `lms-service` does not require a user account to exist — enrollment attaches to the employee record, and portal access is a separate concern. If it had been modelled as a chain, an `auth-service` outage would silently block induction tracking.

---

## 5.13 Data flow — J3: offline field submission and sync

The most involved flow in the system.

```mermaid
sequenceDiagram
    autonumber
    participant FO as Field Officer
    participant UI as PWA UI
    participant SW as Service Worker
    participant IDB as IndexedDB
    participant GW as api-gateway
    participant FD as field-data-service
    participant BS as beneficiary-service
    participant FS as file-service
    participant DB as PostgreSQL

    Note over FO,IDB: Offline, no connectivity
    FO->>UI: Open assigned form, complete fields
    UI->>UI: Validate locally against cached rule set
    UI->>IDB: Write submission, status = pending,<br/>client_uuid, captured_at, GPS
    IDB-->>UI: Durable write confirmed
    UI-->>FO: "Saved on device, not yet synced"
    FO->>UI: Attach photo
    UI->>UI: Downscale and compress client-side
    UI->>IDB: Store blob with submission reference

    Note over SW: Connectivity returns
    SW->>SW: Background sync event fires
    SW->>IDB: Read pending queue in captured_at order
    SW->>GW: POST /v1/field-data/submissions/batch<br/>Idempotency-Key per item

    GW->>FD: Proxy batch
    loop For each submission
        FD->>DB: Has this client_uuid been processed?
        alt Already processed
            FD-->>SW: 200, prior result, no duplicate created
        else New
            FD->>FD: Server-side validation of the full rule set
            alt Validation fails
                FD-->>SW: 422 with per-field errors
            else Valid
                FD->>FD: Compute duplicate fingerprint
                FD->>BS: Check for probable duplicate beneficiary
                alt Probable duplicate
                    BS-->>FD: Candidate matches with scores
                    FD->>DB: Store submission, flag for human review
                    FD-->>SW: 202 Accepted, review_required
                else No duplicate
                    FD->>DB: BEGIN, insert submission and values,<br/>outbox event, COMMIT
                    FD-->>SW: 201 Created with server id
                end
            end
        end
    end

    SW->>GW: Request signed upload URLs for media
    GW->>FS: Issue signed URLs, scoped and time-limited
    FS-->>SW: Signed URLs
    SW->>FS: Direct upload of media, bypassing the API
    FS->>FS: Virus scan, then mark object available
    SW->>IDB: Update local records: synced / rejected / review
    SW->>UI: Post message to update badge counts
    UI-->>FO: Per-record status, with rejected items surfaced for correction
```

**Design points.** The submission and its media travel separately: structured data is small and goes through the API, media is large and goes directly to object storage through a signed URL so it never occupies an API worker. Duplicate suppression happens twice — by `client_uuid` for exact retry safety, and by fuzzy fingerprint for genuine human duplicates, which are flagged rather than auto-merged because merging beneficiary records incorrectly is a protection risk. The client never deletes a local record until the server confirms it, and rejected records stay on the device with their errors so the officer can fix them in the field.

---

## 5.14 Data flow — J4: monthly payroll run

```mermaid
sequenceDiagram
    autonumber
    participant HRM as HR Manager
    participant FM as Finance Manager
    participant GW as api-gateway
    participant HR as hr-payroll-service
    participant IN as integration-service
    participant DB as PostgreSQL
    participant RP as reporting-service
    participant NT as notification-service

    HRM->>GW: POST /v1/hr/payroll-runs {period}
    GW->>HR: Proxy
    HR->>DB: Create payroll_run, status = draft
    HR->>IN: GET /fx/rate?pair=USD_SSP&date={period_end}
    alt Rate older than 7 days or unavailable
        IN-->>HR: Stale or error
        HR-->>HRM: 422 NGOIS-PAY-0117, run blocked
    else Rate valid
        IN-->>HR: Rate, source, published_at
        HR->>DB: Store rate and its provenance on the run
        loop For each active employee
            HR->>DB: Resolve contract, salary, allowances
            HR->>DB: Resolve tax_bands and contribution rates<br/>effective on period_end
            HR->>HR: Compute gross, PAYE, NSIF/NSSF employee<br/>and employer, net
            HR->>DB: INSERT payroll_records into tenant schema
        end
        HR->>DB: Aggregate totals, status = under_review
        HR->>DB: INSERT outbox (hr.payroll_run.submitted)
        HR-->>HRM: 201 with variance report vs prior period
    end

    Note over HRM,FM: Separation of duties: the preparer cannot approve
    FM->>GW: POST /v1/hr/payroll-runs/{id}/approve
    GW->>HR: Proxy
    HR->>HR: Reject if approver == preparer
    HR->>HR: Require step-up MFA re-authentication
    HR->>DB: status = approved, record approver and timestamp
    HR->>DB: INSERT outbox (hr.payroll_run.approved)

    HR-->>RP: hr.payroll_run.approved
    RP->>RP: Render payslip PDFs per employee
    RP->>RP: Store encrypted, per-employee access scope
    RP->>DB: INSERT outbox (reporting.payslip.generated)
    RP-->>NT: reporting.payslip.generated
    NT-->>HRM: Per-employee secure payslip link, expiring
```

The variance report at step 18 is a deliberate control: comparing each employee's net pay to the prior period and flagging anything outside a threshold catches the class of error — a mistyped salary, a duplicated allowance — that statutory-rule testing cannot.

---

## 5.15 Data flow — J5: donor report generation with AI assistance

```mermaid
sequenceDiagram
    autonumber
    participant MEO as M&E Officer
    participant GW as api-gateway
    participant RP as reporting-service
    participant AN as analytics-service
    participant AI as ai-insights-service
    participant RED as Redaction layer
    participant LLM as Anthropic Claude API
    participant IN as integration-service

    MEO->>GW: POST /v1/reporting/reports {grant_id, period, template}
    GW->>RP: Proxy
    RP->>AN: Fetch indicator values for grant and period
    AN-->>RP: Aggregates with provenance: which submissions,<br/>which beneficiary counts
    RP->>RP: Assemble quantitative sections deterministically
    RP-->>MEO: 202 Accepted, job queued

    opt AI narrative assistance requested
        RP->>AI: Draft narrative for these aggregates
        AI->>RED: Prepare prompt
        RED->>RED: Assert no beneficiary PII present —<br/>aggregates only, k-anonymity threshold enforced
        alt Redaction assertion fails
            RED-->>AI: Block
            AI-->>RP: Unavailable, reason logged
        else Passes
            RED->>LLM: Prompt with aggregates and template
            LLM-->>RED: Draft narrative
            RED->>AI: Draft plus token usage
            AI->>AI: Guardrails: no invented figures,<br/>every number must appear in the input
            AI-->>RP: Draft marked ai_generated, unapproved
        end
    end

    RP-->>MEO: Report ready for review, AI sections clearly marked
    MEO->>GW: Review, edit, then POST /reports/{id}/approve
    GW->>RP: Proxy
    RP->>RP: Record human approver — AI text cannot be published unreviewed
    RP->>RP: Render final PDF and IATI-compatible dataset

    opt Publish to IATI
        RP->>IN: Publish activity data
        IN->>IN: Transform to IATI v2.03 XML, validate schema
        IN->>IN: Publish to registry with retry
    end
```

The hard rule visible here: AI output cannot reach a donor without a named human approving it, and the redaction layer is a separate component that blocks rather than sanitises when it is unsure. Both are elaborated in [18](18-ai-llm-architecture.md).

---

## 5.16 Data flow — tenant provisioning

```mermaid
sequenceDiagram
    autonumber
    participant SA as Super Admin
    participant GW as api-gateway
    participant TS as tenant-service
    participant DB as PostgreSQL
    participant KMS as Cloud KMS
    participant AS as auth-service
    participant ST as Redis Streams
    participant NT as notification-service

    SA->>GW: POST /v1/tenant/tenants {name, slug, country, tier}
    GW->>TS: Proxy, requires super_admin
    TS->>DB: INSERT tenants, status = provisioning
    TS->>KMS: Create per-tenant data encryption key
    KMS-->>TS: Key reference
    TS->>DB: Store key reference, never the key
    TS->>DB: CREATE SCHEMA tenant_{slug} for payroll tables
    TS->>DB: Apply payroll DDL to the new schema
    TS->>DB: Seed reference data: country tax bands,<br/>default roles, default course catalog
    TS->>DB: Set quotas from subscription tier
    TS->>DB: status = active
    TS->>DB: INSERT outbox (tenant.provisioned)

    ST-->>AS: tenant.provisioned
    AS->>DB: Create initial org_admin user, no password
    AS->>ST: identity.user.invited
    ST-->>NT: identity.user.invited
    NT-->>SA: Invitation link to the tenant administrator

    Note over TS: Verification, not assumption
    TS->>TS: Post-provision check: RLS enabled on all tables,<br/>schema present, quotas set, key reachable
    TS->>DB: Record provisioning verification result
```

The post-provisioning verification step exists because the most dangerous tenant defect is one that is provisioned *almost* correctly — a table where RLS was not enabled is invisible until it leaks. See [29](29-multi-tenancy-and-tenant-lifecycle.md).

---

## 5.17 Event flow overview

```mermaid
flowchart TB
    subgraph write ["Write path, inside one transaction"]
        Change["Domain state change"]
        OutboxT[("outbox table")]
        Change --> OutboxT
    end

    Relay["Outbox relay<br/>polls every 500 ms,<br/>at-least-once delivery"]
    OutboxT --> Relay

    subgraph streams ["Redis Streams, one per bounded context"]
        S1[["grant.events"]]
        S2[["hr.events"]]
        S3[["lms.events"]]
        S4[["beneficiary.events"]]
        S5[["fielddata.events"]]
        S6[["identity.events"]]
        S7[["platform.events"]]
    end

    Relay -.-> S1
    Relay -.-> S2
    Relay -.-> S3
    Relay -.-> S4
    Relay -.-> S5
    Relay -.-> S6
    Relay -.-> S7

    subgraph groups ["Consumer groups, one per consuming service"]
        CG1["audit-service group<br/>subscribes to all"]
        CG2["notification-service group"]
        CG3["analytics-service group"]
        CG4["lms-service group"]
        CG5["reporting-service group"]
        CG6["integration-service group"]
    end

    S1 -.-> CG1
    S2 -.-> CG1
    S3 -.-> CG1
    S4 -.-> CG1
    S5 -.-> CG1
    S6 -.-> CG1
    S7 -.-> CG1
    S1 -.-> CG2
    S2 -.-> CG2
    S3 -.-> CG2
    S1 -.-> CG3
    S4 -.-> CG3
    S5 -.-> CG3
    S2 -.-> CG4
    S1 -.-> CG5
    S1 -.-> CG6

    Retry["Retry with exponential<br/>backoff and jitter<br/>max 5 attempts"]
    DLQ[["Dead letter stream<br/>per consumer group"]]
    Replay["Operator replay tool<br/>RB-02"]

    CG1 -.-> Retry
    CG2 -.-> Retry
    CG3 -.-> Retry
    CG4 -.-> Retry
    Retry -.-> DLQ
    DLQ -.-> Replay
    Replay -.-> streams
```

---

## 5.18 Multi-region disaster recovery topology

```mermaid
flowchart TB
    subgraph primary ["Primary — africa-south1, Johannesburg"]
        PGKE["GKE regional cluster<br/>all workloads active"]
        PSQL[("Cloud SQL HA<br/>primary + standby, 2 zones")]
        PRedis[("Memorystore HA")]
        PGCS[("Cloud Storage<br/>dual-region bucket")]
    end

    subgraph secondary ["DR — europe-west4, Netherlands"]
        SGKE["GKE cluster<br/>defined in Terraform,<br/>scaled to zero"]
        SSQL[("Cloud SQL cross-region<br/>read replica")]
        SRedis[("Memorystore<br/>created on failover")]
        SGCS[("Bucket replica")]
    end

    DNS["Cloudflare DNS<br/>health-checked failover record"]
    Backup[("Backup vault<br/>separate project,<br/>separate KMS key,<br/>immutable retention")]

    PSQL -.->|"continuous WAL replication"| SSQL
    PGCS -.->|"turbo replication"| SGCS
    PSQL -->|"hourly snapshot + continuous WAL"| Backup
    PGCS -->|"daily"| Backup
    DNS --> PGKE
    DNS -.->|"on failover"| SGKE
    SSQL -.->|"promote on failover"| SGKE
```

| Scenario | Detection | Response | RPO | RTO |
| --- | --- | --- | --- | --- |
| Single pod failure | Readiness probe | Kubernetes reschedules | 0 | Under 1 minute |
| Node failure | Node not ready | Rescheduled to another node, pool scales | 0 | Under 5 minutes |
| Zone failure | Multi-zone health degradation | Regional cluster and HA database absorb it | 0 | Under 5 minutes |
| Database primary failure | Cloud SQL health check | Automatic failover to standby | 0 | Under 2 minutes |
| Region failure | Synthetic monitoring from outside the region | Declared failover, [RB-12](runbooks/rb-12-region-failover.md) | Under 5 minutes | Under 4 hours |
| Data corruption or ransomware | Anomaly detection, integrity checks | Point-in-time restore from the immutable vault, [RB-11](runbooks/rb-11-backup-restore-drill.md) | Under 5 minutes to the chosen point | Under 8 hours |

Full procedures are in [27](27-disaster-recovery-and-bcp.md).
