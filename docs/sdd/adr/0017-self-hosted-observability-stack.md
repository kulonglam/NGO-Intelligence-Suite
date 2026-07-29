# ADR-0017 — Self-Hosted Prometheus, Grafana, Loki and Tempo

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-05-22 |
| **Deciders** | Platform Lead, Chief Architect |
| **Consulted** | DPO, Executive Director |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [24](../24-observability.md) |

---

## Context

Fifteen services, asynchronous workflows spanning several of them, and an on-call model where the person paged may not have written the code and may be diagnosing at 2 a.m. from a laptop ([26 §26.1](../26-reliability-and-incident-management.md)). Observability is not optional; a system this distributed is not operable without it, which is why the observability stack is a Phase 1 deliverable rather than a later addition ([31 §31.3.1](../31-implementation-roadmap.md)).

The decision is build-and-operate versus buy.

Two factors weighed unusually heavily here:

**Cost at this scale.** A commercial APM platform prices on hosts, containers, custom metrics, log volume and trace spans. For fifteen services across five to seven nodes with the metric cardinality in [24 §24.4](../24-observability.md), quoted and modelled pricing landed between 1,200 and 2,500 a month — comparable to the entire Phase 4 infrastructure bill, and in the Phase 2 case exceeding it.

**Telemetry contains tenant identifiers.** Logs, traces and metrics carry `tenant_id`, service names and request paths. Sending that to a third-party platform outside the configured region raises a residency question that has to be answered for a tenant, for data that is metadata about beneficiary processing even though it contains no personal data itself ([24 §24.3](../24-observability.md)).

## Decision

**Self-host the Grafana stack in-cluster: Prometheus for metrics, Loki for logs, Tempo for traces, Grafana for dashboards, Alertmanager for routing, with OpenTelemetry SDKs for instrumentation.**

| Concern | Component | Retention |
| --- | --- | --- |
| Metrics | Prometheus, remote-written to long-term storage | 15 d local, 13 mo aggregated |
| Logs | Loki, object-storage backed | 30 d hot, 90 d in object storage, audit separately per policy |
| Traces | Tempo, tail-sampled | 7 d |
| Dashboards and alerts | Grafana, Alertmanager | Defined as code in Git |
| Paging | PagerDuty | External, deliberately |
| Error tracking | Sentry | External, deliberately |
| Synthetic probes | Grafana Cloud, external probes only | External, deliberately |

Instrumentation is OpenTelemetry, not a vendor SDK, so the backend is replaceable without touching application code.

Three things are deliberately **not** self-hosted, and the reason is the same for each: they must work when the cluster does not.

| Kept external | Why |
| --- | --- |
| PagerDuty | An alerting path inside the failing cluster is not an alerting path |
| Synthetic monitoring | Probing from inside the thing being probed proves nothing |
| Sentry | Client-side errors originate outside the cluster |

## Alternatives considered

**Datadog.** The best product of the set: excellent correlation between metrics, logs, traces and profiles, strong dashboards, low setup effort, and it would genuinely reduce the platform team's workload. Rejected on cost — the modelled bill rivals total infrastructure spend — and on the residency question for telemetry containing tenant identifiers. If the platform were four times larger, this rejection would deserve revisiting, because at that point the cost ratio changes and the operational saving compounds.

**New Relic or Dynatrace.** Same reasoning. New Relic's data-ingest pricing model was more forgiving at low volume but became less predictable as log volume grew, and predictability matters for an organisation on a fixed budget.

**Google Cloud Operations (Stackdriver).** Attractive: no components to operate, in-region, integrated with GKE. Rejected on two grounds. Log-based metrics and query ergonomics are noticeably weaker than PromQL and LogQL for the kind of investigation the runbooks require — nearly every diagnostic step in [RB-02](../runbooks/rb-02-dlq-drain-and-replay.md), [RB-08](../runbooks/rb-08-scale-event.md) and [RB-16](../runbooks/rb-16-sync-failure.md) is a PromQL or LogQL query. And log ingest pricing at the volumes in [33](../33-cost-model-and-finops.md) was not materially cheaper than self-hosting once retention was accounted for.

**Grafana Cloud, the managed version of the same stack.** The most tempting middle path: identical query languages, identical dashboards, no components to operate. Rejected as the primary backend on cost at our log volume and on the residency question, but **adopted for synthetic monitoring specifically**, where being outside the cluster is the entire point.

**Metrics only, no logs or traces platform.** Rejected: with asynchronous workflows across fifteen services, a trace is frequently the only way to answer "where did this request actually go", and [24 §24.6](../24-observability.md) treats trace continuity across event boundaries as a requirement rather than a nicety.

## Consequences

**Positive.** Cost is roughly 120 a month in storage at Phase 4, against 1,200–2,500 for a commercial platform — the largest single cost avoidance in the architecture. Telemetry stays in-region, so the residency answer is the same for telemetry as for everything else. PromQL and LogQL are directly usable in runbooks, which makes those runbooks executable rather than descriptive. Dashboards and alerts are code in Git, reviewed like code. No cardinality billing surprise, though cardinality still has to be managed for memory reasons. OpenTelemetry instrumentation means the backend is replaceable.

**Negative, and they fall on the five people least able to absorb them.** The observability stack is itself infrastructure to operate: Prometheus memory scales with cardinality and can be knocked over by a badly-labelled metric, Loki needs its object storage configured and its retention enforced, and all of it needs upgrading. There is no vendor support at 3 a.m. Correlation between metrics, logs and traces requires deliberate work — consistent labels, exemplars, trace IDs in log lines — that a commercial platform does automatically, and [24 §24.11.1](../24-observability.md)'s twelve-item onboarding checklist exists because that work has to be done per service. **The stack shares failure domains with what it observes**, which is the sharpest drawback: a cluster-wide problem can take out the dashboards needed to diagnose it. That is why paging and synthetic monitoring are external, and why the offline runbook bundle in [28 §28.5.2](../28-operational-runbooks.md) exists.

**Reassessment trigger.** If the platform team's time on observability maintenance exceeds roughly 5 per cent of capacity, or if tenant count grows enough that the commercial cost ratio inverts, Grafana Cloud is the migration target — the query languages, dashboards and alert definitions all transfer, which was a consideration in choosing this stack over a more idiosyncratic one.
