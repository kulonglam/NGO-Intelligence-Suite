# ADR-0004 — Supabase Auth as the Identity Provider

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-16 |
| **Deciders** | Chief Architect, Security Lead |
| **Consulted** | Platform Lead, DPO |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [14](../14-security-architecture.md), [15](../15-rbac-and-authorization.md) |

---

## Context

The platform needs authentication with email and password, MFA, password reset, session management, refresh token rotation, and per-tenant OIDC federation for the larger NGOs that run their own identity provider.

Authentication is the highest-risk component to build badly and the least differentiating to build well. A subtle flaw in token validation, password reset, or session invalidation is a full compromise, and none of it is a feature a tenant will ever choose the platform for.

The database is already Supabase-managed PostgreSQL, and Supabase Auth (GoTrue) is available with it.

## Decision

**Supabase Auth as the identity provider**, issuing JWTs consumed by the API gateway, with authorisation kept entirely in our own domain.

The division is the important part:

| Concern | Owner |
| --- | --- |
| Credential storage, password hashing, reset flows | Supabase Auth |
| MFA enrolment and verification | Supabase Auth |
| Token issuance, refresh rotation, session revocation | Supabase Auth |
| OIDC federation to a tenant's provider | Supabase Auth |
| **Tenant membership and the `tenant_id` claim** | **`tenant-service`, injected into the token as a custom claim** |
| **Roles and permissions** | **`auth-service` in our schema, never in the token** |
| **Every authorisation decision** | **Our services, per request** |

Permissions are resolved per request from our own tables rather than carried in the token. A token carrying a permission set would mean a revoked permission remains valid until the token expires, which is unacceptable for an authorisation change made during an incident.

## Alternatives considered

**Build authentication in-house.** Rejected. It is a multi-month effort to reach parity on the things that matter — timing-safe comparison, correct reset token entropy and expiry, MFA replay protection, refresh rotation with reuse detection — and every one of those is a place where a subtle error is a total compromise. The time is better spent on payroll correctness and offline sync, which nobody else will build for these tenants.

**Auth0 or Okta.** More mature, better enterprise federation, better documentation. Rejected primarily on cost: per-active-user pricing at 1,200 users is on the order of 1,500–2,500 a month, comparable to the entire Phase 2 infrastructure bill, for capability that exceeds what is needed. Secondarily on data residency: user records would sit outside the configured region, which complicates the residency position in [17 §17.10](../17-privacy-and-compliance.md) for no benefit.

**Keycloak, self-hosted.** Full control, no per-user cost, strong federation. Rejected on operational load: another stateful component to run, patch, back up and upgrade, with a JVM runtime nobody else on the team operates. At five platform engineers this is the same argument that rejected self-managed PostgreSQL in [33 §33.6](../33-cost-model-and-finops.md).

**Cloud Identity Platform (Firebase Auth).** Viable and cheap. Rejected because it is a stronger cloud coupling than Supabase Auth for a component we may want to move, and because the tenant-scoped custom claim story is more awkward.

## Consequences

**Positive.** A well-tested implementation of the flows we most want not to write. MFA, reset and refresh rotation available immediately. OIDC federation without building SAML or OIDC client logic. No marginal per-user cost. User records stay in the same region and the same managed platform as the rest of the data.

**Negative.** Token lifetime and default claim shape are partly outside our control, which constrains some session design choices. Supabase Auth becomes a Tier 1 dependency: if it is unavailable, nobody can log in, though existing sessions continue until expiry. Its release cadence and behavioural changes are not ours to schedule. The custom-claim injection for `tenant_id` is a small piece of bespoke integration that has to be tested carefully, because a wrong claim is a tenant isolation failure.

**Exit path, documented deliberately.** Because authorisation is entirely ours and the gateway is the only component that validates tokens, replacing the identity provider means changing token validation in one place and migrating credential records. Nothing in the domain depends on Supabase. The exit is a bounded project rather than a rewrite, and that property is a condition of the decision rather than an afterthought.

**Explicit constraint.** No permission or role ever goes into the token. This is stated here as well as in [15](../15-rbac-and-authorization.md) because it is the decision most likely to be "optimised" later by someone reasonably wanting to avoid a per-request lookup, and doing so would make permission revocation take up to a token lifetime to apply.
