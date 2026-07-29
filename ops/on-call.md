# On-call rotation (stub)

| Field | Value |
| --- | --- |
| Primary | TBD — Platform Lead until roster filled |
| Secondary | TBD |
| Schedule | Weekly, Monday 09:00 Africa/Johannesburg |
| Pager | PagerDuty service `ngois-platform` (not provisioned) |
| Escalation | Primary → Secondary → Platform Lead → Security Lead (P1 security alerts) |

## Expectations

- Acknowledge P1 within 15 minutes.
- Every page links to a runbook in `docs/sdd/runbooks/`.
- More than two pages per on-call week triggers an alert-quality review (SDD §24.7).

## Handover checklist (stub)

1. Open incidents and silenced alerts with expiry.
2. Deployments in flight.
3. Backup / DR drill status.
4. Known degradations.
