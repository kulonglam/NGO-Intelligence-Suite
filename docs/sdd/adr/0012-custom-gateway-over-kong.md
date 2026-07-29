# ADR-0012 — A Custom Express API Gateway rather than Kong

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-26 |
| **Deciders** | Chief Architect, Platform Lead, Security Lead |
| **Consulted** | — |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [06 §6.3](../06-microservice-design.md), [10](../10-api-design-standards.md) |

---

## Context

Version 1.0 specified "Kong or a custom Node.js gateway", deferring the decision. It has to be made, because the gateway is the single most security-critical component in the request path.

What the gateway must do:

| Responsibility | Note |
| --- | --- |
| Terminate TLS and validate the JWT | Standard |
| **Resolve the tenant from the token and inject `X-Tenant-ID` internally** | The foundation of the isolation model |
| **Strip any client-supplied `X-Tenant-ID` or `X-User-ID` header** | A client that could set these could impersonate a tenant. Non-negotiable |
| Resolve permissions and inject the resolved user context | From our own tables, cached 60 s ([ADR-0004](0004-supabase-auth-as-identity-provider.md)) |
| Rate limit per tenant and per user by tier | [29 §29.5](../29-multi-tenancy-and-tenant-lifecycle.md) |
| Route by path and API version | [ADR-0009](0009-uri-path-api-versioning.md) |
| Enforce the response envelope and error taxonomy | [10](../10-api-design-standards.md) |
| Propagate trace context and correlation IDs | [24 §24.6](../24-observability.md) |
| Emit per-tenant request metrics | |

Nearly all of that is bespoke logic tied to this platform's tenancy model.

## Decision

**A custom gateway on Express and TypeScript, deployed as a normal service** in the same pipeline, from the same template, with the same observability as everything else.

Load balancing, TLS termination at the edge, and WAF are Google Cloud Load Balancing and Cloud Armor, not the gateway. The gateway is application-layer concerns only.

The header-stripping control is implemented as the **first** middleware, before any parsing, and has a dedicated test asserting that a client-supplied `X-Tenant-ID` is removed rather than trusted. That test is part of the tenant isolation suite and cannot be skipped ([23 §23.9](../23-testing-strategy.md)).

## Alternatives considered

**Kong.** The mature choice, with rate limiting, authentication, logging and observability plugins available immediately, plus a large plugin ecosystem. Rejected after working through what would actually be configuration and what would be code. Tenant resolution with a custom claim, permission resolution against our tables with our caching semantics, the header-stripping control, the response envelope, and per-tenant tiered rate limiting are all bespoke — they would live in a Lua or Go plugin we write and maintain anyway. That leaves us maintaining custom plugin code inside a component whose failure modes, upgrade path and configuration model are a second operational discipline, in exchange for rate limiting and logging that Express middleware provides in a few hundred lines. One fewer runtime is worth more than the plugin ecosystem at this scale.

**Envoy, with or without a control plane.** Excellent proxy, better performance, and the right answer at much larger scale. Rejected on the same reasoning plus a steeper configuration model; the bespoke logic would become an external authorisation service, which is an extra network hop on every request for the platform's most latency-sensitive path.

**A service mesh with an ingress gateway** — Istio or Linkerd. Rejected for the same reasons the mesh itself is on Hold ([35 §35.10](../35-engineering-standards.md)): substantial operational surface for a five-person platform capability, and mTLS is achievable without one.

**No gateway; each service handles its own auth and rate limiting.** Rejected emphatically. It would mean the header-stripping control, tenant resolution and rate limiting are implemented fifteen times, and the isolation model would depend on all fifteen being right. Centralising it means one place to review, one place to test, and one place to fix.

**Cloud Endpoints or API Gateway (managed).** Rejected: strong cloud coupling on the most critical request path, and the custom tenant and permission logic does not fit the model.

## Consequences

**Positive.** The tenancy-critical logic is in code the team reads fluently, in the language everything else is written in, tested with the same tools. One runtime to patch and profile. Deployment, observability and on-call knowledge are identical to any other service. The header-stripping control is a few lines that a reviewer can verify by eye, which for a control of that consequence is worth a great deal. No plugin ecosystem to track for compatibility across upgrades.

**Negative.** Rate limiting, request validation and circuit breaking are ours to implement and maintain — roughly 2,000 lines that Kong would have provided as configuration. Node's throughput per instance is lower than Envoy's, mitigated by horizontal scaling and, per the capacity model, not a constraint at this volume. **The gateway is a single point of failure for the entire platform**: it runs a minimum of three replicas across zones with a pod disruption budget, and it is the only service whose unavailability is automatically SEV-1 ([RB-13](../runbooks/rb-13-service-down.md)). Being ours also means no vendor to blame and no upstream fix to wait for, which cuts both ways.

**Reassessment trigger.** If gateway throughput becomes a genuine bottleneck, or if the number of edge concerns grows substantially — request transformation, multiple auth schemes, partner-specific policies — Envoy with an external authorisation service becomes the better answer. Nothing in the design prevents that: the bespoke logic is already a separable concern, and moving it behind an ext_authz interface is a bounded change.
