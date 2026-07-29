# Regional failover drill record (stub template)

| Field | Value |
| --- | --- |
| Runbook | [RB-12](../../docs/sdd/runbooks/rb-12-region-failover.md) |
| Terraform stub | `infra/terraform/envs/dr` |
| Date | YYYY-MM-DD |
| Environment | staging DR |
| Conductor | |
| Result | pass / fail |
| RTO measured | |
| Data loss (RPO) | ≤ 5 min expected (async) |
| Notes | |

## Checklist (stub)

- [ ] Confirm extended primary-region failure criteria
- [ ] Promote warm DR (stub until infra applied)
- [ ] Redirect traffic / DNS
- [ ] Verify isolation + auth
- [ ] Record outcome
