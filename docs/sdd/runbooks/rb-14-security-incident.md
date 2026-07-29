# RB-14 — Security Incident and Suspected Data Exposure

| | |
| --- | --- |
| **ID** | RB-14 |
| **Applies to** | `CrossTenantAccessDetected`, `PIIRedactionFailure`, `AuditChainBroken`, `AuthFailureSpike`, `BulkExportAnomalous`, credential compromise, any suspected breach |
| **Severity** | **SEV-1** |
| **Owner** | Security Lead |
| **Expected duration** | Hours to days |
| **Last verified** | 2026-04-15, tabletop exercise |
| **Related** | [17 §17.11](../17-privacy-and-compliance.md), [16](../16-threat-model-stride.md), [14](../14-security-architecture.md) |

---

## 1. The governing instruction

**Declare first, investigate second.** For any suspicion of cross-tenant access or personal data exposure, declare a SEV-1 before confirming it. The containment actions available in the first ten minutes are far more effective than those available in the second hour, and the cost of a false alarm is a postmortem — the cost of a delayed declaration may be someone's safety ([26 §26.2.1](../26-reliability-and-incident-management.md)).

The data in this platform can endanger people. A beneficiary list reaching a hostile actor in a conflict setting is not a compliance event; it is a protection event. That framing governs every decision in this runbook.

## 2. Immediate actions — first 15 minutes

Do these before reading further.

| # | Action | Command |
| --- | --- | --- |
| 1 | **Declare SEV-1.** Page the Security Lead and Platform Lead | PagerDuty |
| 2 | Open a **dedicated, restricted** incident channel. Not the general one | Slack |
| 3 | Assign roles: Incident Commander, Operations, Communications, Scribe ([26 §26.4.2](../26-reliability-and-incident-management.md)) | — |
| 4 | **Start the evidence log.** Every observation and action, timestamped | — |
| 5 | Notify the DPO if personal data may be involved | — |
| 6 | **Do not** start changing things yet — see §4 | — |

## 3. Prerequisites

- Break-glass access, requested with the incident reference. Self-approval is permitted for a declared SEV-1.
- Grafana, Loki, and audit table read access.
- GCP audit log access.
- The Security Lead engaged, or the Platform Lead acting in that role.

## 4. Do not

- **Do not reboot, redeploy, or delete anything before evidence is preserved.** Restarting a compromised pod destroys the memory state and the process history that would identify what happened.
- **Do not investigate using the compromised path.** If a credential may be compromised, do not use it to look around.
- **Do not tell tenants "no data was accessed"** until you have evidence. An early reassurance that later proves wrong destroys more trust than the incident.
- **Do not discuss the incident outside the restricted channel**, including in the general engineering channel.
- **Do not delete logs, even noisy ones.** They are evidence.
- **Do not contact an attacker.** Escalate to the Executive Director.
- **Do not pay a ransom.** The decision is pre-made ([27 §27.7.2](../27-disaster-recovery-and-bcp.md)).
- **Do not notify beneficiaries directly** without protection advice. Notification can itself create risk by drawing attention to individuals.

## 5. Procedure

### 5.1 Classify

1. Identify which incident class this is, because containment differs:

| Class | Signal | Go to |
| --- | --- | --- |
| **Cross-tenant data access** | `CrossTenantAccessDetected`, isolation canary failure, a tenant reporting another's data | 5.2 |
| **PII egress to the LLM provider** | `PIIRedactionFailure` | 5.3 |
| **Audit tampering** | `AuditChainBroken` | 5.4 |
| **Credential compromise** | `AuthFailureSpike`, anomalous IAM activity, a leaked secret | 5.5 |
| **Data exfiltration** | `BulkExportAnomalous`, `PIIAccessAnomalous` | 5.6 |
| **Compromised workload** | Runtime drift, unexpected egress, unknown process | 5.7 |
| **Ransomware or destruction** | Encrypted objects, mass deletion | [RB-11](rb-11-backup-restore-drill.md) and [27 §27.7](../27-disaster-recovery-and-bcp.md) |
| **Reported vulnerability** | Researcher or pen test finding | 5.8 |

### 5.2 Cross-tenant data access — the most serious class

2. **Contain immediately.** Do this before confirming the extent:

```bash
# Stop bulk data leaving the platform.
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/flags/bulk_export_enabled" \
  -d '{"enabled":false,"reason":"SEV-1 <INC>"}'

# If a specific user or session is implicated, revoke it.
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/auth/sessions/revoke" -d '{"user_id":"<USER_ID>","reason":"<INC>"}'
```

3. Establish the mechanism. There are only a small number of ways this can happen, and the threat model enumerates them ([16](../16-threat-model-stride.md), TB-5):

```bash
# Was tenant context ever missing? This must always be zero.
curl -s "$PROM/api/v1/query?query=increase(ngois_db_rls_context_missing_total[24h])" | jq .

# Is RLS enabled and forced on every tenant-owned table?
psql "$DB_URL" -c "
  SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);"

# Can any service role bypass RLS?
psql "$DB_URL" -c "
  SELECT rolname, rolbypassrls FROM pg_roles
  WHERE rolname LIKE 'svc_%' AND rolbypassrls;"
```

**Expected:** zero, zero rows, zero rows. Any result identifies the mechanism.

4. The four candidate mechanisms, and how to distinguish them:

| Mechanism | Evidence | Notes |
| --- | --- | --- |
| **`SET` used instead of `SET LOCAL`** | Tenant context leaking between pooled connections; intermittent, hard to reproduce | The subtlest and most dangerous defect available in this architecture ([09 §9.7.3](../09-data-management-strategy.md)) |
| RLS not enabled on a new table | Step 3 query returns rows | Should have been blocked in CI ([22 §22.6](../22-cicd-release-supply-chain.md)) |
| An unprefixed Redis cache key | Cache returning another tenant's value | Check the key construction for the affected data |
| A missing tenant filter in an aggregate query | A report spanning tenants | Reporting queries are the usual location |

5. Determine the extent from the audit trail and access logs:

```bash
psql "$DB_URL" -c "
  SELECT actor_id, actor_tenant_id, entity_tenant_id, entity_type,
         action, occurred_at
  FROM audit_records
  WHERE actor_tenant_id IS DISTINCT FROM entity_tenant_id
    AND occurred_at > now() - interval '30 days'
  ORDER BY occurred_at DESC;"
```

**Expected in a healthy system:** zero rows, except legitimate `super_admin` platform operations. Any other row is a confirmed cross-tenant access with a named actor and timestamp.

6. Assess what data was involved and whose. Classification determines the response ([17 §17.2](../17-privacy-and-compliance.md)): Restricted beneficiary data is the worst case and is a protection matter, not merely a compliance one.

7. Fix the mechanism. If it is a code defect, this is a hotfix ([RB-10](rb-10-hotfix-deployment.md)) with mandatory Security Lead review.

8. Verify with the isolation canary and the full isolation suite before restoring bulk export.

### 5.3 PII egress to the LLM provider

9. Contain:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/flags/ai_insights_enabled" \
  -d '{"enabled":false,"reason":"SEV-1 <INC>"}'
```

**Expected:** the AI module is off platform-wide. Every workflow continues manually, so this costs nothing operationally ([18 §18.1](../18-ai-llm-architecture.md), AI-5).

10. Determine what egressed. Only a context **hash** is stored, never the context itself, so reconstruct from the request record and the sources it drew on:

```bash
psql "$DB_URL" -c "
  SELECT id, tenant_id, use_case, prompt_template, model_version,
         context_hash, created_at, redaction_result
  FROM ai_requests
  WHERE created_at > now() - interval '7 days'
  ORDER BY created_at DESC LIMIT 50;"
```

11. Identify which detector should have fired and did not. This is a test-corpus gap by definition, so add the case to the 400-fixture corpus immediately ([23 §23.10](../23-testing-strategy.md)).

12. Contact Anthropic to request deletion of the affected request content under the enterprise terms, and record the request and response.

13. Assess as a personal data breach ([17 §17.11](../17-privacy-and-compliance.md)). Note the mitigating fact if it applies: aggregates that passed k-anonymity are not personal data, so establish whether identifying content actually left rather than assuming the worst or the best.

14. Fix the detector, verify against the extended corpus, and only then re-enable the module.

### 5.4 Audit chain broken

15. The audit trail is hash-chained; a break means either corruption or deliberate tampering. Locate it:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/audit/verify-chain?from=<DATE>&detailed=true" | jq .
```

**Expected:** the first record where the chain fails, with its timestamp.

16. Preserve evidence before anything else:

```bash
pg_dump "$DB_URL" --table=audit_records \
  --where="occurred_at BETWEEN '<T1>' AND '<T2>'" \
  --file=/secure-evidence/audit-<INC>.sql
```

17. Distinguish corruption from tampering:

| Evidence | Interpretation |
| --- | --- |
| The break coincides with a restore or a failover | Likely a restore artefact. Verify against the pre-restore state |
| A break with no operational event, and rows missing | **Tampering.** Someone with database write access altered or deleted audit records |
| A break with rows present but hashes wrong | Tampering, or a defect in hash computation after a code change |

18. If tampering: review break-glass grants and session recordings for the window. Only a small number of identities can write to that table, and every session is recorded ([15 §15.6](../15-rbac-and-authorization.md)).

19. Escalate to the Executive Director. Audit integrity is a donor compliance obligation, and a confirmed gap must be disclosed in the next audit.

### 5.5 Credential compromise

20. **Revoke first, availability second.** Follow [RB-09](rb-09-secret-rotation.md) §5.7 — the emergency path.

21. Assess what the credential could reach:

```bash
gcloud logging read \
  'protoPayload.authenticationInfo.principalEmail="<PRINCIPAL>"' \
  --freshness=30d --limit=500 --format=json > /secure-evidence/iam-<INC>.json
```

22. Note the architectural mitigations when assessing exposure, because they materially bound it: service roles are `NOBYPASSRLS` and narrowly granted; PII is encrypted with per-tenant KMS keys so a database credential alone yields ciphertext; and most services have no internet egress at all ([21 §21.5.1](../21-deployment-and-infrastructure.md)).

23. If the JWT signing key is implicated, assume tokens may have been forged. Rotate, invalidate every session, and review the audit trail for actions in the window that do not correspond to a known session.

### 5.6 Data exfiltration

24. Contain:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/flags/bulk_export_enabled" \
  -d '{"enabled":false,"reason":"SEV-1 <INC>"}'

curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/auth/users/<USER_ID>/suspend" -d '{"reason":"<INC>"}'
```

25. Quantify. Purpose-logged PII access is what makes this answerable:

```bash
psql "$DB_URL" -c "
  SELECT actor_id, purpose, count(*) AS reads,
         min(occurred_at), max(occurred_at)
  FROM pii_access_log
  WHERE occurred_at > now() - interval '30 days'
  GROUP BY actor_id, purpose
  HAVING count(*) > 500
  ORDER BY reads DESC;"
```

26. Check exports and file downloads:

```bash
psql "$DB_URL" -c "
  SELECT id, tenant_id, requested_by, entity, row_count,
         created_at, downloaded_at, download_ip
  FROM data_exports
  WHERE created_at > now() - interval '30 days'
  ORDER BY row_count DESC LIMIT 30;"
```

27. Distinguish a compromised account from an insider. Both are serious; the response differs. Check login geography, device fingerprint, time-of-day pattern, and whether the access pattern matches the person's normal work.

28. **If an insider is suspected, involve the Executive Director before confronting anyone**, and preserve evidence carefully. This becomes an employment and possibly legal matter, and mishandled evidence is unusable.

### 5.7 Compromised workload

29. **Isolate without destroying evidence.** Do not delete the pod:

```bash
# Cut its network. It stays running and inspectable.
kubectl -n <NS> label pod <POD> quarantine=true --overwrite
kubectl apply -f - <<'EOF'
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: quarantine, namespace: <NS> }
spec:
  podSelector: { matchLabels: { quarantine: "true" } }
  policyTypes: [Ingress, Egress]
EOF
```

**Expected:** the pod is isolated with no ingress or egress, and remains available for forensics.

30. Preserve state:

```bash
kubectl -n <NS> logs <POD> --previous > /secure-evidence/<POD>-prev.log
kubectl -n <NS> logs <POD> > /secure-evidence/<POD>.log
kubectl -n <NS> describe pod <POD> > /secure-evidence/<POD>-describe.txt
```

31. Determine how code execution was obtained. The runtime is hardened — distroless, non-root, read-only root filesystem, no shell, no package manager ([22 §22.4.1](../22-cicd-release-supply-chain.md)) — so an attacker has very little to work with, and the entry path is the important question.

32. Check whether anything left. For most services the answer is structurally no, because they have no internet egress:

```bash
gcloud logging read \
  'resource.type="gce_subnetwork" AND jsonPayload.connection.src_ip="<POD_IP>"' \
  --freshness=7d --limit=200
```

33. Verify image integrity across the fleet — an attacker who deployed their own image would have had to defeat admission control:

```bash
kubectl get pods -A -o jsonpath='{range .items[*]}{.spec.containers[*].image}{"\n"}{end}' \
  | sort -u | grep -v '@sha256:'
```

**Expected:** no output. Any tag-based reference is a policy violation and a finding.

### 5.8 Reported vulnerability

34. Acknowledge to the reporter within 24 hours. Do not dismiss a report before reproducing it.
35. Reproduce in staging, never in production.
36. Assess severity per the threat model and the vulnerability response SLAs ([22 §22.8.2](../22-cicd-release-supply-chain.md)).
37. Remediate on the SLA, credit the reporter if they wish, and disclose to tenants if they were exposed.

## 6. Breach assessment and notification

38. The DPO owns this determination. A personal data breach is any accidental or unlawful destruction, loss, alteration, unauthorised disclosure of, or access to personal data.

39. Timeline ([17 §17.11.2](../17-privacy-and-compliance.md)):

| Time | Action |
| --- | --- |
| T+1h | Contained |
| T+4h | Assessed: what data, whose, how many, what risk |
| T+6h | DPO, Security Lead, Executive Director informed |
| T+24h | Affected tenants notified with facts and actions |
| T+72h | Regulator notified where GDPR or another regime applies |
| Without undue delay | Individuals, where there is high risk to their rights and freedoms |

40. **Beneficiary notification requires protection advice first.** Notifying a displaced person that their data may have been exposed may itself increase their risk by drawing attention to them. Consult the tenant's protection focal point. If individual notification would increase risk, record the decision not to notify individually, with the reasoning and the DPO's approval, and provide community-level information instead ([17 §17.11.3](../17-privacy-and-compliance.md)).

41. Tenant notification states: what happened, what data, whose, when, what we have done, what they should do, and what we will do next. **No speculation, and no reassurance that is not evidenced.**

## 7. Verification

42. The mechanism is identified and fixed, not merely contained.
43. The isolation suite and canary pass.
44. `ngois_db_rls_context_missing_total` is zero and remains zero.
45. RLS enabled and forced on every tenant-owned table.
46. No service role has `rolbypassrls`.
47. Audit chain verifies from a known-good point.
48. Every credential in scope rotated.
49. Every kill switch flipped for containment has been **turned back on**, with the underlying fix verified first.
50. Redaction corpus extended, if AI-related, and passing.
51. A test exists that would have caught this.
52. Evidence preserved and stored with restricted access.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Any confirmed cross-tenant data access | Executive Director **and** DPO immediately |
| Any confirmed personal data exposure | DPO; regulatory clock starts |
| Beneficiary data exposed | Executive Director, DPO, **and the tenant's protection focal point** |
| Audit tampering confirmed | Executive Director; possible employment or criminal matter |
| Insider threat suspected | Executive Director **before** any confrontation |
| Contact from an attacker | Executive Director; do not respond |
| Law enforcement involvement needed | Executive Director and legal counsel |
| Ransomware | [27 §27.7](../27-disaster-recovery-and-bcp.md); ransom is not paid |
| Beyond our capability | Engage an external incident response firm; the Executive Director authorises |

## 9. Follow-up

- **Postmortem within 5 working days**, blameless, with an external reviewer for any confirmed breach.
- Update the threat model ([16](../16-threat-model-stride.md)). A realised threat means the likelihood or the mitigation assessment was wrong.
- Add the detection that would have caught it sooner, if detection was late.
- Add the test that would have prevented it. Prefer making the failure **impossible** over making it detectable ([26 §26.6.4](../26-reliability-and-incident-management.md)).
- Regulatory and tenant reporting obligations closed out by the DPO.
- Retain evidence per the legal hold; do not let it age out of the log retention window.
- Review whether the incident indicates a control gap that affects other areas, not just the one that failed.
