# RB-09 — Secret Rotation, Planned and Emergency

| | |
| --- | --- |
| **ID** | RB-09 |
| **Applies to** | `SecretRotationOverdue`, scheduled rotation, or suspected credential compromise |
| **Severity** | Not an incident when planned. **SEV-1 when compromised** |
| **Owner** | Security Lead |
| **Expected duration** | 30 minutes planned; up to 2 hours emergency |
| **Last verified** | 2026-06-11, staging |
| **Related** | [20 §20.3](../20-configuration-secrets-feature-flags.md), [14 §14.8](../14-security-architecture.md) |

---

## 1. When this runs

Either the rotation schedule has come due, or a credential is believed to be exposed. The two paths differ in one crucial respect: **planned rotation prioritises availability, emergency rotation prioritises containment.** In an emergency you revoke first and accept the outage.

## 2. Prerequisites

- Break-glass Secret Manager access. Note that access to Secret Manager is itself alerted, which is expected during this procedure.
- Break-glass Kubernetes access.
- For a provider credential, access to that provider's console.
- For an emergency, an incident channel open and the Security Lead engaged.

## 3. Do not

- **Do not revoke the old credential before the new one is confirmed in use.** In a planned rotation this is the single most common cause of a self-inflicted outage. Use the overlap window.
- **Do not put a secret in a Git commit, a Slack message, a ticket, or a log line** at any point, including "temporarily".
- **Do not rotate more than one secret class at a time** in a planned rotation. If something breaks you need to know which change caused it.
- **Do not skip the verification step.** A rotation that half-succeeded leaves some pods on the old credential and fails when they restart, hours later, with no obvious cause.
- **Do not rotate the JWT signing key casually.** It invalidates sessions and forces every user to log in again.

## 4. Which secret

| Secret | Path | Overlap possible? |
| --- | --- | --- |
| Database service-role password | 5.1 | Yes — two passwords on one role |
| JWT signing key | 5.2 | Yes — overlapping `kid` |
| Per-tenant PII data key | 5.3 | Yes — key versioning |
| Redis AUTH | 5.4 | No — brief interruption |
| Third-party API key (SendGrid, Africa's Talking, Anthropic) | 5.5 | Provider-dependent |
| Mobile money credential | 5.5, with extra care | Provider-dependent |
| Bank webhook signing secret | 5.6 | Yes, coordinated |
| Suspected compromise, any secret | **5.7 first** | — |

## 5. Procedure

### 5.1 Database service-role password

1. Confirm the current state:

```bash
gcloud secrets versions list <SECRET_NAME> --limit=5 \
  --format="table(name,state,createTime)"
```

2. Generate and set a new password on the same role. PostgreSQL supports only one password per role, so the overlap is achieved by rotating in two stages with a `SCRAM` re-set rather than two live passwords; the mechanism is that connections already established remain valid:

```bash
NEW_PW=$(openssl rand -base64 36 | tr -d '/+=' | head -c 40)

psql "$ADMIN_DB_URL" -c "ALTER ROLE <SVC_ROLE> WITH PASSWORD '$NEW_PW';"
```

**Important:** existing pooled connections stay authenticated. New connections need the new password, so the secret must be updated promptly.

3. Add the new secret version:

```bash
printf '%s' "$NEW_PW" | gcloud secrets versions add <SECRET_NAME> --data-file=-
unset NEW_PW
```

4. Force External Secrets Operator to reconcile rather than waiting 15 minutes:

```bash
kubectl -n <NS> annotate externalsecret <ES_NAME> \
  force-sync=$(date +%s) --overwrite
kubectl -n <NS> get secret <K8S_SECRET> -o jsonpath='{.metadata.resourceVersion}'
```

5. Roll the consuming workloads, one service at a time:

```bash
kubectl -n <NS> rollout restart deploy/<SERVICE>
kubectl -n <NS> rollout status deploy/<SERVICE> --timeout=180s
```

**Expected:** readiness reports `database: ok` after each rollout. **Stop and investigate if any service fails readiness** — do not continue rolling the rest.

6. Roll PgBouncer last, since everything passes through it:

```bash
kubectl -n ngois-data rollout restart deploy/pgbouncer
kubectl -n ngois-data rollout status deploy/pgbouncer --timeout=180s
```

7. Verify no connection is failing authentication:

```bash
logcli query '{namespace=~"ngois-.*"} |= "password authentication failed"' --since=15m
```

**Expected:** no results.

8. Destroy the old secret version after 24 hours of stability:

```bash
gcloud secrets versions destroy <OLD_VERSION> --secret=<SECRET_NAME>
```

### 5.2 JWT signing key

The key is held in Cloud KMS and never exported. Rotation uses overlapping key identifiers so existing tokens remain verifiable.

9. Create a new key version:

```bash
gcloud kms keys versions create --key=jwt-signing --keyring=ngois \
  --location=<REGION> --primary
```

10. Publish both public keys in the JWKS, with distinct `kid` values, before switching signing:

```bash
curl -s "$API/.well-known/jwks.json" | jq '.keys[].kid'
```

**Expected:** both the old and new `kid` present. Verification accepts either; signing uses the new one.

11. Roll `auth-service` so it signs with the new key:

```bash
kubectl -n ngois-platform rollout restart deploy/auth-service
kubectl -n ngois-platform rollout status deploy/auth-service --timeout=180s
```

12. Wait out the access token lifetime plus a margin — **20 minutes** for a 15-minute token. Every token signed with the old key has now expired.

13. Remove the old key from the JWKS and disable the old KMS version:

```bash
gcloud kms keys versions disable <OLD_VERSION> --key=jwt-signing \
  --keyring=ngois --location=<REGION>
```

14. **No user is logged out** by this procedure when executed correctly, because refresh tokens are opaque and server-side. Verify by confirming session count did not drop on D-01.

### 5.3 Per-tenant PII data key

15. Data keys use envelope encryption, so rotation re-wraps data encryption keys without re-encrypting the data itself:

```bash
gcloud kms keys versions create --key=tenant-<TENANT_ID>-pii \
  --keyring=ngois-tenants --location=<REGION> --primary
```

16. **Old versions are never destroyed, only disabled after all ciphertext is re-wrapped.** Destroying a version makes historical data — including data in backups — permanently unreadable ([27 §27.3.1](../27-disaster-recovery-and-bcp.md)).

17. Trigger re-wrapping:

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/platform/tenants/<TENANT_ID>/rewrap-keys" | jq .
```

18. Verify decryption still works before disabling anything:

```bash
curl -s -H "Authorization: Bearer $TENANT_TOKEN" \
  "$API/v1/beneficiary/beneficiaries/<KNOWN_ID>" | jq '.data.first_name != null'
```

**Expected:** `true`. If decryption fails, **do not disable the old version** — escalate immediately.

### 5.4 Redis AUTH

19. Memorystore AUTH rotation causes a brief connection interruption; there is no overlap mechanism.

```bash
gcloud redis instances update <INSTANCE> --region=<REGION> \
  --auth-enabled
gcloud redis instances get-auth-string <INSTANCE> --region=<REGION>
```

20. Update the secret, force sync, and roll all consumers. Expect cache misses and a brief consumer lag spike; streams are durable so no events are lost.

21. Schedule this for the maintenance window unless it is an emergency.

### 5.5 Third-party API keys

22. Create the new key in the provider's console **before** revoking the old one. Most providers support multiple active keys, which gives a clean overlap.

23. Add the new secret version, force sync, roll `integration-service` or `ai-insights-service`.

24. Verify with a live call:

```bash
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/integration/providers/<PROVIDER>/health" | jq .
```

**Expected:** `status: ok`.

25. Revoke the old key in the provider console after 24 hours.

26. **Mobile money credentials warrant extra care.** They authorise financial operations. Rotate with the tenant's finance manager informed, outside any active disbursement window, and verify with a zero-value or status-only call rather than a transaction.

### 5.6 Bank webhook signing secret

27. This requires coordination with the bank, because they sign and we verify. Accept both the old and new secret during the transition:

```bash
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_TOKEN" \
  "$API/v1/integration/webhooks/bank/secrets" -d '{
    "accept_secrets": ["<OLD_REF>","<NEW_REF>"]
  }' | jq .
```

28. Confirm the bank has switched, verify a signed webhook validates against the new secret, then remove the old one. Never accept unsigned webhooks during the transition.

### 5.7 Emergency — suspected compromise

**Different priorities. Containment first; availability second.**

29. Declare a SEV-1 and open an incident. Engage the Security Lead.

30. **Revoke immediately.** Do not wait for a replacement to be ready:

| Secret | Revoke by |
| --- | --- |
| Database password | `ALTER ROLE ... WITH PASSWORD '<random>'` — services will fail readiness, which is acceptable |
| JWT signing key | Disable the KMS version. **Every session is invalidated and every user must re-authenticate.** Disruptive and correct |
| Third-party key | Revoke in the provider console |
| Service account key | `gcloud iam service-accounts keys delete` |
| CI credential | Revoke the OIDC binding; disable the workflow |

31. Assess the exposure window and what was accessible with it:

```bash
gcloud logging read \
  'protoPayload.authenticationInfo.principalEmail="<PRINCIPAL>"' \
  --freshness=30d --limit=200 --format=json > /tmp/access-review.json
```

For a database credential, review what the role could reach — a service role is `NOBYPASSRLS` and scoped, which bounds the exposure considerably.

32. Rotate to a new credential using the relevant path above, accepting the interruption.

33. **If a per-tenant PII data key may be compromised, treat it as a potential personal data breach** and follow [17 §17.11](../17-privacy-and-compliance.md) in parallel. Assess whether ciphertext was also accessible; a key alone with no data access is not a breach.

34. If the JWT signing key was compromised, assume tokens may have been forged. Review audit records for actions during the exposure window that do not correspond to a known session.

35. Continue with [RB-14](rb-14-security-incident.md) for the wider incident handling.

## 6. Verification

36. New secret version is `ENABLED` and is the one in use:

```bash
gcloud secrets versions list <SECRET_NAME> --limit=3 \
  --format="table(name,state,createTime)"
kubectl -n <NS> get secret <K8S_SECRET> \
  -o jsonpath='{.metadata.annotations}' | jq .
```

37. Every consuming service reports ready.
38. No authentication failures in the last 15 minutes across any namespace.
39. Synthetic journeys passing.
40. For a JWT rotation: session count unchanged, and a new login succeeds.
41. For a data key rotation: a sampled PII read decrypts correctly.
42. Old version destroyed or disabled per the schedule, **and not before the overlap window closed**.
43. Rotation recorded in the secret register with the date and the next due date.

## 7. Rollback

| Scenario | Rollback |
| --- | --- |
| Planned rotation, services failing | Re-enable the previous secret version and roll back the workloads. This is why the old version is retained for 24 hours |
| JWT rotation gone wrong | Re-enable the old KMS version; both keys in the JWKS again |
| Data key rotation gone wrong | **Never destroy the old version.** Re-enable it; decryption resumes |
| Emergency rotation | No rollback. The old credential is compromised and stays revoked |

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Any suspected compromise | Security Lead immediately, SEV-1 |
| PII data key decryption fails after rotation | Security Lead **and** Data Architect. **Do not disable the old version** |
| JWT rotation caused mass logouts unexpectedly | Platform Lead; the overlap was mishandled |
| A provider will not issue a second key, forcing a hard cutover | Platform Lead; schedule a maintenance window |
| Mobile money credential compromise | Security Lead, Executive Director, and the tenant's finance manager. Potential financial exposure |
| Unresolved after 2 hours | Platform Lead |

## 9. Follow-up

- Update the secret register: rotation date, next due date, who executed it.
- If a rotation caused an interruption, the action item is an overlap mechanism, not "be more careful next time".
- If rotation was overdue, find out why the automation did not fire.
- For any emergency rotation, a postmortem covering how the credential was exposed — the exposure path matters more than the rotation.
- Confirm the old version was actually destroyed. A retained compromised credential is the failure mode that makes the whole procedure pointless.
