# 24 — Observability

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Chapter:** 24 — Observability
> **Owner:** Platform Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Review Cadence:** Quarterly
> **Related ADRs:** [ADR-0017](adr/0017-self-hosted-observability-stack.md)

---

## 24.1 What observability is for here

The test of an observability stack is not whether it produces dashboards. It is whether a single engineer, woken at 02:00, can answer three questions in under five minutes: what is broken, who is affected, and what changed. Everything in this chapter is arranged around those three questions.

A secondary constraint shapes the design as much as the primary one: **telemetry must not become a second copy of the personal data the platform is designed to protect.** Logs, traces and metrics are stored with weaker access control than the database, are retained in places the retention sweep does not reach, and are read casually during incidents. Every rule in [§24.3.3](#2433-what-never-appears-in-telemetry) exists because a log line is the easiest possible way to undo [17](17-privacy-and-compliance.md).

| Pillar | Tool | Purpose |
| --- | --- | --- |
| Metrics | Prometheus, Grafana | Aggregate behaviour over time; alerting; SLOs |
| Logs | Loki, promtail | Discrete event detail with correlation |
| Traces | OpenTelemetry, Tempo | Causality and latency attribution across services |
| Errors | Sentry | Exception aggregation, release attribution, stack traces |
| Uptime | GCP uptime checks plus external synthetics | Availability from outside the cluster |
| Audit | The `audit_records` table | Not observability. A permanent business record ([14 §14.7](14-security-architecture.md)) |

Self-hosted rather than a commercial platform, recorded in [ADR-0017](adr/0017-self-hosted-observability-stack.md). At this scale a Datadog or New Relic bill would rival the entire infrastructure spend, and the data residency question for telemetry containing tenant identifiers is answered more simply by keeping it in the same region as everything else.

---

## 24.2 Metrics

### 24.2.1 Conventions

| Rule | Detail |
| --- | --- |
| Naming | `ngois_<subsystem>_<name>_<unit>`. Counters end `_total`, durations end `_seconds`, sizes end `_bytes` |
| Units | Base SI units always. Seconds, not milliseconds. Bytes, not megabytes |
| Types | Counter for monotonic totals, histogram for distributions, gauge for point-in-time values. Summaries are not used, because they cannot be aggregated across replicas |
| Labels | Low cardinality only. `service`, `endpoint` (the route template, never the resolved path), `method`, `status_class`, `event_type`, `result` |
| **Never a label** | `tenant_id`, `user_id`, any entity ID, any raw path, any error message. A `tenant_id` label at 25 tenants seems harmless and becomes a cardinality explosion at 200 while also spreading tenant identifiers through telemetry |
| Cardinality budget | 10,000 series per service. Exceeding it triggers an alert against the team, not against the system |
| Per-tenant analysis | Done from logs and from the analytics tables, not from metrics. This is the deliberate trade: metrics answer "is the platform healthy", logs answer "is this tenant healthy" |

The prohibition on high-cardinality labels is the single most common cause of a Prometheus deployment collapsing, and it is always introduced with good intentions.

### 24.2.2 Registry — HTTP and gateway

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `ngois_http_requests_total` | Counter | `service`, `method`, `endpoint`, `status_class` | Request rate, error rate |
| `ngois_http_request_duration_seconds` | Histogram | `service`, `method`, `endpoint` | Latency distribution. Buckets: 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000 ms |
| `ngois_http_request_size_bytes` | Histogram | `service`, `endpoint` | Payload size, relevant to bandwidth cost |
| `ngois_http_response_size_bytes` | Histogram | `service`, `endpoint` | Same |
| `ngois_http_in_flight_requests` | Gauge | `service` | Concurrency and saturation |
| `ngois_gateway_rate_limit_rejections_total` | Counter | `tier`, `endpoint_class` | Rate limiting behaviour |
| `ngois_gateway_auth_failures_total` | Counter | `reason` | Expired, invalid signature, missing, wrong audience |
| `ngois_gateway_circuit_breaker_state` | Gauge | `service` | 0 closed, 1 half-open, 2 open |
| `ngois_gateway_upstream_errors_total` | Counter | `service`, `reason` | Timeout, connection refused, 5xx |

### 24.2.3 Registry — database and cache

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `ngois_db_query_duration_seconds` | Histogram | `service`, `operation` | Query latency by named operation, not by SQL text |
| `ngois_db_queries_total` | Counter | `service`, `operation`, `result` | Volume and failure rate |
| `ngois_db_pool_connections` | Gauge | `service`, `state` | Active, idle, waiting |
| `ngois_db_pool_wait_duration_seconds` | Histogram | `service` | Pool contention. A rising p95 here precedes an outage |
| `ngois_db_transaction_duration_seconds` | Histogram | `service` | Long transactions block vacuum and hold locks |
| `ngois_db_deadlocks_total` | Counter | `service` | Should be near zero |
| `ngois_db_statement_timeouts_total` | Counter | `service` | Queries killed by the timeout |
| `ngois_db_rls_context_missing_total` | Counter | `service` | **Must be zero.** A non-zero value is a security defect, not a performance one |
| `ngois_cache_operations_total` | Counter | `service`, `operation`, `result` | Hit, miss, error |
| `ngois_cache_hit_ratio` | Gauge | `service`, `key_class` | Cache effectiveness |
| `ngois_cache_operation_duration_seconds` | Histogram | `service`, `operation` | Redis latency |

### 24.2.4 Registry — events

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `ngois_events_published_total` | Counter | `service`, `event_type` | Publication volume |
| `ngois_outbox_pending` | Gauge | `service` | Unpublished outbox rows. A rising value means the relay is stalled |
| `ngois_outbox_relay_lag_seconds` | Gauge | `service` | Age of the oldest unpublished row |
| `ngois_events_consumed_total` | Counter | `service`, `event_type`, `result` | Success, retry, dlq |
| `ngois_event_processing_duration_seconds` | Histogram | `service`, `event_type` | Handler latency |
| `ngois_stream_consumer_lag` | Gauge | `stream`, `consumer_group` | Pending entries. The primary event-system health signal |
| `ngois_stream_oldest_pending_seconds` | Gauge | `stream`, `consumer_group` | Age of the oldest unacknowledged entry |
| `ngois_events_dlq_total` | Counter | `stream`, `event_type` | Dead-lettered events. Any non-zero value needs a human |
| `ngois_events_retried_total` | Counter | `stream`, `event_type`, `attempt` | Retry distribution |
| `ngois_events_duplicate_suppressed_total` | Counter | `service`, `event_type` | Idempotency working as intended |

### 24.2.5 Registry — domain

The metrics that answer "is the product working", as distinct from "is the infrastructure working". These are what catch a release that is technically healthy and functionally broken ([22 §22.5.1](22-cicd-release-supply-chain.md)).

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `ngois_grant_disbursements_recorded_total` | Counter | `result` | Financial activity |
| `ngois_grant_ceiling_rejections_total` | Counter | — | Business rule engaging correctly |
| `ngois_payroll_runs_total` | Counter | `country`, `status` | Payroll activity |
| `ngois_payroll_computation_duration_seconds` | Histogram | `country` | Computation performance |
| `ngois_payroll_employees_processed_total` | Counter | `country` | Volume |
| `ngois_payroll_computation_errors_total` | Counter | `country`, `reason` | **Alerts immediately at any value** |
| `ngois_submissions_accepted_total` | Counter | `source` | `online`, `sync` |
| `ngois_submissions_rejected_total` | Counter | `reason` | Validation, version, duplicate |
| `ngois_sync_sessions_total` | Counter | `result` | Completed, interrupted, failed |
| `ngois_sync_batch_duration_seconds` | Histogram | — | Field sync performance |
| `ngois_sync_conflicts_total` | Counter | `entity`, `resolution` | Conflict volume and how resolved |
| `ngois_sync_queue_age_seconds` | Histogram | — | Reported by devices: how long data waited offline |
| `ngois_beneficiaries_registered_total` | Counter | — | Programme activity |
| `ngois_duplicate_candidates_total` | Counter | `outcome` | Deduplication effectiveness |
| `ngois_reports_generated_total` | Counter | `report_type`, `result` | Reporting activity |
| `ngois_report_generation_duration_seconds` | Histogram | `report_type` | Reporting performance |
| `ngois_notifications_sent_total` | Counter | `channel`, `result` | Delivery |
| `ngois_files_uploaded_total` | Counter | `result` | File activity |
| `ngois_file_scan_rejections_total` | Counter | `reason` | Malware, type, size |
| `ngois_active_sessions` | Gauge | — | Concurrent users |
| `ngois_logins_total` | Counter | `result`, `mfa` | Authentication |

### 24.2.6 Registry — integrations and AI

| Metric | Type | Labels | Purpose |
| --- | --- | --- | --- |
| `ngois_integration_requests_total` | Counter | `provider`, `operation`, `result` | External call volume |
| `ngois_integration_duration_seconds` | Histogram | `provider`, `operation` | External latency |
| `ngois_integration_circuit_state` | Gauge | `provider` | Breaker state |
| `ngois_integration_retries_total` | Counter | `provider`, `attempt` | Retry pressure |
| `ngois_iati_publications_total` | Counter | `result` | Transparency commitment |
| `ngois_fx_rate_age_seconds` | Gauge | `pair` | A stale rate silently corrupts payroll conversion |
| `ngois_ai_requests_total` | Counter | `use_case`, `result` | AI usage |
| `ngois_ai_tokens_total` | Counter | `use_case`, `direction` | Cost driver |
| `ngois_ai_request_duration_seconds` | Histogram | `use_case` | LLM latency |
| `ngois_ai_redaction_rejections_total` | Counter | `detector` | Requests blocked by the gate. Expected to be non-zero; the gate is working |
| `ngois_ai_redaction_failures_total` | Counter | — | **Must be zero.** A leak past the gate |
| `ngois_ai_cache_hits_total` | Counter | `use_case` | Cost saving |
| `ngois_ai_budget_rejections_total` | Counter | — | Budget enforcement |
| `ngois_ai_output_unverified_numbers_total` | Counter | `use_case` | Fabrication guardrail engaging |

### 24.2.7 Runtime and infrastructure

Node.js process metrics via `prom-client` defaults: event loop lag, heap used and total, external memory, active handles, GC pause duration and count, CPU. Kubernetes and node metrics via `kube-state-metrics` and `node-exporter`. Cloud SQL, Memorystore and Cloud Storage metrics via the GCP managed-service exporter.

Event loop lag deserves specific mention: in a Node.js service it is the earliest and clearest saturation signal, often visible minutes before latency degrades enough to breach an SLO.

---

## 24.3 Logging

### 24.3.1 Schema

Every log line from every service is a single JSON object with a fixed core schema. Uniformity is what makes a query across fifteen services possible.

```json
{
  "timestamp": "2026-06-20T14:23:11.472Z",
  "level": "info",
  "service": "grant-service",
  "version": "1.4.2",
  "environment": "production",
  "pod": "grant-service-7d4f8b-x2k9p",
  "correlation_id": "01J8XQ2M3K4N5P6R7S8T9V0W1X",
  "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "span_id": "00f067aa0ba902b7",
  "tenant_id": "9f2a3b4c-...",
  "user_id": "7e1d2c3b-...",
  "user_role": "finance_manager",
  "operation": "grant.disbursement.create",
  "message": "Disbursement recorded",
  "duration_ms": 47,
  "outcome": "success",
  "http": { "method": "POST", "route": "/v1/grant/grants/:id/disbursements", "status": 201 },
  "context": { "grant_id": "3c4d5e6f-...", "amount_class": "10k-50k", "currency": "USD" }
}
```

Note `amount_class` rather than `amount`. A disbursement amount is confidential financial data; a bucketed class supports operational analysis without putting the figure in a log store.

### 24.3.2 Levels

| Level | Meaning | Retention | Examples |
| --- | --- | --- | --- |
| `error` | An operation failed and needs attention | 90 d | Unhandled exception, database unreachable, payroll computation failure, event dead-lettered |
| `warn` | Degraded or unexpected but handled | 30 d | Retry succeeded, circuit breaker opened, cache miss storm, validation rejection rate elevated, deprecated API version used |
| `info` | A significant business or lifecycle event | 30 d | Request completed, event published or consumed, service started, migration applied, flag changed |
| `debug` | Diagnostic detail | 7 d | Query plans, intermediate computation state, sync batch detail |
| `trace` | Very verbose | Not enabled in production | Local only |

`debug` in production is enabled per service for a bounded period with a recorded reason, and reverts automatically after four hours. An indefinite `debug` level is both a cost problem and a privacy problem, because debug lines are where developers put the values they wish they could see.

### 24.3.3 What never appears in telemetry

| Prohibited | Instead |
| --- | --- |
| Any beneficiary name, identifier, phone, date of birth, coordinates | The record's UUID |
| Any employee name, salary, tax identifier, bank detail | The employee's UUID |
| Passwords, tokens, session identifiers, refresh tokens, MFA codes | Nothing. Never logged in any form |
| API keys, secrets, private keys | Nothing |
| Full request bodies on endpoints handling personal data | Field names present, with values redacted |
| Query parameters that may contain search terms over personal data | The parameter name and a hash |
| Full SQL with bound parameter values | The named operation and the parameter count |
| Raw external provider responses that may contain personal data | Status and a redacted summary |
| Email addresses in full | Domain plus a hash of the local part |
| Amounts of money | A bucketed class |
| File names, which frequently contain a person's name | The file UUID |

Enforcement is layered: a shared logger that redacts by key name and by value shape before serialisation, a Semgrep rule that flags a log call whose argument includes a known PII field name, the same detector set used by the AI redaction gate ([18 §18.5.1](18-ai-llm-architecture.md)), and a nightly job that samples Loki for pattern matches and raises a security finding on a hit.

### 24.3.4 Storage and cost

| Aspect | Approach |
| --- | --- |
| Collection | promtail as a DaemonSet, container stdout only. No log files inside containers |
| Store | Loki with a GCS backend and an index in the same bucket |
| Retention tiers | error 90 d, warn 30 d, info 30 d, debug 7 d, access logs 30 d, security-relevant 365 d |
| Volume estimate | 12–18 GB per day at launch load; roughly 40 GB per day at Phase 4 projections |
| Cost control | Sampling of successful `info` request logs at 10 per cent above 500 requests per minute per endpoint; errors and warnings never sampled; structured fields rather than verbose messages |
| Labels | `service`, `level`, `environment`, `namespace` only. Loki's cost and performance are dominated by label cardinality exactly as Prometheus's are |
| High-cardinality search | `tenant_id`, `correlation_id` and `user_id` live in the log line body, queried with a filter expression rather than as labels |
| Access | Grafana with role-based access. Log access is itself audited, because a log store containing tenant identifiers is a sensitive system |

---

## 24.4 Distributed tracing

### 24.4.1 Configuration

| Aspect | Approach |
| --- | --- |
| Standard | OpenTelemetry, auto-instrumentation for HTTP, PostgreSQL and Redis, plus manual spans for domain operations |
| Collector | OpenTelemetry Collector as a DaemonSet, exporting to Tempo |
| Sampling | Head-based at 10 per cent in production, 100 per cent in staging. **Tail sampling keeps 100 per cent of traces containing an error, a span over 1 s, or a 5xx**, which is what makes a 10 per cent rate acceptable |
| Propagation | W3C `traceparent` and `tracestate`. The `correlation_id` is carried as a baggage item so it survives into logs and into asynchronous processing |
| Async continuity | The trace context is stored in the outbox row and restored by the consumer, so an event-driven flow appears as one trace rather than as several disconnected ones |
| Retention | 7 days for sampled traces, 30 days for error traces |

Propagating context through the event bus is the detail that makes tracing genuinely useful in this architecture. Without it, a disbursement's trace ends at the HTTP response and the audit write, notification and analytics update that follow appear as three unrelated traces with no visible cause.

### 24.4.2 Span conventions

| Span | Name | Key attributes |
| --- | --- | --- |
| Inbound HTTP | `<METHOD> <route template>` | `http.method`, `http.route`, `http.status_code`, `ngois.tenant_id`, `ngois.user_role` |
| Outbound service call | `<service>.<operation>` | `peer.service`, `ngois.correlation_id` |
| Database | `pg.<operation>` | `db.system`, `db.operation`, `db.statement` **as the named operation, never raw SQL with values** |
| Cache | `redis.<command>` | `db.system`, `ngois.cache_key_class` |
| Event publish | `publish <event_type>` | `messaging.destination`, `ngois.event_id` |
| Event consume | `consume <event_type>` | `messaging.destination`, `ngois.event_id`, `ngois.attempt` |
| External provider | `<provider>.<operation>` | `peer.service`, `http.status_code`, `ngois.circuit_state` |
| Domain operation | `<context>.<operation>` | Domain-specific, non-identifying |
| AI call | `ai.<use_case>` | `ngois.model_version`, `ngois.prompt_template`, token counts |

Span attributes are subject to the same prohibition list as logs. A trace viewer is not a safer place for a beneficiary name than a log line.

---

## 24.5 Health probes

Semantics defined in [06 §6.4.1](06-microservice-design.md); restated because the distinction is the most frequently misimplemented thing in Kubernetes operations.

| Probe | Question it answers | Checks | Failure consequence |
| --- | --- | --- | --- |
| `/health/live` | Is this process fundamentally broken? | Event loop responsive; no unrecoverable internal state | The pod is **restarted** |
| `/health/ready` | Should this pod receive traffic right now? | Database reachable, Redis reachable, required migrations applied, warm-up complete, not shutting down | The pod is **removed from the load balancer** but keeps running |
| `/health/startup` | Has initialisation finished? | Configuration valid, connections established, caches warmed | Liveness and readiness are deferred until this passes |

**A liveness probe must never check a dependency.** If liveness checked the database, a thirty-second database blip would restart every pod in the cluster simultaneously, turning a recoverable dependency incident into a full outage with a thundering-herd reconnection storm on recovery. Dependency health is a readiness concern, because the correct response to "the database is unreachable" is to stop accepting traffic, not to restart.

Readiness responses carry per-dependency detail so an operator can see which dependency is failing without reading logs:

```json
{
  "status": "degraded",
  "version": "1.4.2",
  "checks": {
    "database": { "status": "ok", "latency_ms": 4 },
    "redis":    { "status": "ok", "latency_ms": 1 },
    "migrations": { "status": "ok", "applied": 147, "expected": 147 },
    "event_consumer": { "status": "degraded", "lag": 1240 }
  }
}
```

---

## 24.6 Dashboards

Fifteen dashboards, each with a stated audience and a stated question. A dashboard without a question it exists to answer becomes wallpaper.

| # | Dashboard | Audience | Question it answers |
| --- | --- | --- | --- |
| D-01 | **Platform overview** | Everyone, on the wall | Is the platform healthy right now? Request rate, error rate, p95 latency, SLO status per service, active incidents, deployment markers |
| D-02 | **Service detail** (templated per service) | On-call | What is wrong with this service? RED metrics, saturation, pool state, restarts, recent deployments, top errors |
| D-03 | **API gateway** | On-call | Traffic shape and edge behaviour. Rate by endpoint, status distribution, rate-limit rejections, auth failures, circuit breaker states, upstream latency |
| D-04 | **Database** | On-call, Data Architect | Is the database the problem? Connections by state, pool wait time, query latency by operation, slow query count, lock waits, replication lag, cache hit ratio, table and index bloat, disk growth |
| D-05 | **Event system** | On-call | Are events flowing? Publication rate, consumer lag per group, oldest pending age, DLQ depth, retry distribution, outbox pending, processing latency |
| D-06 | **Redis** | On-call | Memory, hit ratio, evictions, connections, command latency, stream lengths, replication state |
| D-07 | **Kubernetes** | Platform | Node capacity, pod status, restarts, pending pods, HPA state, PDB status, resource requests versus actual usage |
| D-08 | **SLO and error budget** | Everyone, weekly review | How much budget remains, and what consumed it? Per-SLO compliance, burn rate, 28-day trend |
| D-09 | **Field operations** | Product, Platform | Are field officers able to work? Sync sessions, batch latency, queue age distribution, conflict rate by entity, submissions by source, device count active in the last 7 days |
| D-10 | **Payroll** | Finance, HR, on-call during a run | Is the payroll run healthy? Run status by tenant, computation duration, employees processed, errors, approval state, FX rate age |
| D-11 | **Integrations** | Platform | Are external systems cooperating? Per-provider request rate, error rate, latency, circuit state, retry volume, IATI publication status |
| D-12 | **AI usage and cost** | Platform, Finance | What is AI costing and is it working? Requests by use case, tokens and cost, cache hit rate, redaction rejections by detector, unverified-number count, budget consumption per tenant |
| D-13 | **Security** | Security Lead | Anything suspicious? Failed logins, lockouts, MFA failures, privilege denials, break-glass activations, bulk export volume, PII access rate, RLS context misses, file scan rejections |
| D-14 | **Tenant health** (templated per tenant) | Support, Product | Is this tenant having a bad time? Their request rate, error rate, latency, quota consumption, active users, sync health, storage use |
| D-15 | **Business activity** | Leadership | Is the platform being used? Active users and tenants, grants and disbursements recorded, submissions, beneficiaries registered, courses completed, reports generated, adoption per module |

Every dashboard carries deployment annotations from the CD pipeline, so the answer to "what changed" is on the same screen as the answer to "what is broken". This single feature shortens more incidents than any other dashboard element.

---

## 24.7 Alerts

### 24.7.1 Principles

| Principle | Consequence |
| --- | --- |
| **An alert means a human must act now** | Anything that does not require immediate action is a dashboard panel or a ticket, not an alert |
| **Alert on symptoms, not causes** | "Checkout latency exceeds the SLO" pages. "CPU is at 80 per cent" does not, because 80 per cent CPU with healthy latency is a well-utilised system |
| **Every alert names a runbook** | An alert with no documented response is an incomplete alert and is rejected in review |
| **Page rarely** | More than two pages per on-call week triggers a review of the alerts, not of the on-call engineer |
| **A silenced alert has an expiry** | An indefinite silence is how a real problem goes unnoticed for a month |
| **Alerts are reviewed after every incident** | Did the right alert fire? Did it fire early enough? Did a useless one fire alongside it? |

### 24.7.2 Severities

| Severity | Response | Channel | Examples |
| --- | --- | --- | --- |
| **P1** | Immediate page, 24/7 | PagerDuty, phone | Platform down, database unavailable, data loss suspected, cross-tenant leak, active security breach |
| **P2** | Page during working hours; ticket overnight | PagerDuty, Slack | A Tier 1 service degraded, SLO fast burn, payroll run failure, event consumer badly stalled |
| **P3** | Ticket, next working day | Slack | A Tier 2 service degraded, elevated error rate within budget, capacity approaching a threshold |
| **P4** | Weekly review | Email digest | Slow-burn trends, certificate expiry at 21 days, cost anomaly |

### 24.7.3 Alert catalogue

| Alert | Condition | Sev | Runbook |
| --- | --- | --- | --- |
| `PlatformDown` | Gateway availability < 50 per cent over 2 min | P1 | [RB-13](runbooks/rb-13-service-down.md) |
| `DatabaseUnavailable` | Cloud SQL unreachable from 2 or more services for 1 min | P1 | [RB-03](runbooks/rb-03-database-failover.md) |
| `CrossTenantAccessDetected` | `ngois_db_rls_context_missing_total` > 0, or an isolation canary failing | **P1** | [RB-14](runbooks/rb-14-security-incident.md) |
| `PIIRedactionFailure` | `ngois_ai_redaction_failures_total` > 0 | **P1** | [RB-14](runbooks/rb-14-security-incident.md) |
| `AuditChainBroken` | The audit hash chain fails verification | **P1** | [RB-14](runbooks/rb-14-security-incident.md) |
| `DataLossSuspected` | Backup verification failure, or a replication gap beyond RPO | P1 | [RB-11](runbooks/rb-11-backup-restore-drill.md) |
| `Tier1ServiceDown` | Zero ready replicas for 1 min | P1 | [RB-13](runbooks/rb-13-service-down.md) |
| `Tier1ErrorRateHigh` | 5xx rate > 5 per cent over 5 min | P2 | [RB-13](runbooks/rb-13-service-down.md) |
| `SLOFastBurn` | 14.4× burn rate over 1 h — the 30-day budget would be exhausted in 2 days | P2 | [§24.8](#248-slis-slos-and-error-budgets) |
| `SLOSlowBurn` | 6× burn rate over 6 h | P3 | Same |
| `LatencyHigh` | p95 > 2× the SLO target for 10 min | P2 | [RB-08](runbooks/rb-08-scale-event.md) |
| `PayrollRunFailed` | `ngois_payroll_computation_errors_total` > 0 | **P2** | [RB-01](runbooks/rb-01-failed-payroll-run.md) |
| `PayrollRunStalled` | A run in `computing` for over 15 min | P2 | [RB-01](runbooks/rb-01-failed-payroll-run.md) |
| `EventConsumerLagCritical` | Consumer lag > 5,000, or oldest pending > 10 min | P2 | [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) |
| `EventsDeadLettered` | Any increase in `ngois_events_dlq_total` | P2 | [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) |
| `OutboxRelayStalled` | `ngois_outbox_relay_lag_seconds` > 300 | P2 | [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) |
| `SyncFailureRateHigh` | Sync session failure rate > 10 per cent over 15 min | **P2** | [RB-16](runbooks/rb-16-sync-failure.md) |
| `SyncVolumeAnomalous` | Submission arrival rate below 20 per cent of the same weekday baseline for 2 h | P3 | [RB-16](runbooks/rb-16-sync-failure.md) |
| `DatabaseConnectionsHigh` | Pool utilisation > 85 per cent for 5 min | P2 | [RB-08](runbooks/rb-08-scale-event.md) |
| `DatabasePoolWaitHigh` | p95 pool wait > 100 ms for 5 min | P2 | [RB-08](runbooks/rb-08-scale-event.md) |
| `ReplicationLagHigh` | Replica lag > 30 s for 5 min | P2 | [RB-03](runbooks/rb-03-database-failover.md) |
| `DiskGrowthAnomalous` | Projected to fill within 14 days | P3 | [RB-08](runbooks/rb-08-scale-event.md) |
| `RedisMemoryHigh` | > 85 per cent used | P2 | [RB-08](runbooks/rb-08-scale-event.md) |
| `RedisEvictionsOccurring` | Any eviction on the stream database | **P2** | [RB-02](runbooks/rb-02-dlq-drain-and-replay.md) |
| `CircuitBreakerOpen` | Any breaker open for over 5 min | P3 | [RB-15](runbooks/rb-15-integration-failure.md) |
| `IntegrationErrorRateHigh` | Per-provider error rate > 25 per cent over 10 min | P3 | [RB-15](runbooks/rb-15-integration-failure.md) |
| `FXRateStale` | `ngois_fx_rate_age_seconds` > 172800 (48 h) | **P2** | [RB-15](runbooks/rb-15-integration-failure.md) |
| `NotificationBacklog` | Queue depth > 2,000 for 15 min | P3 | [RB-08](runbooks/rb-08-scale-event.md) |
| `AuthFailureSpike` | Failed logins > 10× baseline over 10 min | P2 | [RB-14](runbooks/rb-14-security-incident.md) |
| `BreakGlassActivated` | Any break-glass access granted | P2 informational | [15 §15.6](15-rbac-and-authorization.md) |
| `BulkExportAnomalous` | Export volume > 5× the tenant's baseline | P2 | [RB-14](runbooks/rb-14-security-incident.md) |
| `PIIAccessAnomalous` | A user's PII read rate > 10× their own baseline | P3 | [17 §17.13](17-privacy-and-compliance.md) |
| `PodCrashLooping` | Any pod restarting more than 3 times in 10 min | P2 | [RB-13](runbooks/rb-13-service-down.md) |
| `CertificateExpiringSoon` | Under 21 days remaining | P4, P2 under 7 days | [RB-04](runbooks/rb-04-certificate-rotation.md) |
| `SecretRotationOverdue` | Past the rotation schedule | P3 | [RB-09](runbooks/rb-09-secret-rotation.md) |
| `AICostAnomalous` | Spend > 3× the trailing weekly mean | P3 | [18 §18.10](18-ai-llm-architecture.md) |
| `BackupVerificationFailed` | The weekly restore test failed | **P2** | [RB-11](runbooks/rb-11-backup-restore-drill.md) |
| `MetricCardinalityHigh` | A service exceeding 10,000 series | P4 | Engineering ticket |
| `TenantQuotaExceeded` | A tenant at 100 per cent of a quota | P3 | [29 §29.5](29-multi-tenancy-and-tenant-lifecycle.md) |

`SyncVolumeAnomalous` is worth explaining, because it is an absence alert rather than a failure alert. Nothing is erroring; submissions have simply stopped arriving. That pattern means either a client-side defect, an authentication problem affecting devices, or a real-world event affecting the field teams — and it is invisible to every conventional error-rate alert.

---

## 24.8 SLIs, SLOs and error budgets

### 24.8.1 Definitions

| # | SLI | Definition | SLO | Window |
| --- | --- | --- | --- | --- |
| S-1 | Platform availability | Proportion of gateway requests not returning 5xx | **99.5 per cent** | 30 d rolling |
| S-2 | Read latency | Proportion of GET requests served under 500 ms | 99 per cent | 30 d |
| S-3 | Write latency | Proportion of POST, PUT and PATCH requests served under 1 s | 99 per cent | 30 d |
| S-4 | Authentication availability | Proportion of login attempts not failing for a platform reason | 99.9 per cent | 30 d |
| S-5 | **Field sync success** | Proportion of sync sessions completing without a platform-side failure | **99.5 per cent** | 30 d |
| S-6 | Submission durability | Proportion of accepted submissions still retrievable | **100 per cent** | Always |
| S-7 | Payroll correctness | Proportion of runs completing without a computation error | **100 per cent** | Always |
| S-8 | Event delivery | Proportion of events processed within 60 s of publication | 99 per cent | 30 d |
| S-9 | Report generation | Proportion of standard reports completing within 30 s | 95 per cent | 30 d |
| S-10 | File availability | Proportion of file requests served successfully | 99.9 per cent | 30 d |
| S-11 | Dashboard freshness | Proportion of dashboard loads showing data under 15 min old | 99 per cent | 30 d |

Two SLOs are set at 100 per cent, which is normally poor practice because it leaves no error budget. They are deliberate: submission durability and payroll correctness are not targets to be traded against release velocity. A single lost submission or a single wrong payslip is an incident with an investigation and a postmortem, not a budget draw.

The field sync SLO is set higher than platform availability, which appears inverted until you consider the user: a field officer has a narrow window in which connectivity exists, and a failure during that window may mean a three-day delay rather than a retry in thirty seconds.

### 24.8.2 Error budget policy

At 99.5 per cent over 30 days the budget is 3 hours 39 minutes of unavailability.

| Budget consumed | Policy |
| --- | --- |
| < 50 per cent | Normal operation. Ship freely |
| 50–75 per cent | Caution. Reliability work is prioritised alongside features in planning |
| 75–90 per cent | **Feature freeze on the affected service.** Only reliability work, bug fixes and security patches |
| > 90 per cent | Platform-wide freeze on the affected service. A written reliability plan goes to the Chief Architect before normal delivery resumes |
| Exhausted | Incident review with leadership. The plan must be executed before any feature work resumes |

The freeze applies per service, not platform-wide, so a struggling reporting service does not stop grant module delivery. The policy is written down in advance precisely so that the decision to freeze is not a negotiation held under pressure.

### 24.8.3 Burn-rate alerting

Multi-window, multi-burn-rate, which is the approach that avoids both alerting on every brief blip and failing to notice a slow bleed.

| Burn rate | Windows | Budget consumed | Severity | Meaning |
| --- | --- | --- | --- | --- |
| 14.4× | 1 h and 5 min | 2 per cent | P2 page | Budget gone in 2 days at this rate |
| 6× | 6 h and 30 min | 5 per cent | P3 ticket | Budget gone in 5 days |
| 3× | 1 d and 2 h | 10 per cent | P3 ticket | Budget gone in 10 days |
| 1× | 3 d and 6 h | 10 per cent | P4 review | Trending to exactly exhaust the budget |

The short second window in each row is what prevents a stale alert: both the long and short windows must be breaching for the alert to fire, so recovery clears it quickly.

---

## 24.9 Synthetic monitoring

External checks, because a monitoring system inside the cluster cannot tell you the cluster is unreachable.

| Check | Frequency | From | Asserts |
| --- | --- | --- | --- |
| Health endpoint | 60 s | 4 regions including one African | 200 and under 2 s |
| Login journey | 5 min | 2 regions | Full authentication flow completes |
| Grant read journey | 5 min | 2 regions | Authenticated read returns expected data |
| Submission accept | 15 min | 1 region | A synthetic submission is accepted and retrievable |
| Report generation | 1 h | 1 region | A standard report completes within the SLO |
| **Tenant isolation canary** | 15 min | 1 region | A canary tenant's credentials cannot reach another canary tenant's data. Failure is P1 |
| Certificate validity | 1 h | External | Chain valid, over 21 days remaining |
| DNS resolution | 5 min | 4 regions | Correct records returned |
| Frontend load | 10 min | 2 regions | App shell loads, Core Web Vitals within budget |

The isolation canary is unusual and the most valuable check in the list. Two purpose-built tenants exist in production with known synthetic data, and a job continuously attempts cross-tenant access between them. It is the only mechanism that verifies tenant isolation against the actual running system with the actual production configuration, rather than against a test environment.

---

## 24.10 Retention and cost

| Data | Retention | Estimated volume | Notes |
| --- | --- | --- | --- |
| Metrics, raw 15 s | 15 d | ~40 GB | Prometheus local |
| Metrics, 5 min rollup | 90 d | ~15 GB | Recording rules |
| Metrics, 1 h rollup | 400 d | ~4 GB | Capacity planning and year-over-year comparison |
| Logs, error | 90 d | ~30 GB | |
| Logs, warn and info | 30 d | ~400 GB | The dominant cost; sampling applies |
| Logs, debug | 7 d | ~40 GB | Rarely enabled |
| Logs, security-relevant | 365 d | ~20 GB | Investigation window |
| Traces, sampled | 7 d | ~60 GB | |
| Traces, error | 30 d | ~15 GB | |
| Errors, Sentry | 90 d | — | |
| Audit records | 7–10 y | In PostgreSQL, partitioned | Not observability; a business record |

Estimated observability cost is 220–380 USD per month at launch scale, detailed in [33](33-cost-model-and-finops.md). Log volume is the dominant term and the first place to look when the figure moves.

---

## 24.11 Observability governance

| Activity | Cadence | Owner |
| --- | --- | --- |
| Alert review: did it fire, was it useful, is the runbook right | Monthly | Platform Lead |
| Alert review after every incident | Per incident | Incident Commander |
| SLO review: are the targets still right | Quarterly | Chief Architect |
| Error budget review | Weekly | Platform Lead |
| Dashboard review: is each one still answering its question | Quarterly | Platform Lead |
| Metric cardinality review | Monthly | Platform Lead |
| Log volume and cost review | Monthly | Platform Lead |
| **PII-in-telemetry audit** | Monthly, sampled | Security Lead |
| Runbook accuracy verification | Quarterly, by execution in staging | Platform Lead |
| New service onboarding checklist | Per service | The owning engineer |

### 24.11.1 New service observability checklist

A service is not production-ready until every item is complete ([06 §6.4.4](06-microservice-design.md)):

1. Structured logging with the standard schema and the shared redacting logger.
2. All three health probes with correct semantics.
3. RED metrics exposed on `/metrics` at port 9464.
4. Domain metrics defined for whatever this service uniquely does.
5. OpenTelemetry instrumentation, including context propagation through any events it publishes or consumes.
6. A D-02 service dashboard instance.
7. Alerts defined, each naming a runbook.
8. An SLO defined, or an explicit recorded statement that it inherits its tier's SLO.
9. A runbook for its known failure modes.
10. Cardinality verified under budget.
11. A synthetic check if it is on a user-facing path.
12. Its telemetry reviewed for PII leakage before first production deployment.
