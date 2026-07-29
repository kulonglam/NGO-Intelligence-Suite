# RB-04 — Certificate Rotation and Expiry Recovery

| | |
| --- | --- |
| **ID** | RB-04 |
| **Applies to** | `CertificateExpiringSoon`, TLS handshake failures, private CA root rotation |
| **Severity** | SEV-3 when expiring; **SEV-1 when expired** |
| **Owner** | Platform Lead |
| **Expected duration** | 20–45 minutes |
| **Last verified** | 2026-03-18, staging |
| **Related** | [21 §21.8](../21-deployment-and-infrastructure.md), [14 §14.4](../14-security-architecture.md) |

---

## 1. Symptoms

- `CertificateExpiringSoon` at under 21 days (P4) or under 7 days (P2).
- Service-to-service calls failing with `certificate has expired` or `unable to verify`.
- Browser TLS warnings on the public endpoint or a tenant custom domain.
- `cert-manager` logs showing failed renewals.

## 2. Impact

| Certificate | Effect if expired |
| --- | --- |
| Public edge (Cloudflare) | Users cannot reach the platform; browser security warnings. Total outage |
| Load balancer (Google-managed) | Same |
| **Internal mTLS** | **Total internal outage.** Every service-to-service call fails, and the failure signature is confusing because the database and Redis look healthy |
| Tenant custom domain | That tenant cannot reach the platform on their domain; the default domain still works |
| Private CA root | Every internal certificate becomes untrusted. The worst case in this runbook |

An expired internal certificate is one of the most common causes of self-inflicted total downtime in the industry, which is why the alert fires 21 days early.

## 3. Prerequisites

- Break-glass Kubernetes access.
- `cert-manager` visibility in `ngois-system`.
- Cloudflare access for edge certificates.
- GCP console for Google-managed and CA Service certificates.

## 4. Do not

- **Do not disable TLS verification "temporarily".** It converts a certificate problem into a security incident, and it is very rarely reverted.
- **Do not delete a `Certificate` resource** hoping cert-manager will recreate it cleanly; you may lose the private key and invalidate more than you intended. Delete the `CertificateRequest` instead.
- **Do not rotate the private CA root during an incident.** It is a planned, staged operation.
- **Do not issue a self-signed certificate as a stopgap.** Nothing will trust it, and admission and mTLS policies will reject it.

## 5. Procedure

### 5.1 Identify which certificate

1. Enumerate every managed certificate and its expiry:

```bash
kubectl get certificates -A \
  -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,READY:.status.conditions[0].status,EXPIRY:.status.notAfter'
```

**Expected:** all `READY=True` with expiry more than 30 days out.

2. Check the edge and load balancer separately, since they are not cert-manager managed:

```bash
echo | openssl s_client -servername app.ngointelligence.org \
  -connect app.ngointelligence.org:443 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

gcloud compute ssl-certificates list \
  --format="table(name,type,managed.status,expireTime)"
```

3. Route by certificate type:

| Type | Go to |
| --- | --- |
| Internal mTLS, cert-manager, not yet expired | 5.2 |
| Internal mTLS, **already expired** | 5.3 |
| Tenant custom domain (ACME) | 5.4 |
| Public edge / load balancer | 5.5 |
| Private CA root | 5.6 |

### 5.2 Internal certificate renewal failing, not yet expired

4. Inspect the failing certificate:

```bash
kubectl -n <NS> describe certificate <NAME>
kubectl -n <NS> get certificaterequests
kubectl -n ngois-system logs -l app=cert-manager --tail=200 | grep -i <NAME>
```

5. Common causes:

| Cause | Signature | Fix |
| --- | --- | --- |
| CA Service issuer unreachable | `failed to request certificate` with a permission or network error | Check the issuer's service account and the egress network policy |
| Issuer misconfigured | `Issuer not ready` | Compare against the working issuer in another namespace |
| CA pool exhausted or disabled | GCP CA Service status | Re-enable, or escalate |
| Clock skew on the node | `certificate is not yet valid` | Node-level NTP problem; drain the node |
| Rate limited | `too many certificates` | Wait; do not retry in a loop |

6. Force a renewal once the cause is fixed:

```bash
kubectl -n <NS> delete certificaterequest -l cert-manager.io/certificate-name=<NAME>
kubectl cert-manager renew <NAME> -n <NS>   # if the plugin is available
```

**Expected:** a new `CertificateRequest` reaching `Ready`, and `.status.notAfter` moving to roughly 90 days out.

7. Restart the consuming workloads if they do not reload certificates from disk:

```bash
kubectl -n <NS> rollout restart deploy/<SERVICE>
kubectl -n <NS> rollout status deploy/<SERVICE> --timeout=180s
```

8. Go to §6.

### 5.3 Internal certificate already expired — SEV-1

The confusing case. Services are running, probes may partially pass, and every inter-service call fails.

9. Confirm the signature:

```bash
logcli query '{namespace="ngois-core"} |= "certificate" |= "expired"' --since=30m
```

10. Renew as in 5.2 steps 4–6. If cert-manager itself cannot issue because its own credentials expired, that is the root cause — check `ngois-system` first.

11. **Restart in dependency order**, not all at once, so that a service does not come up and immediately fail against a peer still holding an expired certificate:

```bash
# Data tier first, then platform, then core, then edge.
kubectl -n ngois-data     rollout restart deploy/pgbouncer
kubectl -n ngois-platform rollout restart deploy/auth-service deploy/tenant-service
kubectl -n ngois-core     rollout restart deploy --selector='tier=core'
kubectl -n ngois-edge     rollout restart deploy/api-gateway
```

**Expected:** each rollout completes before starting the next. Watch readiness between steps.

12. Go to §6.

### 5.4 Tenant custom domain

13. Check the ACME challenge state:

```bash
kubectl -n ngois-edge get certificate <TENANT>-domain -o yaml | \
  grep -A20 'status:'
kubectl -n ngois-edge get challenges
```

14. Almost always a DNS problem on the tenant's side:

| Cause | Fix |
| --- | --- |
| The tenant changed or removed their CNAME | Contact the tenant; the record must point at our endpoint |
| DNS propagation incomplete | Wait; verify with `dig` |
| CAA record blocking the ACME CA | The tenant must add or correct the CAA record |
| Domain expired | The tenant must renew it |

15. Verify the record:

```bash
dig +short CNAME <TENANT_DOMAIN>
dig +short CAA <TENANT_DOMAIN>
```

16. Only that tenant is affected, and their default `*.ngointelligence.org` address still works. Tell them that, so they have a route back in while DNS is corrected.

### 5.5 Public edge or load balancer

17. Cloudflare certificates are auto-managed; a failure is almost always a Cloudflare-side issue or a zone configuration change. Check the Cloudflare dashboard for the certificate status and any recent zone change.

18. Google-managed load balancer certificates:

```bash
gcloud compute ssl-certificates describe <CERT> \
  --format="value(managed.status,managed.domainStatus)"
```

**Expected:** `ACTIVE`. A `FAILED_NOT_VISIBLE` status means DNS does not resolve to the load balancer.

19. If the edge certificate is broken and cannot be fixed quickly, the documented fallback is to bypass Cloudflare and point DNS directly at the GCP load balancer, accepting the loss of WAF and CDN ([27 §27.10.1](../27-disaster-recovery-and-bcp.md)). This is a Platform Lead decision, and the WAF loss must be recorded and time-boxed.

### 5.6 Private CA root rotation — planned only

**Not an incident procedure.** The root has a 10-year lifetime; rotation is planned months ahead.

20. Create a new root in CA Service and add it to the trust bundle **alongside** the existing root.
21. Distribute the updated trust bundle to every workload and restart in dependency order.
22. Verify every service trusts both roots.
23. Switch the issuer to the new root; leaf certificates begin issuing from it as they renew, over 90 days.
24. Once every leaf has rotated, remove the old root from the trust bundle.
25. Never shorten this sequence. Removing the old root before every leaf has rotated is a total internal outage.

## 6. Verification

26. Every certificate `READY=True` with expiry beyond 60 days:

```bash
kubectl get certificates -A \
  -o custom-columns='NS:.metadata.namespace,NAME:.metadata.name,READY:.status.conditions[0].status,EXPIRY:.status.notAfter'
```

27. Public endpoint chain valid:

```bash
echo | openssl s_client -servername app.ngointelligence.org \
  -connect app.ngointelligence.org:443 -verify_return_error 2>&1 | tail -5
```

**Expected:** `Verify return code: 0 (ok)`.

28. Internal mTLS working — no certificate errors in the last 10 minutes:

```bash
logcli query '{namespace=~"ngois-.*"} |= "certificate"' --since=10m
```

29. Synthetic journeys passing; gateway error rate at baseline.
30. `CertificateExpiringSoon` cleared in Alertmanager.

## 7. Rollback

Certificate issuance is additive; a new certificate does not invalidate the old one until it is removed from the trust store. If a renewal produces a certificate that workloads reject, revert the consuming deployment to the previous configuration and investigate before retrying.

## 8. Escalation

| Condition | Escalate to |
| --- | --- |
| Internal certificate expired and renewal fails | Platform Lead **and** Security Lead, SEV-1 |
| Private CA unavailable | Platform Lead; open a GCP support case |
| Public edge certificate cannot be restored within 30 min | Platform Lead **and** Executive Director; consider the Cloudflare bypass |
| Any suggestion of a certificate being issued that we did not request | Security Lead immediately; [RB-14](rb-14-security-incident.md) |
| Unresolved after 45 minutes | Platform Lead |

## 9. Follow-up

- If a certificate reached expiry, that is a **monitoring failure as much as a certificate failure** — the 21-day alert should have prevented it. Investigate why it did not, or why it was ignored.
- Confirm automated renewal is working, not just that this certificate is fixed.
- If a tenant domain, add a check to the onboarding process so the tenant understands their DNS responsibility.
- Postmortem for any expiry-caused outage.
