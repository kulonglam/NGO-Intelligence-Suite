# Appendix C — RBAC Permission Matrix

> **Document:** NGO Intelligence Suite — SDD v2.0
> **Owner:** Security Lead
> **Status:** Approved
> **Last Reviewed:** 2026-06-20
> **Source of truth:** the `role_permissions` table. **This appendix and that table are generated from the same definition**, and the generated authorisation test suite asserts they agree ([23 §23.6](../23-testing-strategy.md)). A discrepancy fails the build.

---

## C.1 Reading the matrix

| Symbol | Meaning |
| --- | --- |
| **✓** | Granted unconditionally within the role's record scope |
| **S** | Granted, but restricted to the role's **scope** — assigned programmes, listed grants, own department ([15 §15.3](../15-rbac-and-authorization.md)) |
| **O** | Granted for the actor's **own** records only |
| **†** | Granted, but **cannot be the approver of a record they prepared** (maker-checker) |
| **‡** | Granted, but every use is **audited and alerted**, and requires break-glass |
| **P** | Granted, and every read is **purpose-logged** ([17 §17.6](../17-privacy-and-compliance.md)) |
| — | Not granted. A request returns 403 naming the required permission |

### C.1.1 Roles

| Code | Role | Scope |
| --- | --- | --- |
| **SA** | `super_admin` | Platform operator, cross-tenant. **Not a tenant role.** No standing access; break-glass only ([15 §15.6](../15-rbac-and-authorization.md)) |
| **OA** | `org_admin` | Own tenant, all records |
| **FM** | `finance_manager` | Own tenant; optionally restricted to specified grants or cost centres |
| **HM** | `hr_manager` | Own tenant; optionally restricted to specified departments |
| **ME** | `m_e_officer` | Own tenant; optionally restricted to specified programmes and locations |
| **FO** | `field_officer` | **Assigned programmes and locations only**, enforced in the query rather than by filtering results |
| **DV** | `donor_viewer` | **Explicitly listed grants only**, and only donor-visible fields |
| **AU** | `auditor` | Own tenant, read-only, all records, plus the audit log |

### C.1.2 Permission naming

`resource:sub_resource:action`, for example `grant:disbursement:approve`. Actions are drawn from a closed set: `create`, `read`, `update`, `delete`, `list`, `approve`, `reject`, `submit`, `export`, `admin`.

There is **no role inheritance**. Every grant is explicit, because an inheritance chain makes "who can do this" a question requiring traversal rather than a lookup, and the answer must be obvious during an incident.

---

## C.2 Identity and access

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `identity:user:create` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:user:read` | ‡ | ✓ | ✓ | ✓ | ✓ | O | O | ✓ |
| `identity:user:update` | ‡ | ✓ | — | — | — | O | O | — |
| `identity:user:suspend` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:user:delete` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:user:list` | ‡ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `identity:user:invite` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:role:assign` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:role:revoke` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:role:read` | ✓ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `identity:session:list` | ‡ | ✓ | — | — | — | O | O | ✓ |
| `identity:session:revoke` | ‡ | ✓ | — | — | — | O | O | — |
| `identity:mfa:enroll` | ✓ | O | O | O | O | O | O | O |
| `identity:mfa:reset` | ‡ | ✓ | — | — | — | — | — | — |
| `identity:breakglass:request` | ✓ | — | — | — | — | — | — | — |
| `identity:breakglass:approve` | ‡ | — | — | — | — | — | — | — |

**Note on `identity:role:assign`.** Only `org_admin` may assign roles, and an `org_admin` cannot grant themselves `super_admin`, which is not a tenant role and cannot be assigned from within a tenant at all.

---

## C.3 Tenant administration

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `tenant:settings:read` | ‡ | ✓ | ✓ | ✓ | ✓ | — | — | ✓ |
| `tenant:settings:update` | ‡ | ✓ | — | — | — | — | — | — |
| `tenant:module:enable` | ‡ | ✓ | — | — | — | — | — | — |
| `tenant:security:update` | ‡ | ✓ | — | — | — | — | — | — |
| `tenant:pii_field:enable` | ‡ | **DPO** | — | — | — | — | — | — |
| `tenant:retention:update` | ‡ | ✓ | — | — | — | — | — | — |
| `tenant:export:request` | ‡ | ✓ | — | — | — | — | — | — |
| `tenant:quota:read` | ✓ | ✓ | ✓ | — | — | — | — | ✓ |
| `tenant:provision` | ‡ | — | — | — | — | — | — | — |
| `tenant:suspend` | ‡ | — | — | — | — | — | — | — |
| `tenant:offboard` | ‡ | — | — | — | — | — | — | — |
| `tenant:flag:read` | ✓ | ✓ | — | — | — | — | — | ✓ |
| `tenant:flag:update` | ‡ | — | — | — | — | — | — | — |

**`tenant:pii_field:enable` is marked DPO rather than ✓.** An `org_admin` may request it; it does not take effect without a recorded DPO approval ([17 §17.6.1](../17-privacy-and-compliance.md)). It is the only permission in the matrix requiring an approval from outside the tenant.

---

## C.4 Grants and finance

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `grant:donor:create` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:donor:read` | — | ✓ | ✓ | — | ✓ | — | — | ✓ |
| `grant:donor:update` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:donor:delete` | — | ✓ | — | — | — | — | — | — |
| `grant:award:create` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:award:read` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:award:update` | — | ✓ | S | — | — | — | — | — |
| `grant:award:delete` | — | ✓ | — | — | — | — | — | — |
| `grant:award:list` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:award:close` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:budget:create` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:budget:read` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:budget:update` | — | ✓ | S | — | — | — | — | — |
| `grant:budget:approve` | — | ✓† | ✓† | — | — | — | — | — |
| `grant:disbursement:create` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:disbursement:read` | — | ✓ | S | — | — | — | S | ✓ |
| `grant:disbursement:update` | — | ✓ | S | — | — | — | — | — |
| `grant:disbursement:submit` | — | ✓ | ✓ | — | — | — | — | — |
| **`grant:disbursement:approve`** | — | **✓†** | **✓†** | — | — | — | — | — |
| `grant:disbursement:reverse` | — | ✓† | ✓† | — | — | — | — | — |
| `grant:expenditure:create` | — | ✓ | ✓ | — | S | — | — | — |
| `grant:expenditure:read` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:expenditure:update` | — | ✓ | S | — | — | — | — | — |
| `grant:report:create` | — | ✓ | ✓ | — | ✓ | — | — | — |
| `grant:report:read` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:report:update` | — | ✓ | S | — | S | — | — | — |
| `grant:report:submit` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:report:export` | — | ✓ | S | — | S | — | S | ✓ |
| `grant:activity:create` | — | ✓ | ✓ | — | ✓ | — | — | — |
| `grant:activity:read` | — | ✓ | S | — | S | S | S | ✓ |
| `grant:compliance:read` | — | ✓ | ✓ | — | ✓ | — | S | ✓ |
| `grant:iati:configure` | — | ✓ | ✓ | — | — | — | — | — |
| `grant:iati:publish` | — | ✓ | ✓ | — | — | — | — | — |
| `finance:fx_rate:read` | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| `finance:fx_rate:override` | — | ✓ | ✓ | — | — | — | — | — |

**The maker-checker rule.** `grant:disbursement:approve` carries † for every role that holds it, and the constraint is enforced by `CHECK (approved_by <> prepared_by)` in the database, not by application logic ([Appendix B §B.3](b-data-dictionary.md)). A tenant with only one person holding the permission genuinely cannot approve a disbursement, which is the intended outcome rather than a usability defect.

**`finance:fx_rate:override`** exists because an FX source outage would otherwise block financial work. Every override is audited and the resulting figures are marked as using a manual rate ([RB-15 §5.5](../runbooks/rb-15-integration-failure.md)).

---

## C.5 HR

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hr:employee:create` | — | ✓ | — | ✓ | — | — | — | — |
| `hr:employee:read` | — | ✓ | — | S | — | — | — | ✓ |
| **`hr:employee:read_pii`** | — | **✓P** | — | **SP** | — | — | — | **✓P** |
| `hr:employee:update` | — | ✓ | — | S | — | — | — | — |
| `hr:employee:terminate` | — | ✓ | — | ✓ | — | — | — | — |
| `hr:employee:list` | — | ✓ | — | S | — | — | — | ✓ |
| `hr:employee:export` | — | ✓P | — | SP | — | — | — | ✓P |
| `hr:contract:create` | — | ✓ | — | ✓ | — | — | — | — |
| **`hr:contract:read_salary`** | — | **✓P** | **✓P** | **SP** | — | — | — | **✓P** |
| `hr:contract:update` | — | ✓ | — | S | — | — | — | — |
| `hr:department:admin` | — | ✓ | — | ✓ | — | — | — | — |
| `hr:position:admin` | — | ✓ | — | ✓ | — | — | — | — |
| `hr:leave:request` | — | O | O | O | O | O | — | — |
| `hr:leave:read` | — | ✓ | — | S | — | O | — | ✓ |
| `hr:leave:approve` | — | ✓ | — | S† | — | — | — | — |
| `hr:leave:balance:adjust` | — | ✓ | — | ✓ | — | — | — | — |

**`hr:employee:read_pii` is a separate permission from `hr:employee:read`.** Reading a list of employees by number and department does not require decrypting names. This separation is why the purpose-logging volume is manageable: routine HR work does not touch restricted fields.

`finance_manager` holds `hr:contract:read_salary` but **not** `hr:employee:read` — they can see salary figures for payroll approval without access to the wider employee record. That asymmetry is deliberate.

---

## C.6 Payroll

The most tightly held permissions in the platform.

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `payroll:run:create` | — | — | — | ✓ | — | — | — | — |
| `payroll:run:calculate` | — | — | — | ✓ | — | — | — | — |
| `payroll:run:read` | — | ✓P | ✓P | ✓P | — | — | — | ✓P |
| `payroll:run:update` | — | — | — | ✓ | — | — | — | — |
| `payroll:run:submit` | — | — | — | ✓ | — | — | — | — |
| **`payroll:run:approve`** | — | — | **✓†** | — | — | — | — | — |
| `payroll:run:reject` | — | — | ✓ | — | — | — | — | — |
| `payroll:run:reverse` | — | — | ✓† | — | — | — | — | — |
| `payroll:record:read` | — | ✓P | ✓P | ✓P | — | — | — | ✓P |
| `payroll:record:read_own` | — | O | O | O | O | O | — | — |
| `payroll:payslip:generate` | — | — | — | ✓ | — | — | — | — |
| `payroll:payslip:read_own` | — | O | O | O | O | O | — | — |
| `payroll:export:bank_file` | — | — | ✓ | — | — | — | — | — |
| `payroll:statutory_rules:read` | — | ✓ | ✓ | ✓ | — | — | — | ✓ |
| **`payroll:statutory_rules:update`** | **‡** | — | — | — | — | — | — | — |
| `payroll:cost_allocation:read` | — | ✓ | ✓ | ✓ | — | — | — | ✓ |

**`payroll:statutory_rules:update` is a platform permission, held by no tenant role.** Tax bands and contribution rates are global reference data with statutory citations, and a tenant editing its own tax table would be both a correctness and a legal problem ([29 §29.6](../29-multi-tenancy-and-tenant-lifecycle.md)). It requires break-glass plus dual authorisation, and a preview of the effect on the next run before commit.

**The separation of duties is structural.** `hr_manager` prepares and submits but **cannot approve**. `finance_manager` approves but **cannot prepare**. No role holds both `payroll:run:submit` and `payroll:run:approve`, and `org_admin` — who can do almost everything else — holds neither. That is the one place in the matrix where `org_admin` is deliberately weaker than a specialist role, and it exists so that no single account can run payroll end to end.

`payroll:record:read_own` and `payroll:payslip:read_own` let any employee see their own pay without any wider permission.

---

## C.7 Beneficiaries and programmes

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `beneficiary:record:create` | — | ✓ | — | — | ✓ | S | — | — |
| `beneficiary:record:read` | — | ✓ | — | — | S | S | — | ✓ |
| **`beneficiary:record:read_pii`** | — | **✓P** | — | — | **SP** | **SP** | — | **✓P** |
| **`beneficiary:location:read_precise`** | — | **✓P** | — | — | — | **SP** | — | **✓P** |
| `beneficiary:record:update` | — | ✓ | — | — | S | S | — | — |
| `beneficiary:record:delete` | — | ✓ | — | — | — | — | — | — |
| `beneficiary:record:list` | — | ✓ | — | — | S | S | — | ✓ |
| **`beneficiary:record:export`** | — | **✓P** | — | — | **SP** | — | — | **✓P** |
| `beneficiary:household:read` | — | ✓ | — | — | S | S | — | ✓ |
| `beneficiary:household:update` | — | ✓ | — | — | S | S | — | — |
| `beneficiary:vulnerability:read` | — | ✓P | — | — | SP | SP | — | ✓P |
| `beneficiary:vulnerability:assess` | — | ✓ | — | — | ✓ | S | — | — |
| `beneficiary:duplicate:review` | — | ✓ | — | — | ✓ | — | — | — |
| **`beneficiary:duplicate:merge`** | — | ✓ | — | — | ✓ | — | — | — |
| `beneficiary:consent:record` | — | ✓ | — | — | ✓ | S | — | — |
| `beneficiary:consent:read` | — | ✓ | — | — | S | S | — | ✓ |
| **`beneficiary:erasure:request`** | — | ✓ | — | — | ✓ | S | — | — |
| **`beneficiary:erasure:approve`** | — | **DPO** | — | — | — | — | — | — |
| `programme:record:admin` | — | ✓ | — | — | ✓ | — | — | — |
| `programme:record:read` | — | ✓ | S | — | S | S | S | ✓ |
| `programme:enrollment:create` | — | ✓ | — | — | ✓ | S | — | — |
| `programme:enrollment:read` | — | ✓ | — | — | S | S | — | ✓ |
| `programme:enrollment:exit` | — | ✓ | — | — | ✓ | — | — | — |
| `programme:attendance:record` | — | ✓ | — | — | ✓ | S | — | — |
| `programme:attendance:read` | — | ✓ | S | — | S | S | S | ✓ |

**`beneficiary:location:read_precise` is separate from `beneficiary:record:read_pii`, and is withheld from `m_e_officer`.** An M&E officer analysing programme coverage needs the administrative area, not the coordinates of a dwelling. A field officer navigating to a household needs the coordinates. Precise location is the single field most capable of causing physical harm ([Appendix B §B.9.1](b-data-dictionary.md)), so it is gated separately from the rest of the personal data and every read is purpose-logged.

**`beneficiary:record:export` is not granted to `field_officer`.** An officer needs to register and update people in their assigned locations; they do not need a downloadable list. Bulk beneficiary data leaving the platform is the highest-value target in it, and restricting export to two roles with purpose logging is the control ([32](../32-risk-register.md) R-13).

**`beneficiary:duplicate:merge` requires review, never automation.** Merging can erase a person's entitlement, and two records with the same name may be two people ([13 §13.6](../13-offline-first-architecture.md)).

**`beneficiary:erasure:approve` is DPO-gated**, and the approver must complete step-up MFA and acknowledge the specific consequences ([RB-07 §5.3](../runbooks/rb-07-pii-erasure-request.md)).

---

## C.8 Field data

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `field:form:create` | — | ✓ | — | — | ✓ | — | — | — |
| `field:form:read` | — | ✓ | — | — | ✓ | S | — | ✓ |
| `field:form:publish` | — | ✓ | — | — | ✓ | — | — | — |
| `field:form:assign` | — | ✓ | — | — | ✓ | — | — | — |
| `field:submission:create` | — | ✓ | — | — | ✓ | S | — | — |
| `field:submission:read` | — | ✓ | — | — | S | O | — | ✓ |
| **`field:submission:read_pii`** | — | **✓P** | — | — | **SP** | **OP** | — | **✓P** |
| `field:submission:update` | — | ✓ | — | — | S | — | — | — |
| `field:submission:review` | — | ✓ | — | — | ✓ | — | — | — |
| `field:submission:reject` | — | ✓ | — | — | ✓ | — | — | — |
| `field:submission:export` | — | ✓P | — | — | SP | — | — | ✓P |
| `field:conflict:resolve` | — | ✓ | — | — | ✓ | — | — | — |
| `field:device:register` | — | ✓ | — | — | ✓ | O | — | — |
| `field:device:read` | — | ✓ | — | — | ✓ | O | — | ✓ |
| `field:device:revoke` | — | ✓ | — | — | ✓ | — | — | — |
| `field:device:wipe` | — | ✓ | — | — | ✓ | — | — | — |
| `field:sync:read_status` | — | ✓ | — | — | ✓ | O | — | ✓ |

**`field:submission:read_pii` covers the values of fields flagged `contains_personal_data`.** Reading a submission's metadata and its non-personal answers does not require it; a redacted marker appears in place of the value ([15 §15.4](../15-rbac-and-authorization.md)). The same split as elsewhere, for the same reason: routine review work should not generate purpose-log entries.

**`field:submission:read` is `O` for `field_officer`** — own submissions only. An officer does not need to read colleagues' submissions, and in some contexts should not.

**`field:conflict:resolve` sits with the tenant, never with us.** No platform role appears in this row, including `super_admin` ([ADR-0005](../adr/0005-offline-conflict-resolution-policy.md)).

---

## C.9 Learning

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `lms:course:create` | — | ✓ | — | ✓ | — | — | — | — |
| `lms:course:read` | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `lms:course:publish` | — | ✓ | — | ✓ | — | — | — | — |
| `lms:course:delete` | — | ✓ | — | — | — | — | — | — |
| `lms:enrollment:create` | — | ✓ | — | ✓ | — | — | — | — |
| `lms:enrollment:read` | — | ✓ | — | S | — | O | — | ✓ |
| `lms:enrollment:read_own` | — | O | O | O | O | O | — | — |
| `lms:progress:record_own` | — | O | O | O | O | O | — | — |
| `lms:assessment:attempt` | — | O | O | O | O | O | — | — |
| `lms:assessment:admin` | — | ✓ | — | ✓ | — | — | — | — |
| `lms:certificate:read` | — | ✓ | — | S | — | O | — | ✓ |
| `lms:certificate:issue` | — | ✓ | — | ✓ | — | — | — | — |
| `lms:compliance:read` | — | ✓ | — | ✓ | — | — | — | ✓ |
| `lms:mandatory_rule:admin` | — | ✓ | — | ✓ | — | — | — | — |

---

## C.10 Reporting, files, AI and audit

| Permission | SA | OA | FM | HM | ME | FO | DV | AU |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `reporting:report:generate` | — | ✓ | ✓ | ✓ | ✓ | — | S | ✓ |
| `reporting:report:read` | — | ✓ | S | S | S | — | S | ✓ |
| `reporting:report:export` | — | ✓ | S | S | S | — | S | ✓ |
| `reporting:dashboard:read` | — | ✓ | S | S | S | S | S | ✓ |
| `reporting:definition:admin` | — | ✓ | — | — | ✓ | — | — | — |
| `file:object:upload` | — | ✓ | ✓ | ✓ | ✓ | ✓ | — | — |
| `file:object:read` | — | ✓ | S | S | S | O | S | ✓ |
| `file:object:delete` | — | ✓ | S | S | S | — | — | — |
| `ai:insight:request` | — | ✓ | ✓ | — | ✓ | — | — | — |
| `ai:insight:read` | — | ✓ | ✓ | — | ✓ | — | — | ✓ |
| **`ai:prompt:read`** | ‡ | ✓ | — | — | — | — | — | ✓ |
| **`ai:insight:approve`** | — | ✓ | ✓ | — | ✓ | — | — | — |
| `ai:budget:read` | — | ✓ | ✓ | — | — | — | — | ✓ |
| `ai:module:disable` | — | ✓ | — | — | — | — | — | — |
| `audit:log:read` | ‡ | ✓ | — | — | — | — | — | ✓ |
| **`audit:log:read_pii_values`** | ‡ | **✓P** | — | — | — | — | — | **✓P** |
| `audit:log:export` | ‡ | ✓P | — | — | — | — | — | ✓P |
| `audit:purpose_log:read` | ‡ | ✓ | — | — | — | — | — | ✓ |
| `audit:integrity:verify` | ✓ | ✓ | — | — | — | — | — | ✓ |

**`ai:prompt:read` exposes the stored prompt**, which is the record of exactly what was sent to a third-party provider. It is held narrowly because it is the evidence used to investigate a suspected redaction failure ([18 §18.5](../18-ai-llm-architecture.md)), and it is the one AI permission a platform operator can obtain under break-glass.

**`ai:insight:approve` is the human-in-the-loop gate.** The approving user is recorded on the generation record, and without it the output remains a draft indefinitely ([ADR-0010](../adr/0010-llm-provider-and-boundaries.md)).

**`audit:log:read_pii_values` is separate from `audit:log:read`** because a `before_value` or `after_value` may contain restricted data. Reading that the record changed is different from reading what it changed from.

**No role can modify the audit log.** There is no `audit:log:update` or `audit:log:delete` permission in the catalogue at all — not withheld from roles, but non-existent, because the writing database role holds no `UPDATE` or `DELETE` grant ([14 §14.7](../14-security-architecture.md)).

---

## C.11 Properties that hold across the whole matrix

Assertions made by the generated test suite. Each is a test that fails the build.

| # | Invariant |
| --- | --- |
| 1 | Every endpoint maps to exactly one permission in this catalogue. An unmapped endpoint fails the build |
| 2 | Every permission is held by at least one role. An orphan permission is dead code |
| 3 | **No role holds both `payroll:run:submit` and `payroll:run:approve`** |
| 4 | **No role can approve a disbursement or payroll run it prepared**, enforced by database constraint |
| 5 | `super_admin` holds no tenant domain data permission — it cannot read a beneficiary, a salary or a grant |
| 6 | Every `‡` permission requires an active break-glass grant, and use emits `identity.breakglass.granted` plus an alert |
| 7 | Every `P` permission writes a purpose-logged audit entry, and a read without a purpose is rejected |
| 8 | `field_officer` cannot read any record outside their assignment, verified by attempting it |
| 9 | `donor_viewer` cannot read any record outside their grant allow-list, nor any non-donor-visible field |
| 10 | `auditor` holds no write permission anywhere in the catalogue |
| 11 | No permission grants cross-tenant access other than the `‡` platform permissions |
| 12 | A permission revocation takes effect within 60 seconds, bounded by the permission cache TTL, and immediately on session revocation |

### C.11.1 Why `super_admin` cannot read tenant data

Invariant 5 is the one most likely to surprise. A platform operator can provision a tenant, suspend it, read its quota usage and read its audit log — but cannot read a beneficiary record, a salary or a grant.

That is not a claim that platform staff can never see tenant data; a database break-glass session obviously can, and [32](../32-risk-register.md) R-07 scores insider misuse at 12 precisely because technical controls cannot fully prevent it. What invariant 5 buys is that **there is no ordinary application path to it.** Access requires break-glass with a recorded justification and session recording, which makes it visible and reviewable rather than routine.
