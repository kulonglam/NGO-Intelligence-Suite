# 25 — Performance, Scalability and Capacity Planning

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 25 — Performance, Scalability and Capacity Planning
> **Owner:** Chief Architect, with the Platform Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Quarterly, and on any tenant growth beyond the projection
> **Related ADRs:** —

---

## 25.1 What performance means for these users

Performance targets in most SaaS documents are set against a desktop on office broadband. That baseline is wrong here, and using it would produce a system that tests well and fails in the field.

| Reality | Design consequence |
| --- | --- |
| A field officer on 2G, 200–800 ms round-trip latency, frequent packet loss | Payload size matters more than server processing time. A 40 KB response on a 50 kbps link takes 6 seconds regardless of how fast the server was |
| Bandwidth may be paid for personally from a prepaid bundle | Every byte has a real cost to a real person. No polling, no speculative prefetch on a metered connection |
| A connectivity window may last two minutes | Sync must be resumable and must make forward progress in small increments, not require completion |
| A finance manager on office broadband | Conventional targets apply, and dashboards should feel instant |
| A payroll run is a monthly deadline with legal consequences | Throughput matters more than latency; a 4-minute run is fine, a failed run is not |
| A donor report is generated under deadline pressure | 30 seconds is acceptable; an ambiguous spinner for 3 minutes is not |

So the targets are split: **server-side latency budgets** for what the platform controls, and **perceived performance budgets** for what the user experiences, which includes the network.

---

## 25.2 Latency budgets

Measured at the gateway, excluding client network time. Targets are p95 unless stated.

### 25.2.1 Read endpoints

| Endpoint class | p50 | p95 | p99 | Notes |
| --- | --- | --- | --- | --- |
| Health probes | 2 ms | 10 ms | 25 ms | No dependency calls on liveness |
| Session bootstrap — user, permissions, tenant config, flags | 40 ms | 150 ms | 300 ms | Cached; the first call after login |
| Simple entity read by ID | 20 ms | 80 ms | 200 ms | Single indexed lookup |
| Entity list, paginated, 25 rows | 40 ms | 150 ms | 400 ms | Covering index; cursor pagination |
| Entity list with filters | 60 ms | 250 ms | 600 ms | |
| Beneficiary search | 80 ms | 300 ms | 800 ms | Blind-index lookup on encrypted fields |
| Reference data | 5 ms | 20 ms | 50 ms | Redis-cached, 24 h TTL |
| Dashboard, cached | 60 ms | 200 ms | 500 ms | Pre-aggregated |
| Dashboard, cold | 300 ms | 1,200 ms | 2,500 ms | Triggers a background recompute |
| Standard report | 2 s | 8 s | 20 s | Asynchronous above 5 s, with a job handle |
| Complex multi-grant report | 5 s | 20 s | 30 s | Always asynchronous |
| Audit trail query | 100 ms | 500 ms | 1,500 ms | Partitioned by month |
| File download URL issue | 20 ms | 80 ms | 200 ms | Signature generation, not the transfer |

### 25.2.2 Write endpoints

| Endpoint class | p50 | p95 | p99 | Notes |
| --- | --- | --- | --- | --- |
| Simple create or update | 40 ms | 200 ms | 500 ms | Includes the outbox insert in the same transaction |
| Disbursement create | 60 ms | 250 ms | 600 ms | Row lock plus a ceiling check |
| Submission accept, single | 60 ms | 250 ms | 700 ms | Includes validation and PII encryption |
| Submission accept, sync batch of 40 | 400 ms | 1,500 ms | 3,000 ms | Batched; the budget is per batch, not per record |
| Login with MFA | 150 ms | 500 ms | 1,000 ms | Deliberately includes Argon2id cost |
| File upload, 5 MB | 1 s | 4 s | 10 s | Server-side processing after transfer |
| Payroll run, 100 employees | 25 s | 45 s | 90 s | Throughput-bound |
| Payroll run, 500 employees | 100 s | 180 s | 300 s | Target under 5 min |
| Bulk beneficiary import, 1,000 rows | 20 s | 45 s | 90 s | Asynchronous with progress |
| AI narrative draft | 6 s | 12 s | 20 s | Dominated by provider latency |

### 25.2.3 Perceived performance

What the user actually experiences, on the connection they actually have.

| Journey | Connection | Target |
| --- | --- | --- |
| App shell first load | 3G, 1 Mbps | LCP under 3 s |
| App shell repeat load | 3G | Under 1 s, service worker cached |
| App shell, offline | None | Under 1 s |
| Navigate to a cached route | Any | Under 300 ms |
| Navigate to a new lazy route | 3G | Under 1.5 s |
| Submit a field form, offline | None | **Under 200 ms perceived** — written locally, queued, confirmed immediately |
| Sync 40 submissions | 2G, 50 kbps | Under 90 s, with visible incremental progress |
| Load a dashboard | Office broadband | Under 1.5 s |
| Open a beneficiary record | 3G | Under 2 s |

The offline submit target is the most important number in this chapter. A field officer registering fifty households needs the form to clear instantly every time, and that is achievable only because the write is local and the network is not in the path at all.

---

## 25.3 Query and code standards

### 25.3.1 The N+1 rule

The most common performance defect in this kind of application, and the one that scales worst: it is invisible with ten test records and fatal with ten thousand.

| Rule | Enforcement |
| --- | --- |
| A repository method returning a collection must not issue a query per element | Code review, plus a test-time query counter that fails a test exceeding its declared query budget |
| Related data is fetched by a join or by a single batched `IN` query | Review |
| GraphQL-style nested resolution is not used | Architectural: the API is REST with explicit expansion parameters |
| Expansion is explicit | `?expand=department,position` — the client asks, the server does one extra batched query |
| Every list endpoint declares a query budget in its test | A budget of 3 means 3, and a change that makes it 4 fails |

The declared query budget is the mechanism that makes this stick. Without it, an N+1 is reintroduced roughly every second sprint by a well-meaning change to a mapper.

### 25.3.2 Query rules

| Rule | Reason |
| --- | --- |
| Every query has a `LIMIT`, without exception | An unbounded query is an outage waiting for a data volume threshold |
| Cursor pagination, never `OFFSET`, beyond page 10 | `OFFSET 50000` reads and discards 50,000 rows |
| `EXPLAIN ANALYZE` reviewed for any new query on a table over 100,000 rows | A sequential scan on a large table in the request path is rejected in review |
| No query in a loop | See §25.3.1 |
| `SELECT` named columns, never `*` | Prevents accidental transfer of encrypted blobs and breaks less on schema change |
| Aggregations over large ranges are pre-computed | Nightly and event-driven aggregate tables, not on-demand `GROUP BY` over three years |
| Statement timeout per role | 15 s for request-serving roles, 120 s for reporting, 5 s for the gateway's own queries |
| Transactions are short | A transaction held open across an external call blocks vacuum and holds locks |
| No transaction spans an HTTP call | Enforced by review; it is the classic cause of pool exhaustion |
| Read replicas for reporting | Reporting and analytics connect to the replica; the primary serves only transactional load |

### 25.3.3 Caching

Detailed in [09 §9.8](09-data-management-strategy.md). The performance-relevant summary:

| Layer | What | TTL | Invalidation |
| --- | --- | --- | --- |
| CDN | Static assets, immutable, content-hashed | 1 y | Filename change |
| CDN | The app shell HTML | 5 min | Deployment purge |
| Redis | Reference data | 24 h | Event-driven |
| Redis | Tenant config and flags | 60 s | Event-driven |
| Redis | Session and permission set | Token lifetime | Role change event |
| Redis | Dashboard aggregates | 15 min | Event-driven on the underlying change |
| Redis | Report results | 1 h | Parameter-keyed |
| In-process | Feature flags, tax bands, form definitions | 30 s | TTL plus event |
| Browser | Reference data via TanStack Query | 24 h | [19 §19.4.2](19-frontend-architecture.md) |
| IndexedDB | Offline reference and beneficiary cache | 72 h | Sync |

Target cache hit ratios: reference data above 95 per cent, dashboards above 80 per cent, reports above 40 per cent. A hit ratio below target is investigated as a defect, because it usually means an invalidation is firing too broadly.

---

## 25.4 Load model

### 25.4.1 Tenant and user projections

| Metric | Launch | Month 6 | Year 1 | Year 2 | Year 3 |
| --- | --- | --- | --- | --- | --- |
| Tenants | 3 | 10 | 25 | 60 | 120 |
| Named users | 90 | 350 | 900 | 2,200 | 4,500 |
| Peak concurrent users | 25 | 90 | 220 | 550 | 1,100 |
| Field devices active weekly | 20 | 80 | 200 | 500 | 1,000 |
| Employees under payroll | 150 | 600 | 1,500 | 3,600 | 7,200 |
| Beneficiaries | 5,000 | 40,000 | 150,000 | 400,000 | 900,000 |
| Active grants | 15 | 60 | 150 | 380 | 750 |
| Form submissions per month | 3,000 | 25,000 | 90,000 | 240,000 | 550,000 |
| Files stored | 2,000 | 20,000 | 80,000 | 250,000 | 600,000 |

### 25.4.2 Traffic shape

The load is not uniform, and the peaks are predictable, which is an advantage worth designing around.

| Pattern | Shape | Implication |
| --- | --- | --- |
| Daily | Peak 08:00–10:00 and 14:00–16:00 EAT. Trough 22:00–05:00 | Maintenance and batch work land in the trough |
| Weekly | Monday highest, Friday lowest, weekend near zero except field sync | Deployment windows Tuesday to Thursday |
| **Monthly** | Payroll days 25–28 concentrate HR and finance load; month-end reporting in the first three days | The largest predictable spike. Capacity is pre-scaled rather than reactively autoscaled |
| **Quarterly** | Donor reporting deadlines cluster in the first two weeks after quarter end | Report generation load multiplies by roughly 5× |
| Sync | Bursty. Field teams return to connectivity in convoys, so twenty devices may sync within the same ten minutes | The dominant burst driver; scaled on stream lag, not CPU |
| Seasonal | Lean-season programmes drive registration spikes; rainy-season access loss drives longer offline periods and larger sync batches | The offline budget must accommodate the worst season, not the average |

Peak-to-average ratio is roughly 4:1 daily and 8:1 during a payroll and reporting overlap. Capacity is planned against the 8:1 case.

### 25.4.3 Request volume estimate, Year 1

| Source | Requests per day | Peak requests per second |
| --- | --- | --- |
| Interactive web use, 220 concurrent at peak | 400,000 | 60 |
| Field sync, 200 devices | 40,000 | 25 in a burst |
| Dashboard and report loads | 25,000 | 12 |
| File operations | 8,000 | 5 |
| Internal service-to-service | 350,000 | 55 |
| Event processing | 250,000 events | 40 |
| Scheduled and batch | 15,000 | 10, in the trough |
| **Total** | **~1.1 M** | **~200 peak** |

---

## 25.5 Capacity plan

### 25.5.1 Compute

| Resource | Launch | Year 1 | Year 3 | Scaling trigger |
| --- | --- | --- | --- | --- |
| Application node pool | 3 × n2-standard-4 | 4–8 × n2-standard-4 | 8–16 | CPU above 65 per cent, or request rate per replica |
| Worker node pool | 2 × n2-highmem-2 | 3–6 | 6–12 | Queue depth |
| Batch node pool (spot) | 0–2 | 0–4 | 0–8 | Job queue |
| System node pool | 3 × e2-standard-4 | 3 × e2-standard-4 | 3 × e2-standard-8 | Observability retention and cardinality |
| Gateway replicas | 3 | 4–8 | 8–16 | Request rate |
| Tier 1 service replicas | 2 each | 2–6 each | 4–12 each | Per-service signal ([21 §21.4.3](21-deployment-and-infrastructure.md)) |

### 25.5.2 Database

| Aspect | Launch | Year 1 | Year 3 |
| --- | --- | --- | --- |
| Instance | db-custom-4-16384 | db-custom-8-32768 | db-custom-16-65536 |
| Storage | 200 GB | 500 GB | 2 TB |
| Read replicas | 1 in-region, 1 cross-region | Same | 2 in-region, 1 cross-region |
| Peak connections via PgBouncer | 40 | 80 | 150 |
| Largest table | `submission_values`, ~1 M rows | ~25 M rows | ~160 M rows |
| Partitioned tables | `audit_records` | `audit_records`, `submission_values`, `notifications` | Plus `attendance_records` |

Storage growth estimate: roughly 1.1 KB per submission value row, 2.6 KB per beneficiary including encrypted fields, 4 KB per payroll record with lines, 1.8 KB per audit record. Media dominates object storage rather than database storage, at roughly 400 KB per compressed field photograph.

### 25.5.3 Redis and object storage

| Resource | Launch | Year 1 | Year 3 |
| --- | --- | --- | --- |
| Redis memory | 2 GB | 5 GB | 16 GB |
| Streams retained | 24 h | 24 h | 24 h, trimmed by length |
| Object storage | 200 GB | 1.5 TB | 8 TB |
| Monthly egress | 40 GB | 300 GB | 1.5 TB |

---

## 25.6 Bottleneck analysis

An honest assessment of what breaks first as load grows, in the order it will happen.

| # | Bottleneck | Appears at | Symptom | Mitigation | Ceiling after mitigation |
| --- | --- | --- | --- | --- | --- |
| B-1 | **Database connections** | ~40 tenants | Pool wait time rising, then request timeouts | PgBouncer transaction pooling already in place; tune per-service pool sizes; move reads to the replica | ~150 tenants |
| B-2 | **Report generation on the primary** | ~30 tenants with active reporting | Reporting queries slow transactional work | Already isolated: separate worker pool, read replica, async execution | ~200 tenants |
| B-3 | **`submission_values` table size** | ~30 M rows | Index bloat, slow aggregation | Partition by month; pre-aggregate for reporting; archive beyond retention | ~500 M rows |
| B-4 | **Sync burst on `field-data-service`** | ~300 concurrent devices | Consumer lag, sync timeouts | Scale on stream lag; batch acceptance; per-tenant sync concurrency limits | ~1,500 devices |
| B-5 | **Payroll computation is single-threaded per run** | ~2,000 employees in one run | Run duration exceeds the window | Parallelise by employee within a run, with a deterministic merge; the computation is already pure per employee | ~10,000 employees |
| B-6 | **Redis memory for streams** | ~1.5 M events per day | Eviction risk on the stream database | Length-based trimming; separate instances for cache and streams; scale up | ~10 M events per day |
| B-7 | **Single-region write latency for distant tenants** | Any tenant far from `africa-south1` | Elevated write latency | Accepted for now; a second region is a Phase 5 decision ([34](34-future-extensibility.md)) | — |
| B-8 | **Audit table growth** | ~100 M rows | Slow audit queries, backup duration | Monthly partitioning already in place; archive partitions beyond 24 months to object storage while retaining queryability | ~1 B rows |
| B-9 | **Object storage egress cost** | ~2 TB per month | Cost, not performance | CDN in front of file downloads; aggressive client-side image compression | — |
| B-10 | **Observability cardinality and log volume** | ~60 services-worth of series | Prometheus memory, Loki cost | Cardinality budgets, sampling, rollups ([24 §24.10](24-observability.md)) | — |

B-1 and B-5 are the two worth watching most closely, because both have a hard cliff rather than a gradual degradation: connection exhaustion turns into total unavailability within seconds, and a payroll run that exceeds its window becomes a missed statutory deadline rather than a slow page.

---

## 25.7 Scaling strategy

### 25.7.1 What scales how

| Dimension | Approach | Limit |
| --- | --- | --- |
| Stateless services | Horizontal, HPA-driven | Node pool maximum, then cluster autoscaler |
| Database reads | Read replicas | Replica count, and replication lag tolerance |
| Database writes | **Vertical only** | The single largest architectural constraint. Sharding by tenant is the escape hatch, deferred until it is genuinely needed ([34](34-future-extensibility.md)) |
| Event processing | More consumers per group, up to the number of stream partitions | Redis Streams consumer group throughput |
| Report generation | More worker replicas | Worker pool capacity |
| File storage | Effectively unlimited | Cost |
| Field devices | Horizontal on `field-data-service` | Sync acceptance throughput |

The write-path constraint is stated plainly because it is the boundary condition of the whole architecture. A single PostgreSQL primary will carry this platform comfortably to several hundred tenants, and the moment it will not is well beyond the planning horizon. Designing for sharding now would add complexity to every query in the system in exchange for a capability that may never be needed — the classic premature-scaling error, and it is deliberately not made here ([04 §4.5](04-architecture-principles.md)).

### 25.7.2 Predictive pre-scaling

Because the largest peaks are calendar-driven rather than random, capacity is added ahead of them rather than reactively.

| Event | Action | Timing |
| --- | --- | --- |
| Payroll window, days 24–29 | Raise `hr-payroll-service` minimum replicas to 4; raise the worker pool minimum | Automated by schedule |
| Quarter-end reporting, first 14 days | Raise `reporting-service` minimum replicas to 4; raise the report worker concurrency | Automated by schedule |
| A known large registration campaign | Raise `beneficiary-service` and `field-data-service` minimums | Manually, on notice from the tenant |
| Onboarding a large tenant | Review capacity against the projection before go-live | Part of onboarding ([RB-05](runbooks/rb-05-tenant-onboarding.md)) |

Reactive autoscaling handles the unpredictable remainder. Pre-scaling exists because an HPA reacting to a payroll spike adds capacity two minutes after the users noticed.

---

## 25.8 Performance testing and regression control

Scenarios and pass criteria are in [23 §23.11](23-testing-strategy.md). The governance around them:

| Activity | Cadence | Gate |
| --- | --- | --- |
| Smoke load profile | Every merge to `main` | Blocking |
| Full load profile | Weekly, and before every release | Blocking pre-release |
| Baseline comparison | Every full run | A regression beyond 10 per cent on any p95 blocks the release |
| Soak test | Weekly, 4 hours | No memory growth trend, no connection leak |
| Capacity review against actuals | Monthly | Projections corrected against observed growth |
| Bottleneck reassessment | Quarterly | The table in §25.6 is revised, not merely reread |
| Query plan review for new large-table queries | Per pull request | Blocking |

### 25.8.1 Production performance monitoring

Synthetic tests establish that the system can be fast; production telemetry establishes whether it is. The signals watched continuously are p95 and p99 per endpoint against the budgets in §25.2, event loop lag as the earliest saturation indicator, database pool wait time, cache hit ratios against target, and Core Web Vitals from real user monitoring segmented by connection type — because an aggregate LCP that looks healthy can conceal a 3G segment that is failing badly.
