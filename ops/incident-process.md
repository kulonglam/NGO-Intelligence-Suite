# Incident process (stub)

Aligned with SDD [26](../docs/sdd/26-reliability-and-incident-management.md) and [RB-14](../docs/sdd/runbooks/rb-14-security-incident.md).

## Severity

| SEV | Meaning | Response |
| --- | --- | --- |
| SEV-1 | Cross-tenant risk, data loss, platform down | Page immediately; declare first for security |
| SEV-2 | Tier-1 degraded, SLO fast burn | Page working hours; ticket overnight |
| SEV-3 | Partial degradation | Ticket |
| SEV-4 | Cosmetic / early warning | Ticket |

## Declare first (security)

For `CrossTenantAccessDetected`, `PIIRedactionFailure`, `AuditChainBroken`, or any suspected breach: **declare SEV-1 before confirming**. Containment before investigation (RB-14).

## Channels (stub)

| Channel | Use |
| --- | --- |
| `#ngois-incidents` | Working channel |
| PagerDuty | Pages |
| Status page | External (not provisioned) |

## After-action

Postmortem within 5 business days for SEV-1/2. Alert + runbook review mandatory.
