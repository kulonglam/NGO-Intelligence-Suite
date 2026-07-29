# ADR-0006 — Per-Tenant PostgreSQL Schemas for Payroll Data

| | |
| --- | --- |
| **Status** | Accepted |
| **Date** | 2026-04-24 |
| **Deciders** | Chief Architect, Data Architect, Security Lead |
| **Consulted** | DPO, Platform Lead |
| **Supersedes** | — |
| **Superseded by** | — |
| **Related** | [ADR-0002](0002-hybrid-multi-tenancy-with-rls.md), [29 §29.4](../29-multi-tenancy-and-tenant-lifecycle.md) |

---

## Context

[ADR-0002](0002-hybrid-multi-tenancy-with-rls.md) establishes shared-schema multi-tenancy with row-level security. That is adequate for grants, beneficiaries, field data and most of HR.

Payroll is different in two ways that matter.

**The legitimate audience is the narrowest in the platform.** A grant record is visible to programme staff, finance, and management. A salary is visible to two or three people in an organisation, and the consequences of it being visible to a fourth are immediate and internal: staff relationships, negotiating positions, and in some contexts personal safety.

**The exposure need not be cross-tenant to be serious.** Most of the isolation discussion in this document concerns tenant A seeing tenant B. For payroll, the more likely harm is a defect that widens visibility inside one organisation.

RLS is a policy on a shared table. If a query somehow escapes the policy — an unset session variable combined with a role that bypasses RLS, a maintenance connection, a defect in a dynamically-constructed query — it reaches every tenant's rows. The probability is low; the impact for payroll specifically is high enough to want a second mechanism of a different kind.

## Decision

**Payroll computation output lives in per-tenant schemas: `tenant_<slug>.payroll_runs`, `payroll_records`, `payroll_record_lines`, `payslip_artifacts`.**

Employment records — employees, contracts, departments, positions, leave — remain in the shared RLS-protected `public` schema. The boundary sits between employment data, which HR staff legitimately handle in volume, and computed pay, which does not.

Access is structural rather than policy-based:

- `svc_hr_payroll` is the **only** database role with any grant on any `tenant_<slug>` schema.
- It sets `search_path` per request from validated tenant context: `SET LOCAL search_path = tenant_alpha, public`.
- Every other service role holds no grant on any payroll schema, so a fully-qualified cross-tenant reference fails on privileges, not on a policy evaluation.

Statutory reference data — `tax_bands`, `statutory_contribution_rates` — stays global and read-only to tenants, because a tenant configuring their own tax rates would make statutory correctness unverifiable ([29 §29.6](../29-multi-tenancy-and-tenant-lifecycle.md)).

## Alternatives considered

**Shared schema with RLS, like everything else.** The consistent choice, and it would avoid all the costs below. Rejected because it provides one mechanism where the impact justifies two, and because the two mechanisms fail differently: RLS fails if session context is wrong, grants fail only if the grant model itself is wrong. Defence in depth is only meaningful when the layers are independent.

**A separate database for payroll.** Stronger still. Rejected because payroll needs transactional consistency with employment data during a run — reading contracts, writing records — and splitting the database turns that into a distributed transaction or a materialised copy, both worse.

**A separate service with its own database**, full vertical isolation. Rejected on the same consistency grounds plus the operational cost of a second database to size, back up, verify and fail over.

**Application-layer encryption of salary values only, on shared tables.** Considered seriously, and partially adopted anyway: PII in payroll is encrypted under per-tenant keys like all other PII ([ADR-0015](0015-application-layer-pii-encryption.md)). Rejected as a *substitute* for schema separation because aggregate queries and payslip generation need plaintext in the service, and because encryption protects against a database dump rather than against a query that legitimately decrypts.

## Consequences

**Positive.** Two independent isolation mechanisms on the platform's most sensitive internal data. A query escaping RLS still cannot reach another tenant's payroll. Per-tenant restore of payroll data is simpler — a schema is a natural unit. The grant model makes "which service can read payroll" answerable by inspection rather than by code review.

**Negative, and all of these are real costs paid every release.** Migrations must be applied per schema: the runner iterates active tenants and reports per-schema results, adding roughly 40 seconds per 25 tenants and, more importantly, introducing a partial-failure mode that the shared schema does not have. Cross-tenant payroll analytics is impossible without dynamic SQL, so platform-level payroll reporting is simply not offered. Tenant provisioning and deprovisioning are more complex ([RB-05](../runbooks/rb-05-tenant-onboarding.md), [RB-06](../runbooks/rb-06-tenant-offboarding.md)). Schema count grows with tenants — 120 at Year 3, comfortable for PostgreSQL but not free in catalogue terms. A developer must remember that payroll tables are not in `public`, which is a small but recurring cognitive cost.

**Not extended further.** The same reasoning could argue for per-tenant schemas for beneficiary data, which is at least as sensitive. It was considered and rejected: beneficiary data is queried in far more places by far more services, and the migration and query complexity would spread across most of the platform rather than being contained in one service. Beneficiary data is instead protected by RLS plus per-tenant encryption plus k-anonymity on anything published. The line is drawn at payroll because payroll is one service, four tables, and a narrow query surface — which is exactly what makes the structural approach affordable there and not elsewhere.
