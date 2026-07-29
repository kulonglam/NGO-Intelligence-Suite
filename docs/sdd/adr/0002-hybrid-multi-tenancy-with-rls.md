# ADR-0002 — Hybrid Multi-Tenancy: Shared Schema with Row-Level Security

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-10 |
| **Deciders** | Chief Architect, Data Architect, Security Lead |
| **Consulted** | DPO, Platform Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [29](../29-multi-tenancy-and-tenant-lifecycle.md), [ADR-0006](0006-per-tenant-schema-for-payroll.md), [ADR-0015](0015-application-layer-pii-encryption.md) |

---

## Context

The platform serves NGOs operating in conflict and post-conflict settings. Its data includes beneficiary records — names, locations, household composition, vulnerability assessments — for people who may be at risk from parties who would like to know where they are.

That makes cross-tenant exposure the platform's defining risk. It is the only failure mode in [32](../32-risk-register.md) whose impact is scored 5, reserved for outcomes that cannot be compensated. An outage ends; a leaked beneficiary list does not.

Against that, the operating constraint: five platform engineers, a target of 120 tenants by Year 3, and a cost-per-tenant ceiling set by what an NGO can justify spending instead of programme delivery ([33 §33.4.1](../33-cost-model-and-finops.md)).

## Decision

**A shared PostgreSQL schema with row-level security as the primary isolation mechanism, with per-tenant schemas for payroll ([ADR-0006](0006-per-tenant-schema-for-payroll.md)).**

Every tenant-owned table carries a `tenant_id` and a policy:

```sql
ALTER TABLE beneficiaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE beneficiaries FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON beneficiaries
    USING      (tenant_id = current_setting('app.current_tenant', true)::uuid)
    WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid);
```

Four properties of this form were chosen deliberately:

**`FORCE`**, so the policy applies to the table owner too — the connection most likely to be used carelessly during maintenance.

**`current_setting(..., true)`**, so an unset context yields `NULL`, and `tenant_id = NULL` returns zero rows. The failure mode is fail-closed: a query that returns nothing is a visible bug, a query that returns everything is a breach.

**A session variable rather than a JWT claim read inside the policy.** v1.0 proposed `USING (tenant_id = auth.jwt() -> 'tenant_id')`, which does not type-check and additionally couples the database to a token shape, making the policy untestable without a token.

**`SET LOCAL` only**, never session-scoped `SET`, because a pooled connection carrying residual context is the single most dangerous defect available in this architecture ([29 §29.3.3](../29-multi-tenancy-and-tenant-lifecycle.md)).

RLS is one of six layers, not the whole answer: token claim, gateway-injected context, RLS, `NOBYPASSRLS` roles, tenant-prefixed cache and storage keys, and per-tenant encryption keys as the final barrier.

## Alternatives considered

**Database per tenant.** The strongest isolation available and the one a purely security-driven analysis would choose. Rejected on operability: 120 databases at Year 3 means 120 migration targets, 120 backup verification jobs, 120 connection pools, and a per-tenant cost floor that breaks the pricing model. With five platform engineers, the realistic outcome is that some databases fall behind on migrations or go unverified on backups — which is a worse security position than correctly-implemented RLS, not a better one.

**Schema per tenant for everything.** Same migration multiplication. Additionally, cross-tenant platform queries — the tenant register, quota reporting, the isolation canary — would require dynamic SQL over a schema list, which is itself an injection surface. Adopted only for payroll, where the narrow audience justifies the cost.

**Application-only filtering, no RLS.** Rejected outright. It means every query in the codebase is a potential breach, forever, and a single omission in a reporting query is a leak. The database should enforce the invariant that matters most.

**RLS with the tenant read from a JWT claim inside the policy**, as v1.0 proposed. Rejected: type-incorrect as written, untestable without minting tokens, and it puts token parsing in the database.

## Consequences

**Positive.** One migration path, one backup, one pool, one set of monitoring. Cost per tenant that makes the platform viable ([33](../33-cost-model-and-finops.md)). Isolation enforced by the database rather than by developer diligence. Platform-level queries remain straightforward. Testing isolation is tractable, because the invariant is expressible as a query.

**Negative.** RLS adds a predicate to every query, with a measurable but modest planning and execution cost; the indexes in [09](../09-data-management-strategy.md) are all `tenant_id`-leading in consequence. A per-tenant point-in-time restore is harder than dropping a database — the procedure restores to a clone and repairs the target tenant ([RB-11](../runbooks/rb-11-backup-restore-drill.md)). One tenant's load can affect another, addressed by quotas and fair scheduling ([29 §29.5](../29-multi-tenancy-and-tenant-lifecycle.md)). Most importantly, **the entire model rests on tenant context being set correctly on every connection**, which is why four independent controls exist for that one defect class and why a production canary runs every fifteen minutes.

**What would change this decision.** A tenant with a contractual or regulatory requirement for physical database separation, or a tenant large enough that their load justifies dedicated infrastructure. The architecture accommodates both as a special case without changing the default, because nothing in the data model depends on tenants sharing a database.
