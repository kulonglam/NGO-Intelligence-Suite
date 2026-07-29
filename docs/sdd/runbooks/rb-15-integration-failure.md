# RB-15 — External Integration Failure

| | |
| --- | --- |
| **ID** | RB-15 |
| **Applies to** | `CircuitBreakerOpen`, `IntegrationErrorRateHigh`, `FXRateStale`, provider outage |
| **Severity** | SEV-3 generally; **SEV-2 for FX staleness or mobile money during a disbursement window** |
| **Owner** | Platform Lead |
| **Expected duration** | 20–60 minutes |
| **Last verified** | 2026-05-13, staging with fault injection |
| **Related** | [12](../12-integration-architecture.md), [24 §24.2.6](../24-observability.md) |

---

## 1. Symptoms

- A circuit breaker open for more than 5 minutes.
- Per-provider error rate above 25 per cent for 10 minutes.
- FX rate age above 48 hours.
- Notifications not being delivered.
- IATI publication failing.
- Mobile money reconciliation not matching.

## 2. Impact

Every integration has a documented degradation behaviour, so a provider failure should never be an outage. Verify that it is behaving as designed rather than assuming it is:

| Provider | Designed degradation | Actual user impact |
| --- | --- | --- |
| SendGrid (email) | Queue up to 24 h, then drop with a log | Notifications delayed. In-app notifications still work |
| Africa's Talking (SMS) | Queue; critical alerts fall back to email | SMS delayed |
| MTN / Airtel (mobile money) | Manual reconciliation | Payment status not auto-updated. **Financial process affected** |
| Bank webhooks | Inbound; we cannot retry their delivery | Transfer confirmations missing until they resend |
| **FX rate source** | Last known rate retained, age tracked | **Payroll conversion uses a stale rate. Silently wrong figures** |
| IATI registry | Queue, publish later | Transparency commitment delayed. No user impact |
| Anthropic | Circuit opens, feature unavailable | AI drafting unavailable. Nothing else |
| Tenant OIDC | Fall back to platform authentication | That tenant's SSO users cannot log in via SSO |

**FX staleness is the one to take seriously.** Every other failure is visibly degraded; a stale exchange rate produces payroll and financial figures that look completely normal and are wrong.

## 3. Prerequisites

- Grafana (D-11, Integrations).
- Break-glass Kubernetes read.
- The provider's status page and support contact.
- For mobile money or banking, the tenant's finance manager contactable.

## 4. Do not

- **Do not force a circuit breaker closed** while the provider is still failing. The breaker is protecting our thread pool and the provider's recovery; forcing it open again produces a retry storm.
- **Do not retry a financial operation without checking idempotency.** A duplicated mobile money transaction is a real financial loss.
- **Do not accept an unsigned webhook** to work around a signature failure. That is an authentication bypass.
- **Do not enter an FX rate yourself.** It is a tenant financial decision, recorded against a named approver.
- **Do not disable a provider integration permanently** as a workaround. Use the kill switch, which is visible and reviewable.
- **Do not paper over a provider contract change.** If a provider changed their API, that needs a code change, not a retry.

## 5. Procedure

### 5.1 Identify and confirm

1. Establish which provider and what the breaker is doing:

```bash
curl -s "$PROM/api/v1/query?query=ngois_integration_circuit_state" | \
  jq -r '.data.result[] | "\(.metric.provider) \(.value[1])"'
# 0 closed, 1 half-open, 2 open
```

2. Confirm it is them and not us:

```bash
# Our view of their errors
curl -s "$PROM/api/v1/query?query=sum(rate(ngois_integration_requests_total{provider=\"<P>\",result=\"error\"}[10m]))by(operation)" | jq .

# Their status page
open <PROVIDER_STATUS_URL>

# Direct reachability from the integration service
kubectl -n ngois-platform exec deploy/integration-service -- \
  wget -qS -O /dev/null "https://<PROVIDER_HOST>/<HEALTH_PATH>" 2>&1 | head -5
```

3. Rule out our side first, because it is cheap to check and embarrassing to miss:

| Check | Command | Expected |
| --- | --- | --- |
| Egress allowed | `kubectl -n ngois-platform get networkpolicy integration-service -o yaml` | The provider host or CIDR present |
| DNS resolves | `kubectl -n ngois-platform exec deploy/integration-service -- nslookup <HOST>` | Resolves |
| Credential valid | `curl -s "$API/v1/integration/providers/<P>/health"` | `status: ok` |
| NAT IP unchanged | `gcloud compute addresses list --filter="purpose=NAT"` | Matches what the provider has allow-listed |

A recently changed static NAT IP is a common and easily-missed cause: the provider's allow-list no longer contains us.

4. Route by provider class:

| Class | Go to |
| --- | --- |
| Email or SMS | 5.2 |
| Mobile money | 5.3 |
| Bank webhooks | 5.4 |
| **FX rate** | 5.5 |
| IATI | 5.6 |
| Anthropic | 5.7 |
| Tenant OIDC | 5.8 |

### 5.2 Email or SMS

5. Check the queue and the age of the oldest item:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/notification/queue-status" | jq .
```

**Expected:** depth and oldest age. Messages are held 24 hours before being dropped.

6. If the provider is down, no action is required beyond monitoring — the queue is the designed behaviour. Confirm the queue is not growing without bound and that memory is fine.

7. If the queue will exceed the 24-hour window, use the kill switch to stop accumulating and record what will be dropped:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/flags/email_notifications_enabled" \
  -d '{"enabled":false,"reason":"provider outage <INC>"}'
```

8. Check whether any **critical** notification is affected — a payroll approval request, a grant deadline warning, a security alert. If so, notify the recipients by another route manually. The fallback exists in code for SMS-to-email, but a prolonged dual failure needs a human.

9. If it is a credential or quota problem rather than an outage:

```bash
logcli query '{service="integration-service"} |= "<PROVIDER>" | json | level="error"' --since=1h
```

A 401 means rotate ([RB-09](rb-09-secret-rotation.md) §5.5). A 429 or quota message means the account limit is reached — a commercial matter, escalate to the Platform Lead.

### 5.3 Mobile money

10. **Establish whether any payment is in an uncertain state.** This is the priority, ahead of restoring the integration:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT id, provider, provider_reference, amount, currency,
         status, initiated_at, last_checked_at
  FROM payment_transactions
  WHERE status IN ('pending','unknown')
    AND initiated_at > now() - interval '7 days'
  ORDER BY initiated_at;"
```

**Expected in health:** no rows in `unknown`. Any `unknown` row is money whose fate we cannot currently determine.

11. **Never re-initiate a payment in `pending` or `unknown` state.** Query its status; do not resend it:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/integration/payments/<TXN_ID>/reconcile" | jq .
```

**Expected:** the provider's authoritative status. If the provider is unreachable, the transaction stays `unknown` until they return — which is the correct state, because guessing is how money gets sent twice.

12. Use the kill switch to stop polling while the provider is down:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/platform/flags/mobile_money_reconciliation_enabled" \
  -d '{"enabled":false,"reason":"provider outage <INC>"}'
```

13. **Notify the tenant's finance manager.** They may need to verify payments through the provider's own portal, and they must know that platform status is not authoritative right now.

14. On recovery, re-enable and run a full reconciliation:

```bash
curl -s -X POST -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/integration/payments/reconcile-all" \
  -d '{"tenant_id":"<TENANT_ID>","since":"<DATE>"}' | jq .
```

15. Verify every previously-`unknown` transaction resolved to a definite state, and that no duplicate exists:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT provider_reference, count(*), sum(amount)
  FROM payment_transactions
  WHERE initiated_at > now() - interval '7 days'
  GROUP BY provider_reference HAVING count(*) > 1;"
```

**Expected:** zero rows. Any duplicate is a financial incident — escalate immediately.

### 5.4 Bank webhooks

16. Inbound, so we cannot retry their delivery. Establish whether they stopped sending or we stopped accepting:

```bash
logcli query '{service="integration-service"} |= "webhook" |= "bank"' --since=6h
psql "$DB_URL" -c "
  SELECT max(received_at), count(*)
  FROM webhook_deliveries
  WHERE source = 'bank' AND received_at > now() - interval '24 hours';"
```

17. If signature verification is failing, the signing secret has changed on their side. **Do not accept unsigned webhooks.** Coordinate the secret change per [RB-09](rb-09-secret-rotation.md) §5.6.

18. If they stopped sending, contact the bank and request redelivery. Meanwhile, transfer confirmations can be entered manually by the tenant's finance manager, with the source marked.

### 5.5 FX rate stale — treat seriously

19. Establish the age and what depends on it:

```bash
psql "$DB_URL" -c "
  SELECT pair, rate, rate_date, source, fetched_at,
         now() - fetched_at AS age
  FROM fx_rates
  WHERE pair IN ('USD/SSP','USD/UGX')
  ORDER BY pair, rate_date DESC;"
```

20. **The risk is silent incorrectness.** A stale rate produces payroll conversions, grant burn-rate figures and financial reports that look entirely normal and are wrong. In a high-inflation currency environment, a rate 48 hours old can be materially off.

21. Check whether a payroll run is imminent or in progress:

```bash
psql "$DB_URL" -c "
  SET LOCAL app.current_tenant = '<TENANT_ID>';
  SELECT id, pay_period_end, country_code, status, exchange_rate,
         exchange_rate_date
  FROM tenant_<TENANT_SLUG>.payroll_runs
  WHERE status IN ('draft','computing','pending_approval')
  ORDER BY pay_period_end;"
```

**If a run is pending approval with a stale rate, tell the finance manager before they approve it.** Once approved, payslips are issued and statutory returns follow.

22. Diagnose the feed. It is usually a central bank endpoint changing format or moving:

```bash
kubectl -n ngois-platform logs deploy/integration-service --tail=200 | grep -i fx
kubectl -n ngois-platform exec deploy/integration-service -- \
  wget -qO- "<FX_SOURCE_URL>" | head -20
```

23. If the source format changed, that is a code change, not a retry. Raise it as a defect; a parser change here is a hotfix candidate because the consequence is wrong financial figures.

24. Meanwhile the tenant's `finance_manager` may enter a manual rate override with a recorded reason and source. **The platform team does not enter the rate** — it is a financial decision with an audit trail and a named approver.

25. Notify every affected tenant that rates are stale and by how much. This is the notification most likely to prevent a real error.

### 5.6 IATI publication

26. Lowest urgency in this runbook: publication is queued and retried, with no user impact.

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/integration/iati/queue" | jq .
```

27. If the registry is rejecting our XML rather than being unavailable, that is a validation problem:

```bash
logcli query '{service="integration-service"} |= "iati" | json | level="error"' --since=24h
```

28. **Before republishing anything, confirm the exclusion policy is intact** ([12 §12.4.3](../12-integration-architecture.md)). IATI publication is public and permanent. A defect that caused excluded data — beneficiary-level records, precise coordinates, small-cohort aggregates — to be published is a **SEV-1 protection incident**, not an integration problem, and goes to [RB-14](rb-14-security-incident.md).

29. Verify what was actually published:

```bash
curl -s "https://iatiregistry.org/api/3/action/package_show?id=<PUBLISHER_ID>" | jq .
```

30. Use the kill switch if publication must pause while a defect is fixed.

### 5.7 Anthropic

31. Confirm the degradation is clean — the AI module unavailable and nothing else:

```bash
curl -s "$PROM/api/v1/query?query=ngois_integration_circuit_state{provider=\"anthropic\"}" | jq .
curl -s -H "Authorization: Bearer $BG_TOKEN" "$API/v1/ai/health" | jq .
```

32. Verify no core workflow is affected. If any workflow is blocked by the AI module being unavailable, that violates rule AI-5 and is a design defect ([18 §18.1](../18-ai-llm-architecture.md)) — raise it.

33. If it is a budget rejection rather than a provider failure, that is working as designed; the tenant needs to know their budget is exhausted ([18 §18.10](../18-ai-llm-architecture.md)).

34. Use the kill switch if the provider is flapping, so users see a clear unavailable state rather than intermittent failures.

### 5.8 Tenant OIDC

35. Confirm the fallback works — those users should be able to authenticate with platform credentials:

```bash
curl -s -H "Authorization: Bearer $BG_TOKEN" \
  "$API/v1/auth/tenants/<TENANT_ID>/idp-status" | jq .
```

36. Diagnose: expired IdP signing certificate, changed discovery document, clock skew, or a changed client secret. The tenant's IT contact owns most of these.

37. Notify the tenant with the specific cause. "Your identity provider's signing certificate expired on <date>" is actionable; "SSO is broken" is not.

## 6. Verification

38. Circuit breaker closed:

```bash
curl -s "$PROM/api/v1/query?query=ngois_integration_circuit_state{provider=\"<P>\"}" | jq -r '.data.result[0].value[1]'
```

**Expected:** `0`.

39. Error rate at baseline; latency normal on D-11.
40. Queues drained — notifications delivered, IATI published, payments reconciled.
41. **No duplicate financial transactions** (step 15).
42. FX rate age under 24 hours, and any run computed on a stale rate identified and reviewed with the tenant.
43. **Every kill switch flipped is turned back on**, and the deferred work has caught up:

```bash
for f in email_notifications_enabled sms_notifications_enabled \
         mobile_money_reconciliation_enabled iati_publishing_enabled \
         ai_insights_enabled; do
  curl -s -H "Authorization: Bearer $BG_TOKEN" "$API/v1/platform/flags/$f" \
    | jq -r "\"$f: \(.enabled)\""
done
```

**All should read `true`** unless one is deliberately off pending a fix, in which case it has a ticket.

44. Affected tenants notified of resolution.

## 7. Rollback

Integration changes are configuration rather than code, so reverting is straightforward. If a credential rotation caused the failure, revert to the previous secret version ([RB-09](rb-09-secret-rotation.md) §7).

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Any duplicate financial transaction | Platform Lead, Executive Director, tenant finance manager. Financial incident |
| A payment stuck `unknown` over 24 hours | Platform Lead and the provider's support |
| FX stale over 48 h with a payroll run pending | Platform Lead **and** the tenant's finance manager |
| Excluded data published to IATI | Security Lead, DPO, Executive Director. **SEV-1 protection incident**, [RB-14](rb-14-security-incident.md) |
| A provider changed their API without notice | Platform Lead; likely a hotfix |
| Provider outage over 8 hours | Platform Lead; tenant communication about manual workarounds |
| A core workflow blocked by an AI provider failure | Chief Architect; this violates a design rule |
| Provider account suspended or quota exhausted | Platform Lead; commercial matter |

## 9. Follow-up

- If the degradation did not behave as documented, correct either the documentation or the code — the mismatch is the finding.
- If an integration lacked a kill switch, add one.
- If a provider contract change caused it, add a nightly sandbox contract check so the next change is detected before it breaks production ([23 §23.5](../23-testing-strategy.md)).
- If FX staleness affected a computed run, the tenant may need to reverse and re-run. Support them through it.
- Review the resilience configuration — timeout, retry, breaker thresholds — against what actually happened ([12 §12.3](../12-integration-architecture.md)).
- Confirm every kill switch is back on. A switch left off silently degrades the product for weeks.
