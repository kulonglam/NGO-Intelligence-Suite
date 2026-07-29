# RB-05 — Tenant Provisioning

| | |
| --- | --- |
| **ID** | RB-05 |
| **Applies to** | A signed tenant agreement and a completed onboarding intake |
| **Severity** | Not an incident |
| **Owner** | Support Lead, with the Platform Lead for capacity |
| **Expected duration** | 2–4 hours of platform work, spread over a 2-week onboarding |
| **Last verified** | 2026-06-09, staging |
| **Related** | [29](../29-multi-tenancy-and-tenant-lifecycle.md), [20 §20.4](../20-configuration-secrets-feature-flags.md) |

---

## 1. When this runs

A new tenant organisation has signed, and the intake form is complete. This runbook covers the technical provisioning; the relationship and training work sits alongside it.

## 2. Prerequisites

Provisioning does not begin until all of these exist. Starting without them produces a half-configured tenant that is worse than none.

| Requirement | Why |
| --- | --- |
| Signed agreement including the data processing terms | Legal basis for processing |
| Completed intake: legal name, slug, countries of operation, base currency, fiscal year start, modules required, expected user and beneficiary counts | Configuration inputs |
| Named `org_admin` with a verified email | Someone must own the tenant |
| **Data protection position confirmed**: which optional beneficiary fields they intend to collect, and their justification | Optional Restricted fields require DPO approval before enablement ([17 §17.6.1](../17-privacy-and-compliance.md)) |
| Payroll countries confirmed, with current statutory rates available | Payroll cannot be enabled without an approved rate set |
| Residency requirements confirmed as compatible | A tenant with stricter requirements than we can meet must be told now, not later |
| Capacity check signed off for a tenant above 500 users or 100,000 beneficiaries | [25 §25.7.2](../25-performance-and-capacity.md) |

## 3. Do not

- **Do not enable a Restricted optional field** — national identifier, photograph, precise coordinates — without recorded DPO approval.
- **Do not enable payroll** before statutory rates for their country are entered and approved by two people.
- **Do not copy configuration from another tenant** by cloning rows. Use the defaults template; cloning has repeatedly carried across settings that did not apply.
- **Do not create the tenant's users yourself beyond the first `org_admin`.** They invite their own people, so accountability is theirs.
- **Do not skip the isolation verification step.** It is the point of the whole exercise.

## 4. Procedure

### 4.1 Pre-flight

1. Confirm provisioning is enabled:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/flags/new_tenant_provisioning_enabled" | jq .
```

**Expected:** `enabled: true`. If false, provisioning is deliberately paused — find out why before overriding.

2. Confirm the slug is available, valid, and not confusable with an existing one:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants?slug=<SLUG>" | jq '.data | length'
```

**Expected:** `0`. Slug rules: lowercase, alphanumeric with hyphens, 3–30 characters, immutable once created — it appears in the payroll schema name.

3. Capacity check for a large tenant: compare their projected volumes against current headroom on D-07 and the projections in [25 §25.5](../25-performance-and-capacity.md). Record the assessment.

### 4.2 Create the tenant

4. Create the tenant record:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" -H "Content-Type: application/json" \
  "$API/v1/platform/tenants" -d '{
    "legal_name": "<LEGAL NAME>",
    "display_name": "<DISPLAY NAME>",
    "slug": "<SLUG>",
    "countries": ["SS","UG"],
    "base_currency": "USD",
    "default_locale": "en",
    "enabled_locales": ["en","ar"],
    "timezone": "Africa/Juba",
    "fiscal_year_start_month": 1,
    "status": "provisioning"
  }' | jq .
```

**Expected:** 201 with a `tenant_id`. Record it.

5. Provisioning is then driven by the platform, not by hand. It runs as an orchestrated job:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/platform/tenants/<TENANT_ID>/provision" | jq .

# Watch it.
watch -n 5 "curl -s -H 'Authorization: Bearer $ADMIN_TOKEN' \
  $API/v1/platform/tenants/<TENANT_ID>/provision-status | jq ."
```

The job performs, in order and idempotently:

| # | Step | Result |
| --- | --- | --- |
| 1 | Create the per-tenant KMS key for PII encryption | Key created, versioned, rotation scheduled |
| 2 | Create the `tenant_<SLUG>` schema for payroll | Schema exists, grants applied to `svc_hr_payroll` only |
| 3 | Apply the payroll schema migrations | Tables created with RLS enabled and forced |
| 4 | Insert the default configuration from the template | All settings present at defaults |
| 5 | Create object storage prefixes | Paths created under each bucket |
| 6 | Seed reference data: sectors, districts for their countries, leave types, default form templates | Rows inserted, tenant-scoped |
| 7 | Create the default department and position | So employee creation is possible immediately |
| 8 | Register quota records | Storage, seats, rate tier ([29 §29.5](../29-multi-tenancy-and-tenant-lifecycle.md)) |
| 9 | Emit `tenant.provisioned` | Downstream services initialise their per-tenant state |

**Expected:** status `completed` within 3 minutes. If it fails partway, the job is idempotent — fix the reported cause and re-run it. Do not complete the remaining steps by hand.

### 4.3 Configure

6. Apply their confirmed configuration:

```bash
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  "$API/v1/platform/tenants/<TENANT_ID>/config" -d '{
    "modules": {
      "grants": true, "hr": true, "payroll": true, "lms": true,
      "beneficiaries": true, "field_data": true, "reporting": true,
      "donor_portal": false, "ai_insights": false
    },
    "security": { "mfa_required": "all_users", "session_timeout_minutes": 30 },
    "offline": { "beneficiary_cache_limit": 5000, "offline_ttl_hours": 72 }
  }' | jq .
```

Note two defaults that are deliberate: `donor_portal` and `ai_insights` are **off**. Both are enabled only on an explicit request, the AI module because default-on would be a trust failure ([18 §18.13](../18-ai-llm-architecture.md)).

7. Optional personal data fields, **only with recorded DPO approval**:

```bash
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/config" -d '{
    "data_protection": {
      "collect_national_id": true,
      "collect_photograph": false,
      "collect_precise_coordinates": true,
      "justification": "<TEXT>",
      "dpo_approval_ref": "<APPROVAL_ID>"
    }
  }' | jq .
```

**Expected:** the API rejects the request with `NGOIS-TEN-0022` if `dpo_approval_ref` is absent for a Restricted field. That rejection is the control working.

8. Payroll, if enabled: confirm statutory rates exist and are approved for each country and the current period:

```bash
psql "$DB_URL" -c "
  SELECT country_code, tax_type, count(*) AS bands,
         min(effective_from), max(coalesce(effective_to,'infinity'::date)),
         count(*) FILTER (WHERE approved_at IS NULL) AS unapproved
  FROM tax_bands
  WHERE country_code IN ('SS','UG')
  GROUP BY country_code, tax_type;"
```

**Expected:** a complete band set per country and tax type, with `unapproved = 0`. If not, payroll stays disabled until rates are entered and approved.

### 4.4 First administrator

9. Invite the named `org_admin`:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Idempotency-Key: $(uuidgen)" \
  "$API/v1/auth/invitations" -d '{
    "tenant_id": "<TENANT_ID>",
    "email": "<EMAIL>",
    "role": "org_admin",
    "full_name": "<NAME>"
  }' | jq .
```

**Expected:** 201, and an invitation email delivered. Verify delivery on D-11 rather than assuming it.

10. Confirm they can complete registration, enrol MFA, and log in. Do not proceed until they have.

### 4.5 Verify isolation — the step that matters most

11. Run the isolation canary against the new tenant:

```bash
kubectl -n ngois-platform create job \
  --from=cronjob/isolation-canary isolation-canary-<SLUG>-$(date +%s) \
  --dry-run=client -o yaml | \
  sed "s/CANARY_TENANT_B/<TENANT_ID>/" | kubectl apply -f -
```

12. Verify RLS is enabled and forced on every table in the new payroll schema:

```bash
psql "$DB_URL" -c "
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'tenant_<SLUG>' AND c.relkind = 'r';"
```

**Expected:** every row `t | t`. **Any `f` blocks go-live** and is escalated to the Data Architect.

13. Verify no other service role has access to the payroll schema:

```bash
psql "$DB_URL" -c "
  SELECT grantee, privilege_type, table_name
  FROM information_schema.role_table_grants
  WHERE table_schema = 'tenant_<SLUG>'
  ORDER BY grantee;"
```

**Expected:** `svc_hr_payroll` only.

14. Manual cross-tenant probe: using a token from an existing test tenant, attempt to read the new tenant's data by ID.

**Expected:** 404, not 403 ([10 §10.5](../10-api-design-standards.md)).

### 4.6 Activate

15. Set the tenant active:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/activate" | jq .
```

16. Create their tenant health dashboard instance (D-14) and confirm it renders.
17. Add them to the tenant register, the sub-processor notification list, and the support rota.
18. Record their donor reporting deadlines, so the deployment calendar can avoid them ([22 §22.9.1](../22-cicd-release-supply-chain.md)).

## 5. Verification

| # | Check | Expected |
| --- | --- | --- |
| 19 | Tenant status | `active` |
| 20 | Provisioning job | `completed`, all 9 steps |
| 21 | KMS key | Exists, rotation scheduled |
| 22 | Payroll schema | Present, RLS enabled and forced on every table |
| 23 | Configuration | Matches the intake exactly |
| 24 | Reference data | Seeded for their countries |
| 25 | `org_admin` | Registered, MFA enrolled, logged in successfully |
| 26 | Isolation canary | Passes |
| 27 | Cross-tenant probe | 404 |
| 28 | Quotas | Registered |
| 29 | Dashboard D-14 | Renders with their data |
| 30 | An end-to-end smoke test as their admin | Create a grant, create an employee, capture a submission — all succeed |

## 6. Rollback

If provisioning must be abandoned before activation, run the deprovision job, which reverses the nine steps in order. It only operates on a tenant in `provisioning` status — a tenant that has been active and holds real data must go through [RB-06](rb-06-tenant-offboarding.md) instead.

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/deprovision" \
  -d '{"reason":"abandoned onboarding, <REASON>"}' | jq .
```

## 7. Escalation

| Condition | Escalate to |
| --- | --- |
| RLS not enabled on any new table | Data Architect, blocking |
| Isolation canary or cross-tenant probe fails | Security Lead, blocking, treat as SEV-1 |
| A Restricted field requested without DPO approval | DPO; do not enable |
| Statutory rates unavailable for a payroll country | Platform Lead; payroll stays off |
| Capacity headroom insufficient | Platform Lead before activation |
| Residency requirement we cannot meet | Executive Director and DPO before signing, not after |

## 8. Follow-up

- Two-week check-in on adoption and any configuration adjustments.
- Add their volumes to the capacity model at the next monthly review.
- If any step required manual intervention outside the provisioning job, that is an automation gap — raise it. Tenant provisioning should be a single job, and every manual step is a future inconsistency.
