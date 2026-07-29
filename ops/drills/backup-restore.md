# Backup restore drill record (stub template)

| Field | Value |
| --- | --- |
| Runbook | [RB-11](../../docs/sdd/runbooks/rb-11-backup-restore-drill.md) |
| Date | YYYY-MM-DD |
| Environment | staging |
| Conductor | |
| Result | pass / fail |
| RTO measured | |
| Erasure replay verified | yes / no |
| Notes | |

## Checklist (stub)

- [ ] Select backup / PITR timestamp
- [ ] Restore to isolated instance
- [ ] Verify row counts + audit chain
- [ ] Replay erasure tombstones
- [ ] Record outcome here and in the ops calendar
